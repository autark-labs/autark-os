#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

install_dir="${tmp_dir}/install"
runtime_dir="${tmp_dir}/runtime"
config_dir="${tmp_dir}/config"
log_dir="${tmp_dir}/logs"
bundle_dir="${tmp_dir}/release"
state_dir="${tmp_dir}/state"
output_file="${tmp_dir}/project-os-support.tar.gz"
config_file="${config_dir}/project-os.env"
service_file="${tmp_dir}/project-os.service"
cli_link="${tmp_dir}/project-os"

mkdir -p "${install_dir}/backend" "${install_dir}/bin" "${runtime_dir}" "${config_dir}" "${log_dir}" "${bundle_dir}/backend" "${bundle_dir}/scripts" "${state_dir}"
printf 'backend jar\n' >"${bundle_dir}/backend/project-os-backend.jar"
cp "${repo_root}/scripts/bootstrap-project-os.sh" "${bundle_dir}/scripts/bootstrap-project-os.sh"
cp "${repo_root}/scripts/project-os" "${bundle_dir}/scripts/project-os"
cat >"${bundle_dir}/project-os-release.json" <<JSON
{
  "schemaVersion": 1,
  "name": "project-os",
  "version": "2.4.0",
  "channel": "stable",
  "buildSha": "support-bundle-sha",
  "buildDate": "2026-06-19T12:00:00Z"
}
JSON

cat >"${config_file}" <<ENV
PROJECT_OS_INSTALL_DIR=${install_dir}
PROJECT_OS_RUNTIME_ROOT=${runtime_dir}
PROJECT_OS_CONFIG_DIR=${config_dir}
PROJECT_OS_LOG_DIR=${log_dir}
PROJECT_OS_BACKEND_JAR=${install_dir}/backend/project-os-backend.jar
PROJECT_OS_VERSION=2.3.0
PROJECT_OS_BUILD_SHA=old-support-sha
PROJECT_OS_API_TOKEN=plain-secret-token
COUCHDB_PASSWORD=secret-couchdb-password
TAILSCALE_AUTH_KEY=tskey-secret-value
ENV

cat >"${state_dir}/installer-state.json" <<JSON
{
  "schemaVersion": 1,
  "status": "failed",
  "lastCompletedStage": "dependency-install",
  "selectedOptions": {
    "runtimeDir": "${runtime_dir}",
    "accessMode": "local-only",
    "token": "state-secret-token"
  }
}
JSON

cat >"${log_dir}/installer.log" <<LOG
[project-os] installer started
token=log-secret-token
Authorization: Bearer bearer-secret-token
LOG

PROJECT_OS_CONFIG_FILE="${config_file}" \
PROJECT_OS_BASE_URL="http://127.0.0.1:1" \
PROJECT_OS_SERVICE_FILE="${service_file}" \
PROJECT_OS_CLI_LINK="${cli_link}" \
"${repo_root}/scripts/project-os" support-bundle \
  --output "${output_file}" \
  --release-bundle "${bundle_dir}" \
  --state-dir "${state_dir}" \
  --installer-log "${log_dir}/installer.log" >/tmp/project-os-support-bundle-output.txt

[[ -s "${output_file}" ]]
grep -q "${output_file}" /tmp/project-os-support-bundle-output.txt

extract_dir="${tmp_dir}/extract"
mkdir -p "${extract_dir}"
tar -xzf "${output_file}" -C "${extract_dir}"

bundle_root="$(find "${extract_dir}" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
[[ -n "${bundle_root}" ]]

for required_file in \
  manifest.json \
  install-plan.json \
  pre-install-doctor.json \
  post-install-doctor.json \
  os-release.txt \
  architecture.txt \
  disk-summary.txt \
  dependency-states.json \
  service-status.txt \
  selected-options.json \
  config-redacted.env \
  installer-stage.log \
  release-metadata.json; do
  [[ -f "${bundle_root}/${required_file}" ]]
done

python3 - "${bundle_root}/manifest.json" <<'PY'
import json
import sys

manifest = json.load(open(sys.argv[1]))
assert manifest["schemaVersion"] == 1
assert manifest["bundleType"] == "installer-support"
assert manifest["redacted"] is True
assert manifest["supportConsoleCompatible"] is True
assert "install-plan.json" in manifest["files"]
assert "pre-install-doctor.json" in manifest["files"]
assert "installer-stage.log" in manifest["files"]
PY

python3 - "${bundle_root}/selected-options.json" <<'PY'
import json
import sys

selected = json.load(open(sys.argv[1]))
assert selected["runtimeDir"].endswith("/runtime")
assert selected["accessMode"] == "local-only"
assert selected["token"] == "[redacted]"
PY

grep -q 'PROJECT_OS_API_TOKEN=\[redacted\]' "${bundle_root}/config-redacted.env"
grep -q 'COUCHDB_PASSWORD=\[redacted\]' "${bundle_root}/config-redacted.env"
grep -q 'TAILSCALE_AUTH_KEY=\[redacted\]' "${bundle_root}/config-redacted.env"
grep -q 'token=\[redacted\]' "${bundle_root}/installer-stage.log"
grep -q 'Bearer \[redacted\]' "${bundle_root}/installer-stage.log"

if rg -n 'plain-secret-token|secret-couchdb-password|tskey-secret-value|state-secret-token|log-secret-token|bearer-secret-token' "${bundle_root}" >/tmp/project-os-support-bundle-secrets.txt; then
  cat /tmp/project-os-support-bundle-secrets.txt
  exit 1
fi

gui_contract="$("${repo_root}/scripts/project-os-gui-installer.sh" --preview --json --release-bundle "${bundle_dir}" --state-dir "${state_dir}")"
PROJECT_OS_GUI_CONTRACT="${gui_contract}" python3 - <<'PY'
import json
import os

contract = json.loads(os.environ["PROJECT_OS_GUI_CONTRACT"])
assert contract["logging"]["supportBundleHandoff"] == "project-os support-bundle --state-dir <state-dir> --output <path>"
sources = {action["id"]: action["source"] for action in contract["recoveryActions"]}
assert sources["save-support-report"].startswith("project-os support-bundle")
support_report = contract["screens"]["installProgress"]["supportReport"]
assert support_report["command"].startswith("project-os support-bundle")
assert support_report["schema"] == "installer-support-bundle-v1"
PY
