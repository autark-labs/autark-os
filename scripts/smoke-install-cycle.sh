#!/usr/bin/env bash
set -Eeuo pipefail

SMOKE_NAME="project-os-smoke"
PORT="18082"
BUNDLE_DIR=""
WORK_DIR=""
RUN_INSTALL=0
KEEP_INSTALL=0
INSTALL_DEPS=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
  cat <<USAGE
Usage: $0 [options]

Run a repeatable Project OS installation smoke cycle with isolated service
names, paths, user/group, port, and CLI link. The default mode is a dry run.

Options:
  --dry-run             Preview the smoke cycle without mutating the host. Default.
  --run                 Perform the smoke install, verify it, then clean it up.
  --keep-install        With --run, leave the smoke install in place for inspection.
  --install-deps        With --run, pass --auto-install-deps to the installer.
  --bundle-dir DIR      Use an existing release bundle.
  --work-dir DIR        Store temporary bundle/support output in DIR.
  --smoke-name NAME     Isolated service/CLI/user prefix. Default: project-os-smoke.
  --port PORT           Smoke service port. Default: 18082.
  -h, --help            Show this help.

Examples:
  scripts/smoke-install-cycle.sh --dry-run
  scripts/smoke-install-cycle.sh --run --bundle-dir /path/to/project-os-release
  scripts/smoke-install-cycle.sh --run --install-deps --keep-install
USAGE
}

log() {
  printf '[project-os smoke] %s\n' "$*"
}

die() {
  printf '[project-os smoke] error: %s\n' "$*" >&2
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
      --dry-run)
        RUN_INSTALL=0
        ;;
      --run)
        RUN_INSTALL=1
        ;;
      --keep-install)
        KEEP_INSTALL=1
        ;;
      --install-deps)
        INSTALL_DEPS=1
        ;;
      --bundle-dir)
        shift
        [[ $# -gt 0 ]] || die "--bundle-dir requires a directory."
        BUNDLE_DIR="$1"
        ;;
      --bundle-dir=*)
        BUNDLE_DIR="${1#*=}"
        ;;
      --work-dir)
        shift
        [[ $# -gt 0 ]] || die "--work-dir requires a directory."
        WORK_DIR="$1"
        require_absolute_path "--work-dir" "${WORK_DIR}"
        ;;
      --work-dir=*)
        WORK_DIR="${1#*=}"
        require_absolute_path "--work-dir" "${WORK_DIR}"
        ;;
      --smoke-name)
        shift
        [[ $# -gt 0 ]] || die "--smoke-name requires a value."
        SMOKE_NAME="$1"
        ;;
      --smoke-name=*)
        SMOKE_NAME="${1#*=}"
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
}

smoke_user() {
  printf '%s\n' "${SMOKE_NAME//-/_}" | cut -c1-28 | tr '_' '-'
}

prepare_bundle() {
  if [[ -n "${BUNDLE_DIR}" ]]; then
    [[ -d "${BUNDLE_DIR}" ]] || die "--bundle-dir must be a directory: ${BUNDLE_DIR}"
    BUNDLE_DIR="$(cd "${BUNDLE_DIR}" && pwd)"
    return 0
  fi
  BUNDLE_DIR="${WORK_DIR}/bundle"
  log "Building release bundle for smoke cycle."
  "${REPO_ROOT}/scripts/build-release-bundle.sh" \
    --version "smoke-$(date -u +%Y%m%d%H%M%S)" \
    --channel smoke \
    --release-notes-url "https://example.invalid/project-os/smoke" \
    --output-dir "${BUNDLE_DIR}"
}

cleanup_smoke_install() {
  local config_file="$1"
  log "Cleaning up ${SMOKE_NAME}."
  PROJECT_OS_SERVICE_NAME="${SMOKE_NAME}" \
  PROJECT_OS_CONFIG_FILE="${config_file}" \
  PROJECT_OS_SERVICE_FILE="/etc/systemd/system/${SMOKE_NAME}.service" \
  PROJECT_OS_CLI_LINK="/usr/local/bin/${SMOKE_NAME}" \
    "${REPO_ROOT}/scripts/project-os" uninstall \
      --remove-data \
      --confirm-delete-data DELETE-PROJECT-OS-DATA \
      --yes || true
  if id "$(smoke_user)" >/dev/null 2>&1; then
    sudo userdel "$(smoke_user)" >/dev/null 2>&1 || true
  fi
  if getent group "$(smoke_user)" >/dev/null 2>&1; then
    sudo groupdel "$(smoke_user)" >/dev/null 2>&1 || true
  fi
}

