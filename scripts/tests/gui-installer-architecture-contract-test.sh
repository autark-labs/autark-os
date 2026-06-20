#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

fake_jar="${tmp_dir}/project-os-backend.jar"
printf 'fake jar for gui installer architecture test\n' >"${fake_jar}"

output="$("${repo_root}/scripts/project-os-gui-installer.sh" \
  --preview \
  --json \
  --release-jar "${fake_jar}" \
  --runtime-dir "${tmp_dir}/runtime" \
  --install-dir "${tmp_dir}/install" \
  --config-dir "${tmp_dir}/config" \
  --log-dir "${tmp_dir}/logs" \
  --port 9191)"

GUI_JSON="${output}" python3 - <<'PY'
import json
import os

contract = json.loads(os.environ["GUI_JSON"])

assert contract["schemaVersion"] == 1
assert contract["installerSurface"] == "gui-local-web"
assert contract["packaging"]["approach"] == "local-web-ui"
assert contract["packaging"]["nativeShell"] == "later"
assert contract["doctor"]["schemaVersion"] == 1
assert contract["plan"]["schemaVersion"] == 1
assert contract["plan"]["service"]["port"] == 9191
assert contract["plan"]["paths"]["runtimeDir"].endswith("/runtime")
assert any(operation["id"] == "pre-install-doctor" and "--doctor --json" in operation["source"] and not operation["mutatesHost"] for operation in contract["sharedOperations"])
assert any(operation["id"] == "install-plan" and "--plan --json" in operation["source"] and not operation["mutatesHost"] for operation in contract["sharedOperations"])
assert any(operation["id"] == "service-install" and operation["requiresPrivilege"] and operation["mutatesHost"] for operation in contract["sharedOperations"])
assert contract["privilegeEscalation"]["policy"] == "deferred-explicit"
assert any(action["id"] == "retry" for action in contract["recoveryActions"])
assert any(action["id"] == "save-support-report" for action in contract["recoveryActions"])
assert any(warning["id"] == "confirm-host-mutation" for warning in contract["plan"]["warnings"])
PY
