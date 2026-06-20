#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

fake_jar="${tmp_dir}/project-os-backend.jar"
runtime_dir="${tmp_dir}/runtime"
state_dir="${tmp_dir}/state"
printf 'fake jar for gui installer completion handoff test\n' >"${fake_jar}"

output="$("${repo_root}/scripts/project-os-gui-installer.sh" \
  --preview \
  --json \
  --release-jar "${fake_jar}" \
  --runtime-dir "${runtime_dir}" \
  --install-dir "${tmp_dir}/install" \
  --config-dir "${tmp_dir}/config" \
  --log-dir "${tmp_dir}/logs" \
  --state-dir "${state_dir}" \
  --port 9196)"

GUI_JSON="${output}" RUNTIME_DIR="${runtime_dir}" STATE_DIR="${state_dir}" python3 - <<'PY'
import json
import os

contract = json.loads(os.environ["GUI_JSON"])
handoff = contract["screens"]["completionHandoff"]

assert handoff["id"] == "completion-handoff"
assert handoff["summary"]["localUrl"] == "http://localhost:9196"
assert handoff["summary"]["lanUrl"].startswith("http://")
assert handoff["summary"]["lanUrl"].endswith(":9196")
assert handoff["summary"]["runtimeStoragePath"] == os.environ["RUNTIME_DIR"]
assert handoff["summary"]["runtimeStoragePath"] == contract["plan"]["paths"]["runtimeDir"]
assert handoff["summary"]["serviceState"] in {"planned", "starting", "running", "needs-check"}
assert handoff["summary"]["privateAccessState"] == "deferred"
assert handoff["summary"]["backupPosture"] in {"choose-during-onboarding", "configured", "needs-attention"}

assert handoff["browserHandoff"]["primaryUrl"] == handoff["summary"]["localUrl"]
assert handoff["browserHandoff"]["autoOpen"]["allowed"] is True
assert handoff["browserHandoff"]["autoOpen"]["when"] == "after-service-readiness"
assert handoff["onboardingHandoff"]["firstScreen"] == "first-boot-onboarding"
assert handoff["onboardingHandoff"]["runtimeStoragePath"] == os.environ["RUNTIME_DIR"]
assert handoff["onboardingHandoff"]["privateAccessState"] == handoff["summary"]["privateAccessState"]
assert handoff["onboardingHandoff"]["backupPosture"] == handoff["summary"]["backupPosture"]

assert {action["id"] for action in handoff["actions"]} == {
    "open-project-os",
    "copy-url",
    "save-support-report",
    "finish",
}
assert handoff["actions"][0]["id"] == "open-project-os"
assert handoff["actions"][0]["url"] == handoff["summary"]["localUrl"]
assert handoff["recoveryCommands"]["visualPriority"] == "secondary"
assert "project-os status" in handoff["recoveryCommands"]["commands"]
assert "project-os logs" in handoff["recoveryCommands"]["commands"]
assert any(os.environ["STATE_DIR"] in command for command in handoff["recoveryCommands"]["commands"])
PY
