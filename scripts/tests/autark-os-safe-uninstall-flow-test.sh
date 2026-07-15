#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

install_dir="${tmp_dir}/install"
runtime_dir="${tmp_dir}/runtime"
config_dir="${tmp_dir}/config"
log_dir="${tmp_dir}/logs"
service_file="${tmp_dir}/autark-os.service"
cli_link="${tmp_dir}/autark-os"
config_file="${config_dir}/autark-os.env"
mkdir -p "${install_dir}" "${runtime_dir}/apps/vaultwarden" "${config_dir}" "${log_dir}"
cat >"${config_file}" <<ENV
AUTARK_OS_INSTALL_DIR=${install_dir}
AUTARK_OS_RUNTIME_ROOT=${runtime_dir}
AUTARK_OS_CONFIG_DIR=${config_dir}
AUTARK_OS_LOG_DIR=${log_dir}
ENV

default_plan="$(AUTARK_OS_CONFIG_FILE="${config_file}" AUTARK_OS_SERVICE_FILE="${service_file}" AUTARK_OS_CLI_LINK="${cli_link}" "${repo_root}/scripts/autark-os" uninstall --plan --json)"

AUTARK_OS_UNINSTALL_JSON="${default_plan}" INSTALL_DIR="${install_dir}" RUNTIME_DIR="${runtime_dir}" CONFIG_DIR="${config_dir}" LOG_DIR="${log_dir}" SERVICE_FILE="${service_file}" CLI_LINK="${cli_link}" python3 - <<'PY'
import json
import os

plan = json.loads(os.environ["AUTARK_OS_UNINSTALL_JSON"])
assert plan["schemaVersion"] == 1
assert plan["mode"] == "preserve-runtime-data"
assert plan["requiresTypedConfirmation"] is False
assert plan["supportReport"]["offeredBeforeRemoval"] is True
assert plan["dockerResources"]["installedAppsDetected"] is True
assert plan["dockerResources"]["appCount"] == 1
assert os.environ["SERVICE_FILE"] in plan["removePaths"]
assert os.environ["CLI_LINK"] in plan["removePaths"]
assert os.environ["INSTALL_DIR"] in plan["removePaths"]
assert "/etc/sudoers.d/autark-os-fileops" in plan["removePaths"]
assert os.environ["RUNTIME_DIR"] in plan["preservePaths"]
assert os.environ["CONFIG_DIR"] in plan["preservePaths"]
assert os.environ["LOG_DIR"] in plan["preservePaths"]
assert any(action["id"] == "stop-service" for action in plan["actions"])
assert any(action["id"] == "remove-binaries" for action in plan["actions"])
PY

config_logs_plan="$(AUTARK_OS_CONFIG_FILE="${config_file}" AUTARK_OS_SERVICE_FILE="${service_file}" AUTARK_OS_CLI_LINK="${cli_link}" "${repo_root}/scripts/autark-os" uninstall --plan --json --remove-config --remove-logs)"
AUTARK_OS_UNINSTALL_JSON="${config_logs_plan}" CONFIG_DIR="${config_dir}" LOG_DIR="${log_dir}" RUNTIME_DIR="${runtime_dir}" python3 - <<'PY'
import json
import os

plan = json.loads(os.environ["AUTARK_OS_UNINSTALL_JSON"])
assert plan["mode"] == "remove-config-and-logs"
assert os.environ["CONFIG_DIR"] in plan["removePaths"]
assert os.environ["LOG_DIR"] in plan["removePaths"]
assert os.environ["RUNTIME_DIR"] in plan["preservePaths"]
PY

if AUTARK_OS_CONFIG_FILE="${config_file}" AUTARK_OS_SERVICE_FILE="${service_file}" AUTARK_OS_CLI_LINK="${cli_link}" "${repo_root}/scripts/autark-os" uninstall --plan --json --remove-data >/tmp/autark-os-uninstall-unconfirmed.json 2>/dev/null; then
  echo "Expected destructive uninstall plan without typed confirmation to fail." >&2
  exit 1
fi