main() {
  parse_args "$@"
  [[ "${SMOKE_NAME}" =~ ^[a-zA-Z0-9._-]+$ ]] || die "--smoke-name contains unsupported characters."
  WORK_DIR="${WORK_DIR:-$(mktemp -d)}"
  mkdir -p "${WORK_DIR}"

  local install_dir="/opt/${SMOKE_NAME}"
  local runtime_dir="/var/lib/${SMOKE_NAME}"
  local config_dir="/etc/${SMOKE_NAME}"
  local log_dir="/var/log/${SMOKE_NAME}"
  local config_file="${config_dir}/project-os.env"
  local service_file="/etc/systemd/system/${SMOKE_NAME}.service"
  local cli_link="/usr/local/bin/${SMOKE_NAME}"
  local state_dir="${WORK_DIR}/installer-state"
  local support_file="${WORK_DIR}/${SMOKE_NAME}-support.tar.gz"
  local user_name
  user_name="$(smoke_user)"

  log "Smoke mode: $([[ "${RUN_INSTALL}" -eq 1 ]] && printf run || printf dry-run)"
  log "Smoke service: ${SMOKE_NAME}.service"
  log "Smoke user/group: ${user_name}"
  log "Smoke port: ${PORT}"
  log "Smoke work dir: ${WORK_DIR}"

  prepare_bundle
  (cd "${BUNDLE_DIR}" && sha256sum -c SHA256SUMS --ignore-missing >/dev/null)

  local install_args=(
    --release-bundle "${BUNDLE_DIR}"
    --runtime-dir "${runtime_dir}"
    --install-dir "${install_dir}"
    --config-dir "${config_dir}"
    --log-dir "${log_dir}"
    --state-dir "${state_dir}"
    --port "${PORT}"
  )
  [[ "${INSTALL_DEPS}" -eq 1 ]] && install_args+=(--auto-install-deps)
  [[ "${RUN_INSTALL}" -eq 0 ]] && install_args+=(--dry-run)

  PROJECT_OS_SERVICE_NAME="${SMOKE_NAME}" \
  PROJECT_OS_USER="${user_name}" \
  PROJECT_OS_GROUP="${user_name}" \
  PROJECT_OS_SERVICE_FILE="${service_file}" \
  PROJECT_OS_CLI_LINK="${cli_link}" \
    "${REPO_ROOT}/scripts/bootstrap-project-os.sh" "${install_args[@]}"

  if [[ "${RUN_INSTALL}" -eq 0 ]]; then
    log "Dry run complete. Cleanup command is not needed because no host changes were made."
    log "Run for real with: $0 --run --bundle-dir ${BUNDLE_DIR} --smoke-name ${SMOKE_NAME} --port ${PORT}"
    log "Support command after a run: ${SMOKE_NAME} support-bundle --output ${support_file}"
    return 0
  fi

  PROJECT_OS_SERVICE_NAME="${SMOKE_NAME}" \
  PROJECT_OS_CONFIG_FILE="${config_file}" \
  PROJECT_OS_SERVICE_FILE="${service_file}" \
  PROJECT_OS_CLI_LINK="${cli_link}" \
    "${REPO_ROOT}/scripts/project-os" doctor || true

  PROJECT_OS_SERVICE_NAME="${SMOKE_NAME}" \
  PROJECT_OS_CONFIG_FILE="${config_file}" \
  PROJECT_OS_SERVICE_FILE="${service_file}" \
  PROJECT_OS_CLI_LINK="${cli_link}" \
    "${REPO_ROOT}/scripts/project-os" support-bundle \
      --release-bundle "${BUNDLE_DIR}" \
      --state-dir "${state_dir}" \
      --output "${support_file}" || true

  log "Support bundle: ${support_file}"
  if [[ "${KEEP_INSTALL}" -eq 1 ]]; then
    log "Keeping smoke install for inspection."
    log "Cleanup command: PROJECT_OS_SERVICE_NAME=${SMOKE_NAME} PROJECT_OS_CONFIG_FILE=${config_file} ${REPO_ROOT}/scripts/project-os uninstall --remove-data --confirm-delete-data DELETE-PROJECT-OS-DATA --yes"
    return 0
  fi
  cleanup_smoke_install "${config_file}"
}

main "$@"
