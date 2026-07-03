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
output_file="${tmp_dir}/autark-os-support.tar.gz"
config_file="${config_dir}/autark-os.env"
service_file="${tmp_dir}/autark-os.service"
cli_link="${tmp_dir}/autark-os"

mkdir -p "${install_dir}/backend" "${install_dir}/bin" "${runtime_dir}" "${config_dir}" "${log_dir}" "${bundle_dir}/backend" "${bundle_dir}/scripts" "${state_dir}"
printf 'backend jar\n' >"${bundle_dir}/backend/autark-os-backend.jar"
cp "${repo_root}/scripts/bootstrap-autark-os.sh" "${bundle_dir}/scripts/bootstrap-autark-os.sh"
cp "${repo_root}/scripts/autark-os" "${bundle_dir}/scripts/autark-os"
cat >"${bundle_dir}/autark-os-release.json" <<JSON
{
  "schemaVersion": 1,
  "name": "autark-os",
  "version": "2.4.0",
  "channel": "stable",
  "buildSha": "support-bundle-sha",
  "buildDate": "2026-06-19T12:00:00Z"
}
JSON

cat >"${config_file}" <<ENV
AUTARK_OS_INSTALL_DIR=${install_dir}
AUTARK_OS_RUNTIME_ROOT=${runtime_dir}
AUTARK_OS_CONFIG_DIR=${config_dir}
AUTARK_OS_LOG_DIR=${log_dir}
AUTARK_OS_BACKEND_JAR=${install_dir}/backend/autark-os-backend.jar
AUTARK_OS_VERSION=2.3.0
AUTARK_OS_BUILD_SHA=old-support-sha
AUTARK_OS_API_TOKEN=plain-secret-token
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
[autark-os] installer started
token=log-secret-token
Authorization: Bearer bearer-secret-token
LOG

AUTARK_OS_CONFIG_FILE="${config_file}" \
AUTARK_OS_BASE_URL="http://127.0.0.1:1" \
AUTARK_OS_SERVICE_FILE="${service_file}" \
AUTARK_OS_CLI_LINK="${cli_link}" \
"${repo_root}/scripts/autark-os" support-bundle \
  --output "${output_file}" \
  --release-bundle "${bundle_dir}" \
  --state-dir "${state_dir}" \
  --installer-log "${log_dir}/installer.log" >/tmp/autark-os-support-bundle-output.txt

[[ -s "${output_file}" ]]
grep -q "${output_file}" /tmp/autark-os-support-bundle-output.txt

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

grep -q 'AUTARK_OS_API_TOKEN=\[redacted\]' "${bundle_root}/config-redacted.env"
grep -q 'COUCHDB_PASSWORD=\[redacted\]' "${bundle_root}/config-redacted.env"
grep -q 'TAILSCALE_AUTH_KEY=\[redacted\]' "${bundle_root}/config-redacted.env"
grep -q 'token=\[redacted\]' "${bundle_root}/installer-stage.log"
grep -q 'Bearer \[redacted\]' "${bundle_root}/installer-stage.log"

if rg -n 'plain-secret-token|secret-couchdb-password|tskey-secret-value|state-secret-token|log-secret-token|bearer-secret-token' "${bundle_root}" >/tmp/autark-os-support-bundle-secrets.txt; then
  cat /tmp/autark-os-support-bundle-secrets.txt
  exit 1
fi

gui_contract="$("${repo_root}/scripts/autark-os-gui-installer.sh" --preview --json --release-bundle "${bundle_dir}" --state-dir "${state_dir}")"
AUTARK_OS_GUI_CONTRACT="${gui_contract}" python3 - <<'PY'
import json
import os

contract = json.loads(os.environ["AUTARK_OS_GUI_CONTRACT"])
assert contract["logging"]["supportBundleHandoff"] == "autark-os support-bundle --state-dir <state-dir> --output <path>"
sources = {action["id"]: action["source"] for action in contract["recoveryActions"]}
assert sources["save-support-report"].startswith("autark-os support-bundle")
support_report = contract["screens"]["installProgress"]["supportReport"]
assert support_report["command"].startswith("autark-os support-bundle")
assert support_report["schema"] == "installer-support-bundle-v1"
PY
