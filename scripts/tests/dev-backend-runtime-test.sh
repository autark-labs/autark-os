#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fixture="$(mktemp -d)"
trap 'rm -rf "${fixture}"' EXIT
mkdir -p "${fixture}/scripts" "${fixture}/backend/build/libs" "${fixture}/bin"
cp "${repo_root}/scripts/dev-backend.sh" "${fixture}/scripts/"
touch "${fixture}/backend/build/libs/autark-os-backend-0.0.1-SNAPSHOT.jar"
touch "${fixture}/backend/build/libs/autark-os-backend-stale-release.jar"
cat >"${fixture}/backend/gradlew" <<'SH'
#!/usr/bin/env bash
[[ "$(id -u)" != 0 ]]
printf '%s\n' "$*" >"${TEST_BUILD_ARGS}"
SH
cat >"${fixture}/bin/sudo" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$@" >"${TEST_RUNTIME_ARGS}"
SH
cat >"${fixture}/bin/ss" <<'SH'
#!/usr/bin/env bash
exit 0
SH
chmod +x "${fixture}/backend/gradlew" "${fixture}/bin/"*
export TEST_BUILD_ARGS="${fixture}/build-args" TEST_RUNTIME_ARGS="${fixture}/runtime-args"
env -u AUTARK_OS_BUILD_VERSION -u AUTARK_OS_RUNTIME_ROOT PATH="${fixture}/bin:${PATH}" \
  bash "${fixture}/scripts/dev-backend.sh" --port 18082 >/dev/null
grep -Fq -- "-p ${fixture}/backend bootJar" "${TEST_BUILD_ARGS}"
grep -Fxq 'env' "${TEST_RUNTIME_ARGS}"
grep -Fxq "AUTARK_OS_RUNTIME_ROOT=${fixture}/.autark-os-dev/runtime" "${TEST_RUNTIME_ARGS}"
grep -Fxq "${fixture}/backend/build/libs/autark-os-backend-0.0.1-SNAPSHOT.jar" "${TEST_RUNTIME_ARGS}"
grep -Fxq -- '--autark-os.dev-mode=false' "${TEST_RUNTIME_ARGS}"
grep -Fxq -- '--server.address=127.0.0.1' "${TEST_RUNTIME_ARGS}"
grep -Fxq -- '--server.port=18082' "${TEST_RUNTIME_ARGS}"
printf 'PASS: normal-user build, exact JAR, root Java, real authenticated local runtime\n'
