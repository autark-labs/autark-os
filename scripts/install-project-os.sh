#!/usr/bin/env bash
set -Eeuo pipefail

RELEASE_URL="${PROJECT_OS_RELEASE_URL:-}"
CHANNEL="${PROJECT_OS_UPDATE_CHANNEL:-stable}"
VERSION="${PROJECT_OS_VERSION:-latest}"
RUNTIME_DIR=""
PORT=""
START_AFTER_INSTALL=1
PRIVATE_ACCESS_CHOICE="configure later"
INSTALL_DEPS_CHOICE="yes"
DRY_RUN=0
YES=0
JSON_OUTPUT=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<USAGE
Usage: $0 --release-url URL [options]

Download or consume a Project OS release bundle and run the shared installer.

Options:
  --release-url URL  Release bundle URL. file:///path/to/bundle is supported.
  --channel VALUE    Release channel to request. Default: ${CHANNEL}.
  --version VALUE    Release version to request. Default: ${VERSION}.
  --runtime-dir DIR  Store Project OS runtime data in DIR.
  --port PORT        Run Project OS on PORT.
  --no-start         Install files but do not start Project OS.
  --yes              Confirm host changes without prompting.
  --dry-run          Verify and preview without changing the host.
  --json             Print the shared install plan as JSON.
  -h, --help         Show this help.
USAGE
}

log() {
  printf '[project-os installer] %s\n' "$*"
}

die() {
  printf '[project-os installer] error: %s\n' "$*" >&2
  exit 1
}

