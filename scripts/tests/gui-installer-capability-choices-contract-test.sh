#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

fake_jar="${tmp_dir}/project-os-backend.jar"
printf 'fake jar for gui installer capability choices test\n' >"${fake_jar}"

output="$("${repo_root}/scripts/project-os-gui-installer.sh" \
  --preview \
  --json \
  --release-jar "${fake_jar}" \
  --runtime-dir "${tmp_dir}/runtime" \
  --install-dir "${tmp_dir}/install" \
  --config-dir "${tmp_dir}/config" \
  --log-dir "${tmp_dir}/logs" \
  --port 9194)"

GUI_JSON="${output}" python3 - <<'PY'
import json
import os

contract = json.loads(os.environ["GUI_JSON"])
capabilities = contract["screens"]["capabilityChoices"]
plan_dependencies = {dependency["name"]: dependency for dependency in contract["plan"]["dependencies"]}

assert capabilities["id"] == "capability-choices"
assert capabilities["mutatesHostBeforeConfirmation"] is False
assert capabilities["supportDetails"]["planJsonIncluded"] is True
assert capabilities["supportDetails"]["exactCommand"].endswith("--plan --json")
assert capabilities["externalInstallerConsent"]["required"] is True
assert "https://get.docker.com" in capabilities["externalInstallerConsent"]["scripts"]
assert "https://tailscale.com/install.sh" in capabilities["externalInstallerConsent"]["scripts"]

choices = {choice["id"]: choice for choice in capabilities["choices"]}
assert set(choices) == {"install-and-run-apps", "reach-apps-from-my-devices", "local-only"}

apps = choices["install-and-run-apps"]
assert apps["label"] == "Install and run apps"
assert apps["requires"] == ["Docker", "Docker Compose"]
assert apps["requiredFor"] == "Marketplace app installs"
assert apps["enabled"] is True
assert apps["dependencies"][0]["name"] == "Docker"
assert apps["dependencies"][0]["status"] == plan_dependencies["Docker"]["status"]

private = choices["reach-apps-from-my-devices"]
assert private["label"] == "Reach apps from my devices"
assert private["requires"] == ["Tailscale"]
assert private["optional"] is True
assert "local-only" in private["skipChoice"]
assert private["dependencies"][0]["name"] == "Tailscale"
assert private["dependencies"][0]["status"] == plan_dependencies["Tailscale"]["status"]

local_only = choices["local-only"]
assert local_only["selectedByDefault"] is True
assert local_only["skipsOptionalCapabilities"] == ["private-device-access"]
assert capabilities["planImpact"]["skippedOptionalCapabilities"] == ["private-device-access"]
PY
