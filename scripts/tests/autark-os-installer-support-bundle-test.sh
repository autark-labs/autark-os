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

architecture="$(dpkg --print-architecture)"
mkdir -p "${install_dir}/backend" "${install_dir}/bin" "${runtime_dir}" "${config_dir}" "${log_dir}" "${bundle_dir}/backend" "${bundle_dir}/runtime/bin" "${bundle_dir}/scripts" "${state_dir}"
printf 'backend jar\n' >"${bundle_dir}/backend/autark-os-backend.jar"
cp "${repo_root}/scripts/bootstrap-autark-os.sh" "${bundle_dir}/scripts/bootstrap-autark-os.sh"
cp "${repo_root}/scripts/autark-os" "${bundle_dir}/scripts/autark-os"
cp "${repo_root}/scripts/supported-host-matrix.env" "${bundle_dir}/scripts/supported-host-matrix.env"
cp "$(readlink -f "$(command -v java)")" "${bundle_dir}/runtime/bin/java"
cat >"${bundle_dir}/autark-os-release.env" <<ENV
AUTARK_OS_ARTIFACT_ARCHITECTURE=${architecture}
AUTARK_OS_RUNTIME_ARCHITECTURE=${architecture}
ENV
cat >"${bundle_dir}/autark-os-release.json" <<JSON
{
  "schemaVersion": 2,
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
setupCode=AAAA-BBBB-CCCC-DDDD
Cookie: autark-os-admin-session=browser-session-secret
Private URL: http://192.168.1.20:8082
Owner: person@example.com
Home: /home/jackson/autark-os
deviceName=raspberrypi
LOG
cat >>"${log_dir}/installer.log" <<'LOG'
Authorization: Basic c3ludGhldGljOnNlY3JldA==
authorization: bearer lowercase-bearer-secret
PASSWORD="two secret words"
PASSWORD='single quoted secret'
PASSWORD="escaped \"quoted\" secret"
{"accessToken":"json-access-secret","refresh_token":"json-refresh-secret","password":"json \"escaped\" secret","authorization":"Basic json-basic-secret","hostname":"json-private-host","runAsUser":"fixture-runtime-owner","expectedUser":"fixture-service-owner","status":"failed","attempts":3}
Credential URL: https://synthetic-user:synthetic-password@example.invalid/path
Private IPv6: http://[fd12::1]/private-ipv6-path
Link-local IPv6: https://[fe80::1234%eth0]:443/link-local-path
Loopback IPv6: http://[::1]:8082/loopback-path
Expanded loopback IPv6: http://[0:0:0:0:0:0:0:1]:8082/expanded-loopback-path
Mapped IPv6: http://[::ffff:c0a8:102]:8082/mapped-private-path
Mapped dotted IPv6: http://[::ffff:192.168.1.2]:8082/mapped-dotted-path
Public IPv6: https://[2001:4860:4860::8888]/docs
Public mapped IPv6: https://[::ffff:8.8.8.8]/docs
Oct 10 12:00:00 journal-private-host autark-os[123]: useful journal failure
2026-10-10T12:00:00+00:00 iso-private-host autark-os[456]: useful ISO journal failure
Public documentation: https://example.invalid/docs
Ordinary context: status=failed attempts=3 backup completed
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
  release-metadata.json \
  update-inventory-report.json \
  application-state.json \
  jobs.json \
  recent-activity.json \
  docker-inventory.txt; do
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
assert "update-inventory-report.json" in manifest["files"]
assert "application-state.json" in manifest["files"]
assert "jobs.json" in manifest["files"]
assert "docker-inventory.txt" in manifest["files"]
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
grep -q 'setupCode=\[redacted\]' "${bundle_root}/installer-stage.log"
grep -q '\[redacted-private-url\]' "${bundle_root}/installer-stage.log"
grep -q '\[redacted-email\]' "${bundle_root}/installer-stage.log"
grep -q '\[redacted-home-path\]' "${bundle_root}/installer-stage.log"
grep -q 'deviceName=\[redacted-host\]' "${bundle_root}/installer-stage.log"

if grep -R -n -E -- 'plain-secret-token|secret-couchdb-password|tskey-secret-value|state-secret-token|log-secret-token|bearer-secret-token|AAAA-BBBB|browser-session-secret|192\.168\.1\.20|person@example\.com|/home/jackson|raspberrypi' "${bundle_root}" >/tmp/autark-os-support-bundle-secrets.txt; then
  cat /tmp/autark-os-support-bundle-secrets.txt
  exit 1
fi

python3 - "${bundle_root}/installer-stage.log" <<'PY'
import json
from pathlib import Path
import sys

output = Path(sys.argv[1]).read_text()
for secret in (
    "c3ludGhldGljOnNlY3JldA==", "lowercase-bearer-secret", "two secret words",
    "single quoted secret", "quoted", "json-access-secret", "json-refresh-secret",
    "escaped", "json-basic-secret", "json-private-host", "fixture-runtime-owner", "fixture-service-owner", "synthetic-user",
    "synthetic-password", "fd12::1", "private-ipv6-path", "fe80::1234",
    "link-local-path", "::1", "loopback-path", "journal-private-host", "iso-private-host",
    "0:0:0:0:0:0:0:1", "c0a8:102", "mapped-private-path", "mapped-dotted-path",
):
    assert secret not in output, f"Support export leaked synthetic value: {secret}"
for context in ("useful journal failure", "useful ISO journal failure",
                "https://example.invalid/docs", "https://[2001:4860:4860::8888]/docs",
                "https://[::ffff:8.8.8.8]/docs", "status=failed attempts=3 backup completed"):
    assert context in output, f"Support export damaged useful context: {context}"
record = json.loads(next(line for line in output.splitlines() if line.startswith('{"accessToken"')))
assert record == {"accessToken": "[redacted]", "refresh_token": "[redacted]",
                  "password": "[redacted]", "authorization": "[redacted]",
                  "hostname": "[redacted-host]", "runAsUser": "[redacted-host]", "expectedUser": "[redacted-host]", "status": "failed", "attempts": 3}
PY

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

# Exercise error output through the same packaged command, before JSON encoding.
cp "${repo_root}/scripts/autark-os" "${bundle_dir}/scripts/autark-os"
cat >"${bundle_dir}/scripts/bootstrap-autark-os.sh" <<'SH'
#!/usr/bin/env bash
printf '%s\n' 'Installer failed: PASSWORD="error quoted secret" Authorization: Basic error-basic-secret' >&2
exit 1
SH
chmod +x "${bundle_dir}/scripts/bootstrap-autark-os.sh"
AUTARK_OS_CONFIG_FILE="${config_file}" \
AUTARK_OS_BASE_URL="http://127.0.0.1:1" \
AUTARK_OS_SERVICE_FILE="${service_file}" \
AUTARK_OS_CLI_LINK="${cli_link}" \
  "${bundle_dir}/scripts/autark-os" support-bundle --output "${tmp_dir}/failed-support.tar.gz" >/dev/null
mkdir "${tmp_dir}/failed-export"
tar -xzf "${tmp_dir}/failed-support.tar.gz" -C "${tmp_dir}/failed-export"
python3 - "${tmp_dir}/failed-export" <<'PY'
import json
from pathlib import Path
import sys

for name in ("install-plan.json", "pre-install-doctor.json"):
    value = json.loads(next(Path(sys.argv[1]).rglob(name)).read_text())
    assert value["status"] == "unavailable"
    assert "Installer failed" in value["message"]
    assert "error quoted secret" not in value["message"]
    assert "error-basic-secret" not in value["message"]
    assert "[redacted]" in value["message"]
PY
