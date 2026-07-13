#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
fake_jar="${repo_root}/backend/build/libs/autark-os-backend-architecture-integrity-test.jar"
trap 'rm -rf "${tmp_dir}"; rm -f "${fake_jar}"' EXIT
mkdir -p "$(dirname "${fake_jar}")"
printf 'fake backend jar for architecture integrity test\n' >"${fake_jar}"

host_architecture="$(dpkg --print-architecture)"
case "${host_architecture}" in
  amd64) other_architecture="arm64" ;;
  arm64) other_architecture="amd64" ;;
  *)
    printf 'Unsupported test host architecture: %s\n' "${host_architecture}" >&2
    exit 1
    ;;
esac

wrong_build_output="${tmp_dir}/wrong-build.out"
if "${repo_root}/scripts/build-release-bundle.sh" \
  --dry-run \
  --skip-build \
  --version 0.0.0-architecture-test \
  --architecture "${other_architecture}" \
  --output-dir "${tmp_dir}/wrong-build" >"${wrong_build_output}" 2>&1; then
  printf 'Expected a cross-architecture bundle build to fail.\n' >&2
  exit 1
fi
grep -q "Cannot build ${other_architecture} release artifacts on ${host_architecture}" "${wrong_build_output}"
[[ ! -e "${tmp_dir}/wrong-build" ]]

runtime_source="${tmp_dir}/runtime-source"
fake_bin="${tmp_dir}/fake-bin"
mkdir -p "${runtime_source}/bin" "${fake_bin}"
cp "$(readlink -f "$(command -v java)")" "${runtime_source}/bin/java"
chmod +x "${runtime_source}/bin/java"
cat >"${fake_bin}/file" <<FILE
#!/usr/bin/env bash
printf '%s\n' 'ELF 64-bit LSB executable, $([[ "${other_architecture}" == "arm64" ]] && printf 'ARM aarch64' || printf 'x86-64')'
FILE
chmod +x "${fake_bin}/file"

wrong_runtime_output="${tmp_dir}/wrong-runtime.out"
if PATH="${fake_bin}:${PATH}" AUTARK_OS_RUNTIME_DIR="${runtime_source}" \
  "${repo_root}/scripts/build-release-bundle.sh" \
  --skip-build \
  --version 0.0.0-runtime-test \
  --architecture "${host_architecture}" \
  --output-dir "${tmp_dir}/wrong-runtime" >"${wrong_runtime_output}" 2>&1; then
  printf 'Expected a mismatched bundled Java runtime to fail.\n' >&2
  exit 1
fi
grep -q "Bundled Java runtime is ${other_architecture}, but this artifact is declared ${host_architecture}" "${wrong_runtime_output}"
[[ ! -f "${tmp_dir}/wrong-runtime/autark-os-release.env" ]]

bundle_dir="${tmp_dir}/bundle"
mkdir -p "${bundle_dir}/backend" "${bundle_dir}/runtime/bin"
printf 'fake backend jar\n' >"${bundle_dir}/backend/autark-os-backend.jar"
cp "$(readlink -f "$(command -v java)")" "${bundle_dir}/runtime/bin/java"
chmod +x "${bundle_dir}/runtime/bin/java"
cat >"${bundle_dir}/autark-os-release.env" <<ENV
AUTARK_OS_VERSION=0.0.0-architecture-test
AUTARK_OS_ARTIFACT_ARCHITECTURE=${host_architecture}
AUTARK_OS_RUNTIME_ARCHITECTURE=${host_architecture}
AUTARK_OS_SUPPORTED_HOST_POLICY_VERSION=2
ENV

os_fixture="${tmp_dir}/os-release"
case "${other_architecture}" in
  amd64) printf 'ID=debian\nVERSION_ID="13"\nPRETTY_NAME="Debian 13"\n' >"${os_fixture}" ;;
  arm64) printf 'ID=raspbian\nVERSION_ID="13"\nPRETTY_NAME="Raspberry Pi OS 13"\n' >"${os_fixture}" ;;
esac

mismatch_output="${tmp_dir}/host-mismatch.out"
if AUTARK_OS_OS_RELEASE_FIXTURE="${os_fixture}" \
  AUTARK_OS_ARCHITECTURE_FIXTURE="${other_architecture}" \
  "${repo_root}/scripts/bootstrap-autark-os.sh" \
  --doctor \
  --json \
  --release-bundle "${bundle_dir}" >"${mismatch_output}" 2>&1; then
  printf 'Expected a release/host architecture mismatch to fail.\n' >&2
  exit 1
fi
grep -q "release is built for ${host_architecture}, but this host is ${other_architecture}" "${mismatch_output}"
