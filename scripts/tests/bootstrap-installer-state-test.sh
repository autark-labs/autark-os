#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

fake_jar="${tmp_dir}/autark-os-backend.jar"
state_dir="${tmp_dir}/state"
printf 'fake jar for state test\n' >"${fake_jar}"

"${repo_root}/scripts/bootstrap-autark-os.sh" \
  --plan \
  --release-jar "${fake_jar}" \
  --runtime-dir "${tmp_dir}/runtime" \
  --install-dir "${tmp_dir}/install" \
  --config-dir "${tmp_dir}/config" \
  --log-dir "${tmp_dir}/logs" \
  --port 9092 \
  --state-dir "${state_dir}" >/dev/null

[[ -f "${state_dir}/installer-state.json" ]]

STATE_JSON="$(cat "${state_dir}/installer-state.json")" python3 - "${fake_jar}" "${state_dir}" <<'PY'
import json
import os
import sys

fake_jar = sys.argv[1]
state_dir = sys.argv[2]
state = json.loads(os.environ["STATE_JSON"])

assert state["schemaVersion"] == 1
assert state["status"] == "planned"
assert state["lastCompletedStage"] == "plan"
assert state["stateDir"] == state_dir
assert state["selectedOptions"]["runtimeDir"].endswith("/runtime")
assert state["selectedOptions"]["installDir"].endswith("/install")
assert state["selectedOptions"]["configDir"].endswith("/config")
assert state["selectedOptions"]["logDir"].endswith("/logs")
assert state["selectedOptions"]["port"] == 9092
assert state["artifact"]["backendJar"] == fake_jar
assert "rerun" in state["recoveryCommand"].lower()
PY
