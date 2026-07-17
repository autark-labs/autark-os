#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
bundle_dir="${tmp_dir}/bundle"
backend_log="${tmp_dir}/backend.log"
application_log="${tmp_dir}/autark-os.log"
health_response="${tmp_dir}/health.json"
version_response="${tmp_dir}/version.json"
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

real_jar="${AUTARK_OS_BACKEND_JAR:-$(find "${repo_root}/backend/build/libs" -maxdepth 1 -type f -name 'autark-os-backend*.jar' ! -name '*plain*.jar' ! -name '*contract-test*.jar' ! -name '*integrity-test*.jar' | sort | head -n 1)}"
if [[ -z "${real_jar}" ]]; then
  printf 'A built Autark-OS boot jar is required. Run ./backend/gradlew -p backend bootJar first.\n' >&2
  exit 1
fi

jar_manifest_value() {
  unzip -p "${real_jar}" META-INF/MANIFEST.MF | tr -d '\r' | awk -F': ' -v key="$1" '$1 == key {print $2; exit}'
}
jar_version="$(jar_manifest_value Implementation-Version)"
jar_sha="$(jar_manifest_value Autark-OS-Build-Sha)"
[[ -n "${jar_version}" && -n "${jar_sha}" && "${jar_sha}" != development ]] || {
  printf 'A release-identified boot jar is required. Build with AUTARK_OS_BUILD_VERSION, AUTARK_OS_BUILD_SHA, and AUTARK_OS_BUILD_DATE.\n' >&2
  exit 1
}

AUTARK_OS_BACKEND_JAR="${real_jar}" AUTARK_OS_BUILD_SHA="${jar_sha}" "${repo_root}/scripts/build-release-bundle.sh" \
  --skip-build \
  --version "${jar_version}" \
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

curl --fail --silent --max-time 2 "http://localhost:${port}/api/system/version" >"${version_response}"
JAR_VERSION="${jar_version}" JAR_SHA="${jar_sha}" VERSION_RESPONSE="${version_response}" python3 - <<'PY'
import json
import os

version = json.load(open(os.environ["VERSION_RESPONSE"], encoding="utf-8"))
assert version["version"] == os.environ["JAR_VERSION"]
assert version["buildSha"] == os.environ["JAR_SHA"]
assert version["buildDate"] != "development"
PY

cli_config="${tmp_dir}/autark-os.env"
printf 'SERVER_PORT=%s\n' "${port}" >"${cli_config}"
AUTARK_OS_CONFIG_FILE="${cli_config}" "${bundle_dir}/scripts/autark-os" version >"${tmp_dir}/cli-version.out"
grep -q "Version:.*${jar_version}" "${tmp_dir}/cli-version.out"
grep -q "Build SHA:.*${jar_sha}" "${tmp_dir}/cli-version.out"
"${bundle_dir}/scripts/autark-os" help | grep -q '/usr/share/doc/autark-os/GETTING_STARTED.md'
