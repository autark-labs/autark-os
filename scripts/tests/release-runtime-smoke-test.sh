#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
bundle_dir="${tmp_dir}/bundle"
backend_log="${tmp_dir}/backend.log"
application_log="${tmp_dir}/autark-os.log"
health_response="${tmp_dir}/health.json"
backend_pid=""
port="${AUTARK_OS_RUNTIME_SMOKE_PORT:-19099}"

cleanup() {
  if [[ -n "${backend_pid}" ]] && kill -0 "${backend_pid}" 2>/dev/null; then
    kill "${backend_pid}" 2>/dev/null || true
    wait "${backend_pid}" 2>/dev/null || true
  fi
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

real_jar="$(find "${repo_root}/backend/build/libs" -maxdepth 1 -type f -name 'autark-os-backend*.jar' ! -name '*plain*.jar' ! -name '*contract-test*.jar' ! -name '*integrity-test*.jar' | sort | head -n 1)"
if [[ -z "${real_jar}" ]]; then
  printf 'A built Autark-OS boot jar is required. Run ./backend/gradlew -p backend bootJar first.\n' >&2
  exit 1
fi

"${repo_root}/scripts/build-release-bundle.sh" \
  --skip-build \
  --version 0.0.0-runtime-smoke \
  --channel beta \
  --architecture "$(dpkg --print-architecture)" \
  --output-dir "${bundle_dir}" >/dev/null

"${bundle_dir}/runtime/bin/java" --list-modules | grep -q '^java.compiler@'
"${bundle_dir}/runtime/bin/java" --list-modules | grep -q '^jdk.management@'

AUTARK_OS_RUNTIME_ROOT="${tmp_dir}/runtime-data" \
SERVER_PORT="${port}" \
LOGGING_FILE_NAME="${application_log}" \
  "${bundle_dir}/runtime/bin/java" \
  -jar "${bundle_dir}/backend/autark-os-backend.jar" >"${backend_log}" 2>&1 &
backend_pid=$!

ready=0
for _ in $(seq 1 60); do
  if curl --fail --silent --max-time 2 "http://localhost:${port}/api/health" >"${health_response}"; then
    ready=1
    break
  fi
  if ! kill -0 "${backend_pid}" 2>/dev/null; then
    break
  fi
  sleep 1
done

if [[ "${ready}" -ne 1 ]]; then
  printf 'The packaged Autark-OS runtime did not become ready.\n' >&2
  tail -n 200 "${backend_log}" >&2 || true
  exit 1
fi

grep -q '"status":"ok"' "${health_response}"
[[ -s "${application_log}" ]]
