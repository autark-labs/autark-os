#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT
architecture="$(dpkg --print-architecture)"
baseline="2.36"
[[ "${architecture}" != arm64 ]] || baseline="2.31"

python3 "${repo_root}/scripts/tests/create-release-test-jar.py" \
  --output "${tmp_dir}/backend.jar" --version 0.0.0-glibc-test --build-sha glibc-test
mkdir -p "${tmp_dir}/runtime/bin" "${tmp_dir}/runtime/lib"
printf 'int runtime_dependency(void) { return 0; }\n' >"${tmp_dir}/provider.c"
printf 'extern int runtime_dependency(void); int main(void) { return runtime_dependency(); }\n' >"${tmp_dir}/consumer.c"

build_runtime_fixture() {
  # Link real ELF version requirements. The provider stays outside the runtime:
  # this models a system library dependency, not a string embedded in a file.
  printf 'GLIBC_%s { global: runtime_dependency; };\n' "$1" >"${tmp_dir}/versions.map"
  cc -shared -fPIC "${tmp_dir}/provider.c" \
    -Wl,--version-script="${tmp_dir}/versions.map" \
    -o "${tmp_dir}/libprovider.so"
  cc -shared -fPIC "${tmp_dir}/consumer.c" "${tmp_dir}/libprovider.so" \
    -o "${tmp_dir}/runtime/lib/libdependency.so"
  # Keep the launcher independent so the rejection must inspect shared libraries.
  printf 'int main(void) { return 0; }\n' | cc -nostdlib -static -Wl,-e,main -x c - -o "${tmp_dir}/runtime/bin/java"
  cp "${tmp_dir}/runtime/bin/java" "${tmp_dir}/runtime/bin/keytool"
  cp "${tmp_dir}/runtime/bin/java" "${tmp_dir}/runtime/lib/jexec"
  cp "${tmp_dir}/runtime/bin/java" "${tmp_dir}/runtime/lib/jspawnhelper"
}

bundle() {
  AUTARK_OS_RUNTIME_DIR="${tmp_dir}/runtime" \
    AUTARK_OS_BACKEND_JAR="${tmp_dir}/backend.jar" \
    "${repo_root}/scripts/build-release-bundle.sh" --skip-build \
      --version 0.0.0-glibc-test --build-sha glibc-test \
      --architecture "${architecture}" --output-dir "${tmp_dir}/$1"
}

build_runtime_fixture 999.0
if bundle rejected >"${tmp_dir}/rejected.log" 2>&1; then
  printf 'Expected an incompatible runtime library to fail packaging.\n' >&2
  exit 1
fi
grep -q 'lib/libdependency.so requires glibc 999.0' "${tmp_dir}/rejected.log"
grep -q "declared host baseline is ${baseline}" "${tmp_dir}/rejected.log"
[[ ! -e "${tmp_dir}/rejected/autark-os-release.env" ]]

build_runtime_fixture "${baseline}"
bundle accepted >"${tmp_dir}/accepted.log" 2>&1 || { cat "${tmp_dir}/accepted.log" >&2; exit 1; }
[[ -f "${tmp_dir}/accepted/autark-os-release.env" ]]
printf 'Runtime ELF glibc compatibility checks passed.\n'
