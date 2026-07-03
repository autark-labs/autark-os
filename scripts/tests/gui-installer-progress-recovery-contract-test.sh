#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

fake_jar="${tmp_dir}/autark-os-backend.jar"
state_dir="${tmp_dir}/state"
printf 'fake jar for gui installer progress recovery test\n' >"${fake_jar}"

output="$("${repo_root}/scripts/autark-os-gui-installer.sh" \
  --preview \
  --json \
  --release-jar "${fake_jar}" \
  --runtime-dir "${tmp_dir}/runtime" \
  --install-dir "${tmp_dir}/install" \
  --config-dir "${tmp_dir}/config" \
  --log-dir "${tmp_dir}/logs" \
  --state-dir "${state_dir}" \
  --port 9195)"

GUI_JSON="${output}" STATE_DIR="${state_dir}" python3 - <<'PY'
import json
import os

contract = json.loads(os.environ["GUI_JSON"])
progress = contract["screens"]["installProgress"]

assert progress["id"] == "install-progress"
assert progress["stateDir"] == os.environ["STATE_DIR"]
assert progress["rawLogs"]["advancedDetails"] is True
assert progress["rawLogs"]["logDir"] == contract["plan"]["paths"]["logDir"]
assert progress["supportReport"]["includes"] == ["doctor", "plan", "installer-state", "session-log"]
assert progress["supportReport"]["actionId"] == "save-support-report"
assert progress["recovery"]["safeToRerun"] is True
assert "--state-dir" in progress["recovery"]["recoveryCommand"]
assert progress["recovery"]["retryActionId"] == "retry"

expected_stages = [
    "download-release",
    "verify-release",
    "prepare-dependencies",
    "create-service-user",
    "install-autark-os",
    "start-autark-os",
    "check-readiness",
]
assert [stage["id"] for stage in progress["stages"]] == expected_stages
assert len({stage["operationId"] for stage in progress["stages"]}) >= 4
for index, stage in enumerate(progress["stages"], start=1):
    assert stage["order"] == index
    assert stage["status"] == "pending"
    assert stage["friendlyMessage"]
    assert stage["failure"] == {
        "whatFailed": "",
        "safeToRetry": True,
        "nextAction": "Retry this step or save a support report.",
    }
PY
