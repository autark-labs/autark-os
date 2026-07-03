#!/usr/bin/env bash
set -Eeuo pipefail

PREVIEW=0
JSON_OUTPUT=0
FORWARDED_ARGS=()

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOOTSTRAP_SCRIPT="${SCRIPT_DIR}/bootstrap-autark-os.sh"

usage() {
  cat <<USAGE
Usage: $0 --preview --json [bootstrap options]

Preview the GUI installer architecture contract without changing the host.

Options:
  --preview          Build the GUI installer preview contract.
  --json             Print the contract as JSON.
  -h, --help         Show this help.

All other options are passed to bootstrap-autark-os.sh for shared doctor and
install-plan generation, such as --release-jar, --release-bundle, --runtime-dir,
--install-dir, --config-dir, --log-dir, and --port.
USAGE
}

die() {
  printf '[autark-os gui installer] error: %s\n' "$*" >&2
  exit 1
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --preview)
        PREVIEW=1
        ;;
      --json)
        JSON_OUTPUT=1
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        FORWARDED_ARGS+=("$1")
        ;;
    esac
    shift
  done
}

print_contract_json() {
  local doctor_json plan_json screens_json state_dir
  doctor_json="$("${BOOTSTRAP_SCRIPT}" --doctor --json "${FORWARDED_ARGS[@]}")"
  plan_json="$("${BOOTSTRAP_SCRIPT}" --plan --json "${FORWARDED_ARGS[@]}")"
  state_dir="$(forwarded_option_value "--state-dir" "")"
  screens_json="$(build_screens_json "${doctor_json}" "${plan_json}" "${state_dir}")"

  cat <<JSON
{
  "schemaVersion": 1,
  "installerSurface": "gui-local-web",
  "packaging": {
    "approach": "local-web-ui",
    "launcher": "autark-os-gui-installer.sh",
    "nativeShell": "later",
    "summary": "A small launcher starts a local web UI that renders shared bootstrap doctor and install-plan data."
  },
  "sharedOperations": [
    {
      "id": "pre-install-doctor",
      "label": "Check this device",
      "source": "bootstrap-autark-os.sh --doctor --json",
      "mutatesHost": false,
      "requiresPrivilege": false
    },
    {
      "id": "install-plan",
      "label": "Build install plan",
      "source": "bootstrap-autark-os.sh --plan --json",
      "mutatesHost": false,
      "requiresPrivilege": false
    },
    {
      "id": "dependency-install",
      "label": "Install supported dependencies",
      "source": "bootstrap-autark-os.sh --auto-install-deps",
      "mutatesHost": true,
      "requiresPrivilege": true
    },
    {
      "id": "service-install",
      "label": "Install Autark-OS service",
      "source": "bootstrap-autark-os.sh",
      "mutatesHost": true,
      "requiresPrivilege": true
    },
    {
      "id": "post-install-doctor",
      "label": "Verify installed service",
      "source": "autark-os doctor",
      "mutatesHost": false,
      "requiresPrivilege": false
    }
  ],
  "privilegeEscalation": {
    "policy": "deferred-explicit",
    "summary": "The GUI preview and device checks run without privilege. Dependency and service installation require a clear confirmation before sudo or root actions.",
    "requiredFor": ["dependency-install", "service-install"]
  },
  "logging": {
    "strategy": "append-only-session-log",
    "supportBundleHandoff": "autark-os support-bundle --state-dir <state-dir> --output <path>"
  },
  "recoveryActions": [
    {
      "id": "retry",
      "label": "Retry the failed step",
      "source": "rerun the same shared operation"
    },
    {
      "id": "resume",
      "label": "Resume with the same choices",
      "source": "bootstrap-autark-os.sh --state-dir"
    },
    {
      "id": "save-support-report",
      "label": "Save support report",
      "source": "autark-os support-bundle --state-dir <state-dir> --installer-log <log> --output <path>"
    },
    {
      "id": "exit-without-changes",
      "label": "Exit without making more changes",
      "source": "close launcher"
    }
  ],
  "screens": ${screens_json},
  "doctor": ${doctor_json},
  "plan": ${plan_json}
}
JSON
}

