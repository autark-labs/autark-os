#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

install_dir="${tmp_dir}/install"
runtime_dir="${tmp_dir}/runtime"
config_dir="${tmp_dir}/config"
log_dir="${tmp_dir}/logs"
service_file="${tmp_dir}/project-os.service"
cli_link="${tmp_dir}/project-os"
config_file="${config_dir}/project-os.env"
mkdir -p "${install_dir}" "${runtime_dir}/apps/vaultwarden" "${config_dir}" "${log_dir}"
cat >"${config_file}" <<ENV
PROJECT_OS_INSTALL_DIR=${install_dir}
PROJECT_OS_RUNTIME_ROOT=${runtime_dir}
PROJECT_OS_CONFIG_DIR=${config_dir}
PROJECT_OS_LOG_DIR=${log_dir}
ENV

default_plan="$(PROJECT_OS_CONFIG_FILE="${config_file}" PROJECT_OS_SERVICE_FILE="${service_file}" PROJECT_OS_CLI_LINK="${cli_link}" "${repo_root}/scripts/project-os" uninstall --plan --json)"

PROJECT_OS_UNINSTALL_JSON="${default_plan}" INSTALL_DIR="${install_dir}" RUNTIME_DIR="${runtime_dir}" CONFIG_DIR="${config_dir}" LOG_DIR="${log_dir}" SERVICE_FILE="${service_file}" CLI_LINK="${cli_link}" python3 - <<'PY'
import json
import os

plan = json.loads(os.environ["PROJECT_OS_UNINSTALL_JSON"])
assert plan["schemaVersion"] == 1
assert plan["mode"] == "preserve-runtime-data"
assert plan["requiresTypedConfirmation"] is False
assert plan["supportReport"]["offeredBeforeRemoval"] is True
assert plan["dockerResources"]["installedAppsDetected"] is True
assert plan["dockerResources"]["appCount"] == 1
assert os.environ["SERVICE_FILE"] in plan["removePaths"]
assert os.environ["CLI_LINK"] in plan["removePaths"]
assert os.environ["INSTALL_DIR"] in plan["removePaths"]
assert os.environ["RUNTIME_DIR"] in plan["preservePaths"]
assert os.environ["CONFIG_DIR"] in plan["preservePaths"]
assert os.environ["LOG_DIR"] in plan["preservePaths"]
assert any(action["id"] == "stop-service" for action in plan["actions"])
assert any(action["id"] == "remove-binaries" for action in plan["actions"])
PY

config_logs_plan="$(PROJECT_OS_CONFIG_FILE="${config_file}" PROJECT_OS_SERVICE_FILE="${service_file}" PROJECT_OS_CLI_LINK="${cli_link}" "${repo_root}/scripts/project-os" uninstall --plan --json --remove-config --remove-logs)"
PROJECT_OS_UNINSTALL_JSON="${config_logs_plan}" CONFIG_DIR="${config_dir}" LOG_DIR="${log_dir}" RUNTIME_DIR="${runtime_dir}" python3 - <<'PY'
import json
import os

plan = json.loads(os.environ["PROJECT_OS_UNINSTALL_JSON"])
assert plan["mode"] == "remove-config-and-logs"
assert os.environ["CONFIG_DIR"] in plan["removePaths"]
assert os.environ["LOG_DIR"] in plan["removePaths"]
assert os.environ["RUNTIME_DIR"] in plan["preservePaths"]
PY

if PROJECT_OS_CONFIG_FILE="${config_file}" PROJECT_OS_SERVICE_FILE="${service_file}" PROJECT_OS_CLI_LINK="${cli_link}" "${repo_root}/scripts/project-os" uninstall --plan --json --remove-data >/tmp/project-os-uninstall-unconfirmed.json 2>/dev/null; then
  echo "Expected destructive uninstall plan without typed confirmation to fail." >&2
  exit 1
fi

destructive_plan="$(PROJECT_OS_CONFIG_FILE="${config_file}" PROJECT_OS_SERVICE_FILE="${service_file}" PROJECT_OS_CLI_LINK="${cli_link}" "${repo_root}/scripts/project-os" uninstall --plan --json --remove-data --confirm-delete-data DELETE-PROJECT-OS-DATA)"
PROJECT_OS_UNINSTALL_JSON="${destructive_plan}" RUNTIME_DIR="${runtime_dir}" python3 - <<'PY'
import json
import os

plan = json.loads(os.environ["PROJECT_OS_UNINSTALL_JSON"])
assert plan["mode"] == "remove-all-data"
assert plan["requiresTypedConfirmation"] is True
assert plan["typedConfirmation"] == "DELETE-PROJECT-OS-DATA"
assert os.environ["RUNTIME_DIR"] in plan["removePaths"]
assert os.environ["RUNTIME_DIR"] not in plan["preservePaths"]
PY

dry_run_output="$(PROJECT_OS_CONFIG_FILE="${config_file}" PROJECT_OS_SERVICE_FILE="${service_file}" PROJECT_OS_CLI_LINK="${cli_link}" "${repo_root}/scripts/project-os" uninstall --dry-run --yes)"
grep -q 'Would stop service: project-os.service' <<<"${dry_run_output}"
grep -q "Would remove: ${service_file}" <<<"${dry_run_output}"
grep -q "Would remove: ${cli_link}" <<<"${dry_run_output}"
grep -q "Would remove: ${install_dir}" <<<"${dry_run_output}"
grep -q "Would preserve: ${runtime_dir}" <<<"${dry_run_output}"