require_absolute_path() {
  local label="$1"
  local value="$2"
  [[ "${value}" = /* ]] || die "${label} must be an absolute path: ${value}"
}

require_port() {
  local value="$1"
  [[ "${value}" =~ ^[0-9]+$ ]] || die "--port must be a number: ${value}"
  (( value >= 1 && value <= 65535 )) || die "--port must be between 1 and 65535: ${value}"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --release-url)
        shift
        [[ $# -gt 0 ]] || die "--release-url requires a URL."
        RELEASE_URL="$1"
        ;;
      --release-url=*)
        RELEASE_URL="${1#*=}"
        ;;
      --channel)
        shift
        [[ $# -gt 0 ]] || die "--channel requires a value."
        CHANNEL="$1"
        ;;
      --channel=*)
        CHANNEL="${1#*=}"
        ;;
      --version)
        shift
        [[ $# -gt 0 ]] || die "--version requires a value."
        VERSION="$1"
        ;;
      --version=*)
        VERSION="${1#*=}"
        ;;
      --runtime-dir)
        shift
        [[ $# -gt 0 ]] || die "--runtime-dir requires a path."
        RUNTIME_DIR="$1"
        require_absolute_path "--runtime-dir" "${RUNTIME_DIR}"
        ;;
      --runtime-dir=*)
        RUNTIME_DIR="${1#*=}"
        require_absolute_path "--runtime-dir" "${RUNTIME_DIR}"
        ;;
      --port)
        shift
        [[ $# -gt 0 ]] || die "--port requires a value."
        PORT="$1"
        require_port "${PORT}"
        ;;
      --port=*)
        PORT="${1#*=}"
        require_port "${PORT}"
        ;;
      --no-start)
        START_AFTER_INSTALL=0
        ;;
      --yes)
        YES=1
        ;;
      --dry-run)
        DRY_RUN=1
        ;;
      --json)
        JSON_OUTPUT=1
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "Unknown option: $1"
        ;;
    esac
    shift
  done
  [[ -n "${RELEASE_URL}" ]] || die "--release-url is required for this installer preview."
}

read_default() {
  local prompt="$1"
  local default_value="$2"
  local value
  read -r -p "${prompt} [${default_value}]: " value || value=""
  printf '%s\n' "${value:-${default_value}}"
}

read_yes_no() {
  local prompt="$1"
  local default_value="$2"
  local value
  read -r -p "${prompt} [${default_value}]: " value || value=""
  value="${value:-${default_value}}"
  case "${value,,}" in
    y|yes) return 0 ;;
    *) return 1 ;;
  esac
}

run_guided_setup() {
  [[ "${YES}" -eq 1 || "${JSON_OUTPUT}" -eq 1 ]] && return 0

  log "Guided setup"
  log "Use recommended settings by pressing Enter, or answer n to customize."
  if read_yes_no "Use recommended settings" "Y"; then
    [[ -n "${RUNTIME_DIR}" ]] || RUNTIME_DIR="/var/lib/project-os"
    [[ -n "${PORT}" ]] || PORT="8082"
    INSTALL_DEPS_CHOICE="yes"
    PRIVATE_ACCESS_CHOICE="configure later"
    START_AFTER_INSTALL=1
  else
    [[ -n "${RUNTIME_DIR}" ]] || RUNTIME_DIR="$(read_default "Runtime data directory" "/var/lib/project-os")"
    [[ -n "${PORT}" ]] || PORT="$(read_default "Project OS port" "8082")"
    require_absolute_path "Runtime data directory" "${RUNTIME_DIR}"
    require_port "${PORT}"
    if read_yes_no "Install missing supported dependencies" "Y"; then
      INSTALL_DEPS_CHOICE="yes"
    else
      INSTALL_DEPS_CHOICE="no"
    fi
    if read_yes_no "Set up private access with Tailscale now" "N"; then
      PRIVATE_ACCESS_CHOICE="set up now"
    else
      PRIVATE_ACCESS_CHOICE="configure later"
    fi
    if read_yes_no "Start Project OS after install" "Y"; then
      START_AFTER_INSTALL=1
    else
      START_AFTER_INSTALL=0
    fi
  fi

  log "Guided choices:"
  log "  Runtime data: ${RUNTIME_DIR}"
  log "  Port: ${PORT}"
  log "  Install missing dependencies: ${INSTALL_DEPS_CHOICE}"
  log "  Private access: ${PRIVATE_ACCESS_CHOICE}"
  log "  Start after install: $([[ "${START_AFTER_INSTALL}" -eq 1 ]] && printf yes || printf no)"
}

release_path_from_url() {
  case "${RELEASE_URL}" in
    file://*) printf '%s\n' "${RELEASE_URL#file://}" ;;
    /*) printf '%s\n' "${RELEASE_URL}" ;;
    *) die "Only file:// release URLs are supported in this installer slice: ${RELEASE_URL}" ;;
  esac
}

metadata_value() {
  local key="$1"
  local file="$2"
  [[ -r "${file}" ]] || return 0
  awk -F= -v key="${key}" '$1 == key {print $2; exit}' "${file}"
}

verify_release() {
  local bundle_dir="$1"
  [[ -d "${bundle_dir}" ]] || die "Release bundle was not found: ${bundle_dir}"
  [[ -x "${bundle_dir}/scripts/bootstrap-project-os.sh" ]] || die "Release bundle is missing scripts/bootstrap-project-os.sh"
  [[ -r "${bundle_dir}/SHA256SUMS" ]] || die "Release bundle is missing SHA256SUMS"
  log "Verifying release checksums."
  (cd "${bundle_dir}" && sha256sum -c SHA256SUMS --ignore-missing >/dev/null)
}

confirm_install() {
  [[ "${YES}" -eq 1 || "${DRY_RUN}" -eq 1 ]] && return 0
  local response
  printf 'Install Project OS on this host? [y/N]: '
  read -r response
  case "${response,,}" in
    y|yes) return 0 ;;
    *) die "Installation cancelled." ;;
  esac
}

bootstrap_args() {
  local bundle_dir="$1"
  printf '%s\0' "--release-bundle" "${bundle_dir}"
  [[ -n "${RUNTIME_DIR}" ]] && printf '%s\0' "--runtime-dir" "${RUNTIME_DIR}"
  [[ -n "${PORT}" ]] && printf '%s\0' "--port" "${PORT}"
  [[ "${START_AFTER_INSTALL}" -eq 0 ]] && printf '%s\0' "--no-start"
}

print_dependency_disclosure() {
  [[ "${JSON_OUTPUT}" -eq 1 ]] && return 0
  cat <<DISCLOSURE

Dependency and host-change disclosure

Safe package-manager installs:
  - ca-certificates, curl, gnupg, git, Java 21, and package tooling may be installed on supported apt-based hosts.

External installer scripts:
  - Docker convenience script: https://get.docker.com
  - Tailscale install script: https://tailscale.com/install.sh

Services and permissions that may change:
  - projectos system user and group may be created.
  - project-os.service may be installed and enabled.
  - The projectos user may be added to the docker group.
  - Tailscale operator permission may be granted to projectos when Tailscale is connected.

Recovery and rollback notes:
  - Inspect install paths: project-os where
  - Inspect service status: project-os status
  - Follow backend logs: project-os logs
  - Re-run the installer with the same options to resume safe stages.
  - Remove service and binaries separately from runtime data when uninstalling.

DISCLOSURE
}

run_plan() {
  local bundle_dir="$1"
  local args=()
  while IFS= read -r -d '' arg; do
    args+=("${arg}")
  done < <(bootstrap_args "${bundle_dir}")
  args+=(--plan)
  [[ "${JSON_OUTPUT}" -eq 1 ]] && args+=(--json)
  "${bundle_dir}/scripts/bootstrap-project-os.sh" "${args[@]}"
}

run_install() {
  local bundle_dir="$1"
  local args=()
  while IFS= read -r -d '' arg; do
    args+=("${arg}")
  done < <(bootstrap_args "${bundle_dir}")
  if [[ "${INSTALL_DEPS_CHOICE}" == "yes" ]]; then
    args+=(--auto-install-deps)
  fi
  "${bundle_dir}/scripts/bootstrap-project-os.sh" "${args[@]}"
}

main() {
  parse_args "$@"
  local bundle_dir release_env release_version release_channel
  bundle_dir="$(release_path_from_url)"
  release_env="${bundle_dir}/project-os-release.env"
  release_version="$(metadata_value PROJECT_OS_VERSION "${release_env}")"
  release_channel="$(metadata_value PROJECT_OS_UPDATE_CHANNEL "${release_env}")"

  log "Project OS public installer"
  log "Requested channel: ${CHANNEL}"
  log "Requested version: ${VERSION}"
  log "Release source: ${RELEASE_URL}"
  log "Release version: ${release_version:-unknown}"
  log "Release channel: ${release_channel:-unknown}"
  verify_release "${bundle_dir}"
  run_guided_setup
  print_dependency_disclosure
  confirm_install
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    run_plan "${bundle_dir}"
    return 0
  fi
  run_install "${bundle_dir}"
}

main "$@"
