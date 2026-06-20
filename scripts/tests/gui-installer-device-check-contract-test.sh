#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

fake_jar="${tmp_dir}/project-os-backend.jar"
printf 'fake jar for gui installer device check test\n' >"${fake_jar}"

output="$("${repo_root}/scripts/project-os-gui-installer.sh" \
  --preview \
  --json \
  --release-jar "${fake_jar}" \
  --runtime-dir "${tmp_dir}/runtime" \
  --install-dir "${tmp_dir}/install" \
  --config-dir "${tmp_dir}/config" \
  --log-dir "${tmp_dir}/logs" \
  --port 9192)"

GUI_JSON="${output}" python3 - <<'PY'
import json
import os

contract = json.loads(os.environ["GUI_JSON"])
device = contract["screens"]["deviceCheck"]

assert device["id"] == "device-check"
assert device["mutatesHost"] is False
assert device["status"] in {"ready", "ready_with_notes", "blocked"}
assert device["canContinue"] == (device["status"] != "blocked")
assert device["device"]["name"]
assert device["device"]["os"] == contract["doctor"]["host"]["os"]
assert device["device"]["architecture"] == contract["doctor"]["host"]["architecture"]
assert device["supportDetails"]["doctorJsonIncluded"] is True
assert device["supportDetails"]["planJsonIncluded"] is True
assert device["supportDetails"]["exactCommand"].endswith("--doctor --json")
assert {action["id"] for action in device["actions"]} == {
    "continue",
    "show-details",
    "save-support-report",
    "exit-without-changes",
}
assert "--" not in device["summary"]
assert "sudo" not in device["summary"].lower()
for issue in device["blockingIssues"]:
    assert issue["id"]
    assert issue["message"]
    assert "--" not in issue["message"]
PY
