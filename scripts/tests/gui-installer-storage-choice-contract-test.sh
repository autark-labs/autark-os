#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

fake_jar="${tmp_dir}/project-os-backend.jar"
runtime_dir="${tmp_dir}/runtime"
printf 'fake jar for gui installer storage choice test\n' >"${fake_jar}"

output="$("${repo_root}/scripts/project-os-gui-installer.sh" \
  --preview \
  --json \
  --release-jar "${fake_jar}" \
  --runtime-dir "${runtime_dir}" \
  --install-dir "${tmp_dir}/install" \
  --config-dir "${tmp_dir}/config" \
  --log-dir "${tmp_dir}/logs" \
  --port 9193)"

GUI_JSON="${output}" RUNTIME_DIR="${runtime_dir}" python3 - <<'PY'
import json
import os

contract = json.loads(os.environ["GUI_JSON"])
storage = contract["screens"]["storageChoice"]
plan_storage = contract["plan"]["storage"]
runtime_dir = os.environ["RUNTIME_DIR"]

assert storage["id"] == "storage-choice"
assert storage["selectedRuntimeDir"] == runtime_dir
assert storage["selectedRuntimeDir"] == contract["plan"]["paths"]["runtimeDir"]
assert storage["whatProjectOsStores"] == ["apps", "app data", "backups", "restore points"]
assert storage["supportDetails"]["planJsonIncluded"] is True
assert storage["recommendation"]["path"] == plan_storage["recommendation"]["path"]
assert storage["recommendation"]["badge"] in {"Recommended", "Use with care", "Manual choice"}
assert {choice["id"] for choice in storage["choices"]} == {
    "use-recommended-drive",
    "use-system-drive",
    "choose-another-folder",
    "advanced-path-entry",
}
assert any(choice["id"] == "advanced-path-entry" and choice["advanced"] is True for choice in storage["choices"])
assert storage["cards"]
for card in storage["cards"]:
    assert card["id"]
    assert card["title"]
    assert card["path"]
    assert card["riskLabel"] in {"Best choice", "Good choice", "Use with care", "Needs review"}
    assert isinstance(card["requiresConfirmation"], bool)
    assert "Project OS will store apps, app data, backups, and restore points here." == card["stores"]
    if card["risk"] in {"medium", "high", "unknown"}:
        assert card["requiresConfirmation"] is True
PY