forwarded_option_value() {
  local option_name="$1"
  local fallback="$2"
  local index
  for ((index = 0; index < ${#FORWARDED_ARGS[@]}; index++)); do
    if [[ "${FORWARDED_ARGS[index]}" == "${option_name}" && $((index + 1)) -lt ${#FORWARDED_ARGS[@]} ]]; then
      printf '%s\n' "${FORWARDED_ARGS[index + 1]}"
      return 0
    fi
  done
  printf '%s\n' "${fallback}"
}

build_screens_json() {
  local doctor_json="$1"
  local plan_json="$2"
  local state_dir="$3"
  DOCTOR_JSON="${doctor_json}" PLAN_JSON="${plan_json}" GUI_STATE_DIR="${state_dir}" DEVICE_NAME="$(hostname 2>/dev/null || uname -n || printf 'This device')" python3 - <<'PY'
import json
import os

doctor = json.loads(os.environ["DOCTOR_JSON"])
plan = json.loads(os.environ["PLAN_JSON"])
device_name = os.environ.get("DEVICE_NAME") or "This device"
state_dir = os.environ.get("GUI_STATE_DIR") or ""

checks = doctor.get("checks", [])
blocked_checks = [check for check in checks if check.get("status") == "blocked"]
warning_checks = [check for check in checks if check.get("status") == "warning"]
status = doctor.get("status", "blocked")

summary_by_status = {
    "ready": "This device is ready for Autark-OS.",
    "ready_with_notes": "This device can continue after you review a few notes.",
    "blocked": "Autark-OS needs a few things fixed before installation can continue.",
}

issue_messages = {
    "os": "This device is not running a supported Linux version for the guided installer.",
    "systemd": "This device cannot run Autark-OS as a background service yet.",
    "sudo": "Autark-OS needs permission to install itself as a background service. Start the installer from an administrator account.",
    "internet": "This device may not be connected to the internet.",
    "runtime-storage": "The selected storage location may not have enough free space for apps and backups.",
    "port": "The selected Autark-OS web address is already in use. Choose another port before continuing.",
    "java": "This device needs Java before Autark-OS can run.",
    "docker": "Docker is needed before Marketplace apps can be installed.",
    "docker-compose": "Docker Compose is needed before Marketplace apps can be installed.",
    "tailscale": "Private access can be set up later if Tailscale is not installed now.",
}

def friendly_issue(check):
    check_id = check.get("id", "")
    message = issue_messages.get(check_id, check.get("message", "Review this item before continuing."))
    message = message.replace("--port", "another port")
    return {
        "id": check_id,
        "title": check.get("label", "Device check"),
        "severity": check.get("status", "warning"),
        "message": message,
        "nextAction": check.get("nextAction", ""),
    }

def risk_label(risk, recommended=False):
    if recommended and risk == "low":
        return "Best choice"
    if risk == "low":
        return "Good choice"
    if risk == "medium":
        return "Use with care"
    return "Needs review"

storage = plan.get("storage", {})
recommendation = storage.get("recommendation", {})
candidate_cards = []
for index, candidate in enumerate(storage.get("candidates", [])):
    risk = candidate.get("risk", "unknown")
    candidate_path = candidate.get("mountPoint", "")
    recommended = bool(candidate_path and candidate_path == recommendation.get("mountPoint"))
    title_parts = [candidate.get("name") or f"Drive {index + 1}"]
    if candidate.get("classification"):
        title_parts.append(candidate["classification"].replace("-", " "))
    candidate_cards.append({
        "id": f"drive-{index + 1}",
        "title": " - ".join(title_parts),
        "path": candidate_path,
        "sizeBytes": candidate.get("sizeBytes", 0),
        "freeSpaceBytes": None,
        "filesystem": candidate.get("filesystem", ""),
        "transport": candidate.get("transport", ""),
        "classification": candidate.get("classification", "unknown"),
        "stability": candidate.get("stability", "unknown"),
        "risk": risk,
        "riskLabel": risk_label(risk, recommended),
        "recommended": recommended,
        "requiresConfirmation": risk in {"medium", "high", "unknown"} or candidate.get("stability") == "unstable",
        "stores": "Autark-OS will store apps, app data, backups, and restore points here.",
    })

if not candidate_cards:
    risk = recommendation.get("risk", "unknown")
    candidate_cards.append({
        "id": "selected-runtime-folder",
        "title": "Selected folder",
        "path": plan.get("paths", {}).get("runtimeDir", storage.get("runtimePath", "")),
        "sizeBytes": None,
        "freeSpaceBytes": doctor.get("runtime", {}).get("availableKb", 0) * 1024,
        "filesystem": "",
        "transport": "",
        "classification": recommendation.get("classification", "default-runtime"),
        "stability": recommendation.get("stability", "unknown"),
        "risk": risk,
        "riskLabel": risk_label(risk),
        "recommended": False,
        "requiresConfirmation": risk in {"medium", "high", "unknown"},
        "stores": "Autark-OS will store apps, app data, backups, and restore points here.",
    })

recommendation_risk = recommendation.get("risk", "unknown")
if recommendation_risk == "low" and recommendation.get("path"):
    recommendation_badge = "Recommended"
elif recommendation.get("path"):
    recommendation_badge = "Use with care"
else:
    recommendation_badge = "Manual choice"

dependencies = {dependency.get("name"): dependency for dependency in plan.get("dependencies", [])}

def dependency_payload(name):
    dependency = dependencies.get(name, {})
    return {
        "name": name,
        "status": dependency.get("status", "unknown"),
        "required": bool(dependency.get("required", False)),
        "note": dependency.get("note", ""),
    }

def stage(stage_id, order, label, operation_id, message):
    return {
        "id": stage_id,
        "order": order,
        "label": label,
        "operationId": operation_id,
        "status": "pending",
        "friendlyMessage": message,
        "advancedDetails": {
            "rawLogIncluded": True,
            "planJsonIncluded": True,
        },
        "failure": {
            "whatFailed": "",
            "safeToRetry": True,
            "nextAction": "Retry this step or save a support report.",
        },
    }

state_dir_arg = f" --state-dir {state_dir}" if state_dir else " --state-dir <state-dir>"
recovery_command = "scripts/bootstrap-autark-os.sh" + state_dir_arg + " [same choices]"
port = plan.get("service", {}).get("port", 8082)
local_url = f"http://localhost:{port}"

def lan_host():
    import socket
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("8.8.8.8", 80))
            return probe.getsockname()[0]
    except OSError:
        return device_name

lan_url = f"http://{lan_host()}:{port}"
runtime_path = plan.get("paths", {}).get("runtimeDir", storage.get("runtimePath", ""))
private_access_state = "deferred"

contract = {
    "deviceCheck": {
        "id": "device-check",
        "title": "Check This Device",
        "summary": summary_by_status.get(status, summary_by_status["blocked"]),
        "status": status,
        "canContinue": status != "blocked",
        "mutatesHost": False,
        "device": {
            "name": device_name,
            "os": doctor.get("host", {}).get("os", "Unknown Linux"),
            "architecture": doctor.get("host", {}).get("architecture", "unknown"),
        },
        "readiness": {
            "result": status,
            "primaryMessage": summary_by_status.get(status, summary_by_status["blocked"]),
            "warningCount": len(warning_checks),
            "blockingCount": len(blocked_checks),
        },
        "blockingIssues": [friendly_issue(check) for check in blocked_checks],
        "supportDetails": {
            "doctorJsonIncluded": True,
            "planJsonIncluded": True,
            "exactCommand": "bootstrap-autark-os.sh --doctor --json",
        },
        "actions": [
            {"id": "continue", "label": "Continue", "enabled": status != "blocked"},
            {"id": "show-details", "label": "Show details", "enabled": True},
            {"id": "save-support-report", "label": "Save support report", "enabled": True},
            {"id": "exit-without-changes", "label": "Exit without changes", "enabled": True},
        ],
    },
    "storageChoice": {
        "id": "storage-choice",
        "title": "Choose Storage",
        "summary": "Choose where Autark-OS keeps apps, app data, backups, and restore points.",
        "selectedRuntimeDir": plan.get("paths", {}).get("runtimeDir", storage.get("runtimePath", "")),
        "whatAutarkOsStores": ["apps", "app data", "backups", "restore points"],
        "recommendation": {
            "path": recommendation.get("path", ""),
            "mountPoint": recommendation.get("mountPoint", ""),
            "risk": recommendation_risk,
            "badge": recommendation_badge,
        },
        "cards": candidate_cards,
        "choices": [
            {"id": "use-recommended-drive", "label": "Use recommended drive", "advanced": False, "enabled": bool(recommendation.get("path"))},
            {"id": "use-system-drive", "label": "Use system drive", "advanced": False, "enabled": True},
            {"id": "choose-another-folder", "label": "Choose another folder", "advanced": False, "enabled": True},
            {"id": "advanced-path-entry", "label": "Advanced path entry", "advanced": True, "enabled": True},
        ],
        "supportDetails": {
            "planJsonIncluded": True,
            "exactCommand": "bootstrap-autark-os.sh --plan --json",
        },
    },
    "capabilityChoices": {
        "id": "capability-choices",
        "title": "Choose Capabilities",
        "summary": "Choose what Autark-OS should be ready to do. Advanced details show the exact packages and commands.",
        "mutatesHostBeforeConfirmation": False,
        "choices": [
            {
                "id": "install-and-run-apps",
                "label": "Install and run apps",
                "summary": "Autark-OS needs Docker and Docker Compose before it can install Marketplace apps.",
                "requires": ["Docker", "Docker Compose"],
                "requiredFor": "Marketplace app installs",
                "optional": False,
                "enabled": True,
                "dependencies": [dependency_payload("Docker"), dependency_payload("Docker Compose")],
                "willInstallOrConfigure": [
                    "Docker engine when it is missing on supported hosts",
                    "Docker Compose v2 when it is missing",
                    "Docker group access for the Autark-OS service user",
                ],
            },
            {
                "id": "reach-apps-from-my-devices",
                "label": "Reach apps from my devices",
                "summary": "Tailscale is optional. Choose it when you want private links from your phone, laptop, or other trusted devices.",
                "requires": ["Tailscale"],
                "requiredFor": "Private remote access",
                "optional": True,
                "enabled": True,
                "skipChoice": "local-only",
                "dependencies": [dependency_payload("Tailscale")],
                "willInstallOrConfigure": [
                    "Tailscale when you explicitly choose private device access",
                    "Tailscale operator permission for the Autark-OS service user when Tailscale is connected",
                ],
            },
            {
                "id": "local-only",
                "label": "Keep access local for now",
                "summary": "Autark-OS will work on this device and home network first. Private device access can be configured later.",
                "requires": [],
                "requiredFor": "Local-only install",
                "optional": True,
                "enabled": True,
                "selectedByDefault": True,
                "skipsOptionalCapabilities": ["private-device-access"],
                "dependencies": [],
                "willInstallOrConfigure": [],
            },
        ],
        "externalInstallerConsent": {
            "required": True,
            "summary": "Docker and Tailscale use external installer scripts only after explicit confirmation.",
            "scripts": [
                "https://get.docker.com",
                "https://tailscale.com/install.sh",
            ],
        },
        "advancedDetails": {
            "packages": ["ca-certificates", "curl", "gnupg", "git", "Java 21", "Docker", "Docker Compose", "Tailscale"],
            "commands": [
                "bootstrap-autark-os.sh --auto-install-deps",
                "bootstrap-autark-os.sh --plan --json",
            ],
        },
        "planImpact": {
            "skippedOptionalCapabilities": ["private-device-access"],
            "localOnlyAllowed": True,
        },
        "supportDetails": {
            "planJsonIncluded": True,
            "exactCommand": "bootstrap-autark-os.sh --plan --json",
        },
    },
    "installProgress": {
        "id": "install-progress",
        "title": "Install Autark-OS",
        "summary": "Autark-OS will show each step while keeping raw logs in Advanced details.",
        "stateDir": state_dir,
        "stages": [
            stage("download-release", 1, "Download release", "release-download", "Getting the selected Autark-OS release."),
            stage("verify-release", 2, "Verify release", "release-verify", "Checking release files before anything is installed."),
            stage("prepare-dependencies", 3, "Prepare dependencies", "dependency-install", "Preparing app and private-access requirements."),
            stage("create-service-user", 4, "Create service user", "service-install", "Creating the Autark-OS background service account when needed."),
            stage("install-autark-os", 5, "Install Autark-OS", "service-install", "Installing Autark-OS files and helper commands."),
            stage("start-autark-os", 6, "Start Autark-OS", "service-install", "Starting the Autark-OS background service."),
            stage("check-readiness", 7, "Check readiness", "post-install-doctor", "Checking that Autark-OS is ready to open."),
        ],
        "rawLogs": {
            "advancedDetails": True,
            "logDir": plan.get("paths", {}).get("logDir", ""),
            "sessionLogIncluded": True,
        },
        "recovery": {
            "safeToRerun": True,
            "recoveryCommand": recovery_command,
            "retryActionId": "retry",
            "resumeActionId": "resume",
            "failureMessage": "If a step fails, Autark-OS will show the failed step, whether retry is safe, and how to save a support report.",
        },
        "supportReport": {
            "actionId": "save-support-report",
            "command": "autark-os support-bundle --state-dir <state-dir> --installer-log <log> --output <path>",
            "schema": "installer-support-bundle-v1",
            "includes": ["doctor", "plan", "installer-state", "session-log"],
        },
    },
    "completionHandoff": {
        "id": "completion-handoff",
        "title": "Autark-OS Is Ready To Open",
        "summary": {
            "localUrl": local_url,
            "lanUrl": lan_url,
            "runtimeStoragePath": runtime_path,
            "serviceState": "planned",
            "privateAccessState": private_access_state,
            "backupPosture": "choose-during-onboarding",
        },
        "browserHandoff": {
            "primaryUrl": local_url,
            "secondaryUrl": lan_url,
            "autoOpen": {
                "allowed": True,
                "when": "after-service-readiness",
                "fallbackActionId": "copy-url",
            },
        },
        "onboardingHandoff": {
            "firstScreen": "first-boot-onboarding",
            "runtimeStoragePath": runtime_path,
            "privateAccessState": private_access_state,
            "backupPosture": "choose-during-onboarding",
            "expectedInstallerState": "installed",
            "message": "First-boot onboarding should show the same storage, private access, and backup posture from the installer summary.",
        },
        "actions": [
            {"id": "open-autark-os", "label": "Open Autark-OS", "url": local_url, "primary": True},
            {"id": "copy-url", "label": "Copy URL", "url": local_url, "primary": False},
            {"id": "save-support-report", "label": "Save support report", "primary": False},
            {"id": "finish", "label": "Finish", "primary": False},
        ],
        "deferredSetup": [
            {
                "id": "private-access",
                "label": "Private access",
                "state": private_access_state,
                "nextAction": "Use first-boot onboarding or the Network page to connect trusted devices.",
            },
            {
                "id": "backups",
                "label": "Backups",
                "state": "choose-during-onboarding",
                "nextAction": "Choose backup protection during first-boot onboarding.",
            },
        ],
        "recoveryCommands": {
            "visualPriority": "secondary",
            "commands": [
                "autark-os status",
                "autark-os logs",
                recovery_command,
            ],
        },
        "supportDetails": {
            "doctorJsonIncluded": True,
            "planJsonIncluded": True,
            "sessionLogIncluded": True,
        },
    },
}

print(json.dumps(contract, separators=(",", ":")))
PY
}

main() {
  parse_args "$@"
  [[ "${PREVIEW}" -eq 1 ]] || die "--preview is required for this initial GUI installer slice."
  [[ "${JSON_OUTPUT}" -eq 1 ]] || die "--json is required for this initial GUI installer slice."
  print_contract_json
}

main "$@"