destructive_plan="$(AUTARK_OS_CONFIG_FILE="${config_file}" AUTARK_OS_SERVICE_FILE="${service_file}" AUTARK_OS_CLI_LINK="${cli_link}" "${repo_root}/scripts/autark-os" uninstall --plan --json --remove-data --confirm-delete-data DELETE-AUTARK-OS-DATA)"
AUTARK_OS_UNINSTALL_JSON="${destructive_plan}" RUNTIME_DIR="${runtime_dir}" python3 - <<'PY'
import json
import os

plan = json.loads(os.environ["AUTARK_OS_UNINSTALL_JSON"])
assert plan["mode"] == "remove-all-data"
assert plan["requiresTypedConfirmation"] is True
assert plan["typedConfirmation"] == "DELETE-AUTARK-OS-DATA"
assert os.environ["RUNTIME_DIR"] in plan["removePaths"]
assert os.environ["RUNTIME_DIR"] not in plan["preservePaths"]
assert any(action["id"] == "remove-managed-apps" for action in plan["actions"])
PY

dry_run_output="$(AUTARK_OS_CONFIG_FILE="${config_file}" AUTARK_OS_SERVICE_FILE="${service_file}" AUTARK_OS_CLI_LINK="${cli_link}" "${repo_root}/scripts/autark-os" uninstall --dry-run --yes)"
grep -q 'Would stop service: autark-os.service' <<<"${dry_run_output}"
grep -q "Would remove: ${service_file}" <<<"${dry_run_output}"
grep -q "Would remove: ${cli_link}" <<<"${dry_run_output}"
grep -q "Would remove: ${install_dir}" <<<"${dry_run_output}"
grep -q "Would preserve: ${runtime_dir}" <<<"${dry_run_output}"

fake_bin="${tmp_dir}/fake-bin"
api_calls="${tmp_dir}/api-calls"
tailscale_calls="${tmp_dir}/tailscale-calls"
sudoers_file="${tmp_dir}/autark-os-fileops.sudoers"
mkdir -p "${fake_bin}"
printf 'service unit\n' >"${service_file}"
printf 'cli link\n' >"${cli_link}"
printf 'sudoers rule\n' >"${sudoers_file}"

cat >"${fake_bin}/id" <<'SH'
#!/usr/bin/env bash
if [[ "${1:-}" == "-u" ]]; then
  printf '0\n'
  exit 0
fi
if [[ "${1:-}" == "autarkos" ]]; then
  exit 1
fi
exec /usr/bin/id "$@"
SH
cat >"${fake_bin}/systemctl" <<'SH'
#!/usr/bin/env bash
exit 0
SH
cat >"${fake_bin}/curl" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
method=GET
previous=""
for argument in "$@"; do
  if [[ "${previous}" == "-X" ]]; then
    method="${argument}"
  fi
  previous="${argument}"
done
url="${!#}"
printf '%s %s\n' "${method}" "${url}" >>"${TEST_API_CALLS}"
if [[ "${method}" == "GET" && "${url}" == */api/apps ]]; then
  printf '[{"appId":"vaultwarden"}]\n'
else
  printf '{"ok":true}\n'
fi
SH
cat >"${fake_bin}/tailscale" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"${TEST_TAILSCALE_CALLS}"
SH
chmod +x "${fake_bin}"/*

PATH="${fake_bin}:/usr/bin:/bin" \
TEST_API_CALLS="${api_calls}" \
TEST_TAILSCALE_CALLS="${tailscale_calls}" \
AUTARK_OS_CONFIG_FILE="${config_file}" \
AUTARK_OS_SERVICE_FILE="${service_file}" \
AUTARK_OS_CLI_LINK="${cli_link}" \
AUTARK_OS_SUDOERS_FILE="${sudoers_file}" \
AUTARK_OS_BASE_URL="http://127.0.0.1:18082" \
  "${repo_root}/scripts/autark-os" uninstall --yes --remove-data --confirm-delete-data DELETE-AUTARK-OS-DATA >/dev/null

grep -q 'GET http://127.0.0.1:18082/api/apps' "${api_calls}"
grep -q 'DELETE http://127.0.0.1:18082/api/apps/vaultwarden' "${api_calls}"
grep -q '^set --operator=root$' "${tailscale_calls}"
[[ ! -e "${install_dir}" && ! -e "${runtime_dir}" && ! -e "${config_dir}" && ! -e "${log_dir}" ]]
[[ ! -e "${service_file}" && ! -e "${cli_link}" && ! -e "${sudoers_file}" ]]
