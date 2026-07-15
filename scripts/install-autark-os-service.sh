#!/usr/bin/env bash
set -Eeuo pipefail

AUTARK_OS_USER="${AUTARK_OS_USER:-autarkos}"
AUTARK_OS_GROUP="${AUTARK_OS_GROUP:-autarkos}"
RUNTIME_DIR="${AUTARK_OS_RUNTIME_DIR:-/var/lib/autark-os}"
CONFIG_DIR="${AUTARK_OS_CONFIG_DIR:-/etc/autark-os}"
LOG_DIR="${AUTARK_OS_LOG_DIR:-/var/log/autark-os}"
INSTALL_DIR="${AUTARK_OS_INSTALL_DIR:-/opt/autark-os}"
SERVICE_NAME="${AUTARK_OS_SERVICE_NAME:-autark-os}"
SERVICE_FILE="${AUTARK_OS_SERVICE_FILE:-/etc/systemd/system/${SERVICE_NAME}.service}"
JAVA_BIN="${AUTARK_OS_JAVA_BIN:-${INSTALL_DIR}/runtime/bin/java}"
SERVER_PORT="${AUTARK_OS_SERVER_PORT:-8082}"
BACKEND_JAR="${AUTARK_OS_BACKEND_JAR:-}"
CLI_LINK="${AUTARK_OS_CLI_LINK:-/usr/local/bin/autark-os}"
SUDOERS_FILE="${AUTARK_OS_SUDOERS_FILE:-/etc/sudoers.d/autark-os-fileops}"
AUTARK_OS_VERSION="${AUTARK_OS_VERSION:-0.0.1-SNAPSHOT}"
AUTARK_OS_BUILD_SHA="${AUTARK_OS_BUILD_SHA:-}"
AUTARK_OS_BUILD_DATE="${AUTARK_OS_BUILD_DATE:-}"
AUTARK_OS_UPDATE_CHANNEL="${AUTARK_OS_UPDATE_CHANNEL:-beta}"
AUTARK_OS_INSTALL_METHOD="${AUTARK_OS_INSTALL_METHOD:-portable}"
AUTARK_OS_UPDATE_REPOSITORY="${AUTARK_OS_UPDATE_REPOSITORY:-autark-labs/autark-os}"

DRY_RUN=0
CHECK_ONLY=0
NO_START=0
SKIP_TAILSCALE=1
SKIP_DOCKER=0
BACKEND_JAR_READY=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_PATH="${SCRIPT_DIR}/$(basename "${BASH_SOURCE[0]}")"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
RUNTIME_IMAGE_SOURCE="${AUTARK_OS_RUNTIME_IMAGE:-${REPO_ROOT}/runtime}"
TARGET_BACKEND_JAR="${INSTALL_DIR}/backend/autark-os-backend.jar"
TARGET_RUNTIME_DIR="${INSTALL_DIR}/runtime"
INSTALLED_SETUP_SCRIPT="${INSTALL_DIR}/bin/install-autark-os-service.sh"
INSTALLED_CLI="${INSTALL_DIR}/bin/autark-os"
INSTALLED_BOOTSTRAP="${INSTALL_DIR}/bin/bootstrap-autark-os.sh"
INSTALLED_HOST_MATRIX="${INSTALL_DIR}/bin/supported-host-matrix.env"
INSTALLED_FILEOPS_HELPER="${AUTARK_OS_FILEOPS_HELPER:-${INSTALL_DIR}/bin/autark-os-fileops}"
INSTALLED_RELEASE_METADATA_DIR="${INSTALL_DIR}/release-metadata"

usage() {
  cat <<USAGE
Usage: $0 [options]

Options:
  --dry-run          Print actions without changing the host.
  --check           Report current service-user setup state.
  --no-start        Install files and unit, but do not enable/start systemd service.
  --runtime-dir DIR  Store Autark-OS runtime data, database, apps, and backups in DIR.
  --install-dir DIR  Install Autark-OS binaries into DIR.
  --config-dir DIR   Store Autark-OS host config in DIR.
  --log-dir DIR      Store Autark-OS logs in DIR.
  --port PORT        Run the production backend on PORT.
  --configure-tailscale Configure the autarkos Tailscale operator when Tailscale is already installed.
  --skip-tailscale  Keep private-access configuration deferred (default).
  --skip-docker     Do not add the autark-os user to the docker group.
  -h, --help        Show this help.

Environment overrides:
  AUTARK_OS_USER, AUTARK_OS_GROUP, AUTARK_OS_RUNTIME_DIR,
  AUTARK_OS_CONFIG_DIR, AUTARK_OS_LOG_DIR, AUTARK_OS_INSTALL_DIR,
  AUTARK_OS_BACKEND_JAR, AUTARK_OS_JAVA_BIN, AUTARK_OS_SERVER_PORT,
  AUTARK_OS_SERVICE_NAME, AUTARK_OS_SERVICE_FILE, AUTARK_OS_CLI_LINK,
  AUTARK_OS_FILEOPS_HELPER, AUTARK_OS_SUDOERS_FILE, AUTARK_OS_VERSION,
  AUTARK_OS_BUILD_SHA, AUTARK_OS_BUILD_DATE, AUTARK_OS_UPDATE_CHANNEL,
  AUTARK_OS_INSTALL_METHOD, AUTARK_OS_UPDATE_REPOSITORY
USAGE
}

log() {
  printf '[autark-os setup] %s\n' "$*"
}

warn() {
  printf '[autark-os setup] warning: %s\n' "$*" >&2
}

die() {
  printf '[autark-os setup] error: %s\n' "$*" >&2
  exit 1
}

run() {
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    printf '+'
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi
  "$@"
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

refresh_derived_paths() {
  TARGET_BACKEND_JAR="${INSTALL_DIR}/backend/autark-os-backend.jar"
  TARGET_RUNTIME_DIR="${INSTALL_DIR}/runtime"
  INSTALLED_SETUP_SCRIPT="${INSTALL_DIR}/bin/install-autark-os-service.sh"
  INSTALLED_CLI="${INSTALL_DIR}/bin/autark-os"
  INSTALLED_BOOTSTRAP="${INSTALL_DIR}/bin/bootstrap-autark-os.sh"
  INSTALLED_HOST_MATRIX="${INSTALL_DIR}/bin/supported-host-matrix.env"
  INSTALLED_FILEOPS_HELPER="${AUTARK_OS_FILEOPS_HELPER:-${INSTALL_DIR}/bin/autark-os-fileops}"
  INSTALLED_RELEASE_METADATA_DIR="${INSTALL_DIR}/release-metadata"
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

env_file_value() {
  local file="$1"
  local key="$2"
  [[ -r "${file}" ]] || return 0
  awk -F= -v key="${key}" '$1 == key {print $2; exit}' "${file}"
}

java_major_version() {
  local java_cmd="$1"
  local version
  version="$("${java_cmd}" -version 2>&1 | awk -F '"' '/version/ {print $2; exit}')"
  if [[ "${version}" == 1.* ]]; then
    printf '%s\n' "${version#1.}" | cut -d. -f1
  else
    printf '%s\n' "${version}" | cut -d. -f1
  fi
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run)
        DRY_RUN=1
        ;;
      --check)
        CHECK_ONLY=1
        ;;
      --no-start)
        NO_START=1
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
      --install-dir)
        shift
        [[ $# -gt 0 ]] || die "--install-dir requires a path."
        INSTALL_DIR="$1"
        require_absolute_path "--install-dir" "${INSTALL_DIR}"
        ;;
      --install-dir=*)
        INSTALL_DIR="${1#*=}"
        require_absolute_path "--install-dir" "${INSTALL_DIR}"
        ;;
      --config-dir)
        shift
        [[ $# -gt 0 ]] || die "--config-dir requires a path."
        CONFIG_DIR="$1"
        require_absolute_path "--config-dir" "${CONFIG_DIR}"
        ;;
      --config-dir=*)
        CONFIG_DIR="${1#*=}"
        require_absolute_path "--config-dir" "${CONFIG_DIR}"
        ;;
      --log-dir)
        shift
        [[ $# -gt 0 ]] || die "--log-dir requires a path."
        LOG_DIR="$1"
        require_absolute_path "--log-dir" "${LOG_DIR}"
        ;;
      --log-dir=*)
        LOG_DIR="${1#*=}"
        require_absolute_path "--log-dir" "${LOG_DIR}"
        ;;
      --port)
        shift
        [[ $# -gt 0 ]] || die "--port requires a value."
        SERVER_PORT="$1"
        require_port "${SERVER_PORT}"
        ;;
      --port=*)
        SERVER_PORT="${1#*=}"
        require_port "${SERVER_PORT}"
        ;;
      --skip-tailscale)
        SKIP_TAILSCALE=1
        ;;
      --configure-tailscale)
        SKIP_TAILSCALE=0
        ;;
      --skip-docker)
        SKIP_DOCKER=1
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
  refresh_derived_paths
}

require_root_or_reexec() {
  if [[ "${DRY_RUN}" -eq 1 || "${CHECK_ONLY}" -eq 1 ]]; then
    return 0
  fi
  if [[ "$(id -u)" -eq 0 ]]; then
    return 0
  fi
  command_exists sudo || die "This installer needs root privileges. Install sudo or rerun as root."
  log "Requesting administrator privileges."
  exec sudo --preserve-env=AUTARK_OS_USER,AUTARK_OS_GROUP,AUTARK_OS_RUNTIME_DIR,AUTARK_OS_CONFIG_DIR,AUTARK_OS_LOG_DIR,AUTARK_OS_INSTALL_DIR,AUTARK_OS_BACKEND_JAR,AUTARK_OS_JAVA_BIN,AUTARK_OS_SERVER_PORT,AUTARK_OS_SERVICE_NAME,AUTARK_OS_SERVICE_FILE,AUTARK_OS_CLI_LINK,AUTARK_OS_FILEOPS_HELPER,AUTARK_OS_SUDOERS_FILE,AUTARK_OS_VERSION,AUTARK_OS_BUILD_SHA,AUTARK_OS_BUILD_DATE,AUTARK_OS_UPDATE_CHANNEL,AUTARK_OS_INSTALL_METHOD,AUTARK_OS_UPDATE_REPOSITORY,AUTARK_OS_ASSUME_DEPENDENCIES_INSTALLED bash "${SCRIPT_PATH}" "$@"
}

status_line() {
  local label="$1"
  local value="$2"
  printf '  %-28s %s\n' "${label}:" "${value}"
}

path_mount_summary() {
  local path="$1"
  local probe="${path}"
  while [[ ! -e "${probe}" && "${probe}" != "/" ]]; do
    probe="$(dirname "${probe}")"
  done
  if command_exists findmnt; then
    findmnt -T "${probe}" -o TARGET,SOURCE,FSTYPE -n 2>/dev/null || true
    return 0
  fi
  df -h "${probe}" 2>/dev/null | awk 'NR == 2 {print $6 " " $1 " " $2}' || true
}

check_state() {
  log "Checking Autark-OS service-user setup."
  if id "${AUTARK_OS_USER}" >/dev/null 2>&1; then
    status_line "User" "present (${AUTARK_OS_USER})"
  else
    status_line "User" "missing (${AUTARK_OS_USER})"
  fi

  for dir in "${RUNTIME_DIR}" "${CONFIG_DIR}" "${LOG_DIR}" "${INSTALL_DIR}"; do
    if [[ -d "${dir}" ]]; then
      status_line "${dir}" "present"
    else
      status_line "${dir}" "missing"
    fi
  done

  if [[ -f "${TARGET_BACKEND_JAR}" ]]; then
    status_line "Backend jar" "${TARGET_BACKEND_JAR}"
  else
    status_line "Backend jar" "missing (${TARGET_BACKEND_JAR})"
  fi

  status_line "Autark-OS version" "${AUTARK_OS_VERSION}"
  status_line "Build SHA" "$(build_sha)"
  status_line "Build date" "$(build_date)"

  local runtime_mount
  runtime_mount="$(path_mount_summary "${RUNTIME_DIR}")"
  [[ -n "${runtime_mount}" ]] && status_line "Runtime filesystem" "${runtime_mount}"

  if [[ -f "${INSTALLED_SETUP_SCRIPT}" ]]; then
    status_line "Setup command" "sudo ${INSTALLED_SETUP_SCRIPT}"
  else
    status_line "Setup command" "missing (${INSTALLED_SETUP_SCRIPT})"
  fi

  if [[ -f "${INSTALLED_CLI}" ]]; then
    status_line "Autark-OS command" "${INSTALLED_CLI}"
  else
    status_line "Autark-OS command" "missing (${INSTALLED_CLI})"
  fi

  if [[ -x "${INSTALLED_BOOTSTRAP}" && -r "${INSTALLED_HOST_MATRIX}" ]]; then
    status_line "Installer helpers" "present"
  else
    status_line "Installer helpers" "missing (${INSTALLED_BOOTSTRAP}, ${INSTALLED_HOST_MATRIX})"
  fi

  if [[ -f "${SERVICE_FILE}" ]]; then
    status_line "Systemd unit" "${SERVICE_FILE}"
  else
    status_line "Systemd unit" "missing (${SERVICE_FILE})"
  fi

  if command_exists systemctl; then
    status_line "Systemd service" "$(systemctl is-active "${SERVICE_NAME}" 2>/dev/null || true)"
  else
    status_line "Systemd" "not available"
  fi

  if command_exists docker; then
    if docker version >/dev/null 2>&1; then
      status_line "Docker" "installed and reachable"
    else
      status_line "Docker" "installed but daemon is not reachable"
    fi
    if docker compose version >/dev/null 2>&1; then
      status_line "Docker Compose" "available"
    else
      status_line "Docker Compose" "missing"
    fi
  else
    status_line "Docker" "missing"
  fi

  if command_exists tailscale; then
    if tailscale status >/dev/null 2>&1; then
      status_line "Tailscale" "installed and connected"
    else
      status_line "Tailscale" "installed but not connected"
    fi
  else
    status_line "Tailscale" "missing"
  fi
}

preflight_host() {
  if [[ -x "${RUNTIME_IMAGE_SOURCE}/bin/java" && -z "${AUTARK_OS_JAVA_BIN:-}" ]]; then
    JAVA_BIN="${RUNTIME_IMAGE_SOURCE}/bin/java"
  fi
  if [[ ! -x "${JAVA_BIN}" ]]; then
    if [[ "${DRY_RUN}" -eq 1 && "${AUTARK_OS_ASSUME_DEPENDENCIES_INSTALLED:-0}" == "1" ]]; then
      log "Dry run: service setup assumes Java 21 will be available after dependency installation."
      return 0
    fi
    local detected_java=""
    detected_java="$(command -v java || true)"
    [[ -n "${detected_java}" ]] || die "Java 21 is required, but ${JAVA_BIN} was not found and java is not on PATH."
    JAVA_BIN="${detected_java}"
    log "Using Java at ${JAVA_BIN}."
  fi

  local java_major
  java_major="$(java_major_version "${JAVA_BIN}")"
  [[ "${java_major}" =~ ^[0-9]+$ && "${java_major}" -ge 21 ]] || die "Java 21 or newer is required. ${JAVA_BIN} reports Java major version: ${java_major:-unknown}"

  if command_exists docker; then
    docker compose version >/dev/null 2>&1 || warn "Docker Compose v2 was not found. Discover installs need the Docker Compose plugin."
  fi

  if command_exists findmnt; then
    local runtime_mount
    runtime_mount="$(path_mount_summary "${RUNTIME_DIR}")"
    [[ -n "${runtime_mount}" ]] && log "Runtime data will use filesystem: ${runtime_mount}"
  fi
}

preflight_install_collision() {
  if [[ "${AUTARK_OS_ALLOW_INSTALL_COLLISION:-0}" == "1" ]]; then
    log "Collision preflight override enabled by AUTARK_OS_ALLOW_INSTALL_COLLISION=1."
    return 0
  fi

  local env_file="${CONFIG_DIR}/autark-os.env"
  if [[ ! -f "${env_file}" ]]; then
    preflight_stale_runtime_without_config
    return 0
  fi

  local existing_runtime existing_port
  existing_runtime="$(env_file_value "${env_file}" AUTARK_OS_RUNTIME_ROOT)"
  existing_port="$(env_file_value "${env_file}" SERVER_PORT)"

  if [[ -n "${existing_runtime}" && "${existing_runtime}" != "${RUNTIME_DIR}" ]]; then
    die "Existing Autark-OS config at ${env_file} uses runtime root ${existing_runtime}, but this install requested ${RUNTIME_DIR}. Use the same runtime root, choose a separate config/service name, or rerun with AUTARK_OS_ALLOW_INSTALL_COLLISION=1 if you intentionally want to replace this config."
  fi
  if [[ -n "${existing_port}" && "${existing_port}" != "${SERVER_PORT}" ]]; then
    die "Existing Autark-OS config at ${env_file} uses port ${existing_port}, but this install requested ${SERVER_PORT}. Use the same port, choose a separate config/service name, or rerun with AUTARK_OS_ALLOW_INSTALL_COLLISION=1 if you intentionally want to replace this config."
  fi
}

preflight_stale_runtime_without_config() {
  local identity_file="${RUNTIME_DIR}/config/identity.json"
  local apps_dir="${RUNTIME_DIR}/apps"
  local found_runtime=0
  if [[ -f "${identity_file}" ]]; then
    found_runtime=1
  fi
  if [[ -d "${apps_dir}" ]] && find "${apps_dir}" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null | grep -q .; then
    found_runtime=1
  fi
  [[ "${found_runtime}" -eq 1 ]] || return 0

  die "Existing Autark-OS runtime data was found at ${RUNTIME_DIR}, but no active config exists at ${CONFIG_DIR}/autark-os.env. Recover existing apps from the setup page, repair the existing install with the same runtime path, choose a separate development service/config/runtime, or rerun with AUTARK_OS_ALLOW_INSTALL_COLLISION=1 if you intentionally want to replace this runtime."
}

build_sha() {
  if [[ -n "${AUTARK_OS_BUILD_SHA}" ]]; then
    printf '%s\n' "${AUTARK_OS_BUILD_SHA}"
    return 0
  fi
  if command_exists git && [[ -d "${REPO_ROOT}/.git" ]]; then
    git -C "${REPO_ROOT}" rev-parse --short=12 HEAD 2>/dev/null || printf 'development\n'
    return 0
  fi
  printf 'development\n'
}

build_date() {
  if [[ -n "${AUTARK_OS_BUILD_DATE}" ]]; then
    printf '%s\n' "${AUTARK_OS_BUILD_DATE}"
    return 0
  fi
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

ensure_group() {
  if getent group "${AUTARK_OS_GROUP}" >/dev/null; then
    log "Group ${AUTARK_OS_GROUP} already exists."
    return 0
  fi
  run groupadd --system "${AUTARK_OS_GROUP}"
}

ensure_user() {
  if id "${AUTARK_OS_USER}" >/dev/null 2>&1; then
    log "User ${AUTARK_OS_USER} already exists."
    local current_home
    current_home="$(getent passwd "${AUTARK_OS_USER}" | cut -d: -f6)"
    if [[ "${current_home}" != "${RUNTIME_DIR}" ]]; then
      run usermod --home "${RUNTIME_DIR}" "${AUTARK_OS_USER}"
      log "Updated ${AUTARK_OS_USER} home directory to ${RUNTIME_DIR}."
    fi
    return 0
  fi
  run useradd \
    --system \
    --gid "${AUTARK_OS_GROUP}" \
    --home-dir "${RUNTIME_DIR}" \
    --shell /usr/sbin/nologin \
    --comment "Autark-OS service user" \
    "${AUTARK_OS_USER}"
}

ensure_directories() {
  run install -d -o "${AUTARK_OS_USER}" -g "${AUTARK_OS_GROUP}" -m 0750 "${RUNTIME_DIR}"
  run install -d -o root -g "${AUTARK_OS_GROUP}" -m 0750 "${CONFIG_DIR}"
  run install -d -o "${AUTARK_OS_USER}" -g "${AUTARK_OS_GROUP}" -m 0750 "${LOG_DIR}"
  run install -d -o root -g root -m 0755 "${INSTALL_DIR}"
  run install -d -o root -g "${AUTARK_OS_GROUP}" -m 0750 "${INSTALL_DIR}/backend"
  run install -d -o root -g "${AUTARK_OS_GROUP}" -m 0750 "${INSTALL_DIR}/bin"
}

install_setup_script() {
  run install -o root -g "${AUTARK_OS_GROUP}" -m 0750 "${SCRIPT_PATH}" "${INSTALLED_SETUP_SCRIPT}"
  log "Installed setup script to ${INSTALLED_SETUP_SCRIPT}."
}

install_cli() {
  local cli_source="${REPO_ROOT}/scripts/autark-os"
  local bootstrap_source="${REPO_ROOT}/scripts/bootstrap-autark-os.sh"
  local host_matrix_source="${REPO_ROOT}/scripts/supported-host-matrix.env"
  if [[ ! -f "${cli_source}" ]]; then
    warn "Autark-OS helper command is missing from ${cli_source}."
    return 0
  fi
  run install -o root -g "${AUTARK_OS_GROUP}" -m 0755 "${cli_source}" "${INSTALLED_CLI}"
  log "Installed Autark-OS helper command to ${INSTALLED_CLI}."
  if [[ -f "${bootstrap_source}" && -f "${host_matrix_source}" ]]; then
    run install -o root -g "${AUTARK_OS_GROUP}" -m 0755 "${bootstrap_source}" "${INSTALLED_BOOTSTRAP}"
    run install -o root -g "${AUTARK_OS_GROUP}" -m 0644 "${host_matrix_source}" "${INSTALLED_HOST_MATRIX}"
    log "Installed shared installer helpers beside the Autark-OS command."
  else
    warn "Shared installer helpers are missing. The installed 'autark-os install' and installer support-report plan may be unavailable."
  fi
  if [[ -n "${CLI_LINK}" ]]; then
    run ln -sfn "${INSTALLED_CLI}" "${CLI_LINK}"
    log "Linked Autark-OS helper command at ${CLI_LINK}."
  fi
}

install_fileops_helper() {
  local helper_source="${REPO_ROOT}/scripts/autark-os-fileops"
  if [[ ! -f "${helper_source}" ]]; then
    warn "Autark-OS file operations helper is missing from ${helper_source}."
    return 0
  fi
  run install -o root -g root -m 0755 "${helper_source}" "${INSTALLED_FILEOPS_HELPER}"
  log "Installed Autark-OS file operations helper to ${INSTALLED_FILEOPS_HELPER}."
}

configure_fileops_privilege() {
  local sudoers_dir
  sudoers_dir="$(dirname "${SUDOERS_FILE}")"
  local rule="${AUTARK_OS_USER} ALL=(root) NOPASSWD: ${INSTALLED_FILEOPS_HELPER} *"
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    run install -d -o root -g root -m 0755 "${sudoers_dir}"
    log "Would allow ${AUTARK_OS_USER} to run ${INSTALLED_FILEOPS_HELPER} through sudo without a password."
    return 0
  fi

  install -d -o root -g root -m 0755 "${sudoers_dir}"
  local tmp_file
  tmp_file="$(mktemp)"
  {
    printf '# Autark-OS bounded app-data file operations.\n'
    printf '%s\n' "${rule}"
  } >"${tmp_file}"
  if command_exists visudo; then
    visudo -cf "${tmp_file}" >/dev/null
  fi
  install -o root -g root -m 0440 "${tmp_file}" "${SUDOERS_FILE}"
  rm -f "${tmp_file}"
  log "Configured sudo access for Autark-OS file operations at ${SUDOERS_FILE}."
}

configure_docker_access() {
  if [[ "${SKIP_DOCKER}" -eq 1 ]]; then
    log "Skipping Docker group setup."
    return 0
  fi
  if ! command_exists docker; then
    warn "Docker was not found. Install Docker before using Discover app installs."
    return 0
  fi
  if ! getent group docker >/dev/null; then
    warn "Docker is installed, but the docker group does not exist. Configure Docker access for ${AUTARK_OS_USER} manually."
    return 0
  fi
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    run usermod -aG docker "${AUTARK_OS_USER}"
    log "Would add ${AUTARK_OS_USER} to the docker group."
    return 0
  fi
  if id -nG "${AUTARK_OS_USER}" | tr ' ' '\n' | grep -qx docker; then
    log "User ${AUTARK_OS_USER} is already in the docker group."
    return 0
  fi
  run usermod -aG docker "${AUTARK_OS_USER}"
  log "Added ${AUTARK_OS_USER} to the docker group."
}

configure_tailscale_operator() {
  if [[ "${SKIP_TAILSCALE}" -eq 1 ]]; then
    log "Skipping Tailscale operator setup."
    return 0
  fi
  if ! command_exists tailscale; then
    warn "Tailscale was not found. Private HTTPS app links will be enabled after Tailscale is installed and connected."
    return 0
  fi
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    run tailscale set "--operator=${AUTARK_OS_USER}"
    log "Would configure ${AUTARK_OS_USER} as the Tailscale operator."
    return 0
  fi
  if run tailscale set "--operator=${AUTARK_OS_USER}"; then
    log "Configured ${AUTARK_OS_USER} as the Tailscale operator."
    if ! tailscale status >/dev/null 2>&1; then
      log "Tailscale is installed but not connected. Run 'sudo tailscale up' to enable private access."
    fi
  else
    warn "Could not set Tailscale operator. Connect Tailscale first, then rerun this script or run: sudo tailscale set --operator=${AUTARK_OS_USER}"
  fi
}

find_backend_jar() {
  if [[ -n "${BACKEND_JAR}" ]]; then
    printf '%s\n' "${BACKEND_JAR}"
    return 0
  fi
  find "${REPO_ROOT}/backend/build/libs" -maxdepth 1 -type f -name '*.jar' ! -name '*plain*.jar' 2>/dev/null | sort | tail -n 1
}

install_backend_jar() {
  local source_jar
  source_jar="$(find_backend_jar)"
  if [[ -z "${source_jar}" ]]; then
    warn "No backend jar found. Build one with './backend/gradlew -p backend bootJar' or pass AUTARK_OS_BACKEND_JAR=/path/to/app.jar."
    warn "The systemd unit will be installed, but the service will not be started until ${TARGET_BACKEND_JAR} exists."
    return 1
  fi
  [[ -f "${source_jar}" ]] || die "Backend jar does not exist: ${source_jar}"
  run install -o root -g "${AUTARK_OS_GROUP}" -m 0640 "${source_jar}" "${TARGET_BACKEND_JAR}"
  BACKEND_JAR_READY=1
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    log "Would install backend jar to ${TARGET_BACKEND_JAR}."
  else
    log "Installed backend jar to ${TARGET_BACKEND_JAR}."
  fi
}

install_release_metadata() {
  local release_source="${REPO_ROOT}/autark-os-release.json"
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    log "Would install public release and update-channel metadata to ${INSTALLED_RELEASE_METADATA_DIR}."
    return 0
  fi
  install -d -o root -g root -m 0755 "${INSTALLED_RELEASE_METADATA_DIR}"
  if [[ -r "${release_source}" ]]; then
    install -o root -g root -m 0644 "${release_source}" "${INSTALLED_RELEASE_METADATA_DIR}/autark-os-release.json"
  fi
  local public_env
  public_env="$(mktemp)"
  cat >"${public_env}" <<EOF
AUTARK_OS_VERSION=${AUTARK_OS_VERSION}
AUTARK_OS_UPDATE_CHANNEL=${AUTARK_OS_UPDATE_CHANNEL}
AUTARK_OS_INSTALL_METHOD=${AUTARK_OS_INSTALL_METHOD}
AUTARK_OS_UPDATE_REPOSITORY=${AUTARK_OS_UPDATE_REPOSITORY}
AUTARK_OS_INSTALL_DIR=${INSTALL_DIR}
AUTARK_OS_RUNTIME_ROOT=${RUNTIME_DIR}
AUTARK_OS_CONFIG_DIR=${CONFIG_DIR}
AUTARK_OS_LOG_DIR=${LOG_DIR}
EOF
  install -o root -g root -m 0644 "${public_env}" "${INSTALLED_RELEASE_METADATA_DIR}/install.env"
  rm -f "${public_env}"
}

install_runtime_image() {
  [[ -x "${RUNTIME_IMAGE_SOURCE}/bin/java" ]] || return 0
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    log "Would install bundled Java runtime to ${TARGET_RUNTIME_DIR}."
  else
    rm -rf "${TARGET_RUNTIME_DIR}"
    cp -a "${RUNTIME_IMAGE_SOURCE}" "${TARGET_RUNTIME_DIR}"
  fi
  JAVA_BIN="${TARGET_RUNTIME_DIR}/bin/java"
}

write_env_file() {
  local env_file="${CONFIG_DIR}/autark-os.env"
  local setup_command="sudo ${INSTALLED_SETUP_SCRIPT}"
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    log "Would write ${env_file} with runtime root ${RUNTIME_DIR} and port ${SERVER_PORT}."
    return 0
  fi

  local tmp_file
  tmp_file="$(mktemp)"
  if [[ -f "${env_file}" ]]; then
    grep -v -E '^(AUTARK_OS_RUNTIME_ROOT|AUTARK_OS_INSTALL_DIR|AUTARK_OS_CONFIG_DIR|AUTARK_OS_LOG_DIR|AUTARK_OS_BACKEND_JAR|AUTARK_OS_FILEOPS_HELPER|AUTARK_OS_VERSION|AUTARK_OS_BUILD_SHA|AUTARK_OS_BUILD_DATE|AUTARK_OS_UPDATE_CHANNEL|AUTARK_OS_INSTALL_METHOD|AUTARK_OS_UPDATE_REPOSITORY|SERVER_PORT|LOGGING_FILE_NAME|AUTARK_OS_SETUP_COMMAND)=' "${env_file}" >"${tmp_file}" || true
  fi
  cat >>"${tmp_file}" <<EOF
AUTARK_OS_RUNTIME_ROOT=${RUNTIME_DIR}
AUTARK_OS_INSTALL_DIR=${INSTALL_DIR}
AUTARK_OS_CONFIG_DIR=${CONFIG_DIR}
AUTARK_OS_LOG_DIR=${LOG_DIR}
AUTARK_OS_BACKEND_JAR=${TARGET_BACKEND_JAR}
AUTARK_OS_FILEOPS_HELPER=${INSTALLED_FILEOPS_HELPER}
AUTARK_OS_VERSION=${AUTARK_OS_VERSION}
AUTARK_OS_BUILD_SHA=$(build_sha)
AUTARK_OS_BUILD_DATE=$(build_date)
AUTARK_OS_UPDATE_CHANNEL=${AUTARK_OS_UPDATE_CHANNEL}
AUTARK_OS_INSTALL_METHOD=${AUTARK_OS_INSTALL_METHOD}
AUTARK_OS_UPDATE_REPOSITORY=${AUTARK_OS_UPDATE_REPOSITORY}
SERVER_PORT=${SERVER_PORT}
LOGGING_FILE_NAME=${LOG_DIR}/autark-os.log
AUTARK_OS_SETUP_COMMAND=${setup_command}
EOF
  install -o root -g "${AUTARK_OS_GROUP}" -m 0640 "${tmp_file}" "${env_file}"
  rm -f "${tmp_file}"
  chown root:"${AUTARK_OS_GROUP}" "${env_file}"
  chmod 0640 "${env_file}"
  log "Updated ${env_file}."
}

write_systemd_unit() {
  local supplementary_groups=""
  if getent group docker >/dev/null 2>&1; then
    supplementary_groups="SupplementaryGroups=docker"
  fi

  if [[ "${DRY_RUN}" -eq 1 ]]; then
    log "Would write systemd unit to ${SERVICE_FILE}."
    return 0
  fi

  cat >"${SERVICE_FILE}" <<EOF
[Unit]
Description=Autark-OS backend
Wants=network-online.target
After=network-online.target docker.service tailscaled.service

[Service]
Type=simple
User=${AUTARK_OS_USER}
Group=${AUTARK_OS_GROUP}
${supplementary_groups}
WorkingDirectory=${RUNTIME_DIR}
Environment=AUTARK_OS_RUNTIME_ROOT=${RUNTIME_DIR}
EnvironmentFile=-${CONFIG_DIR}/autark-os.env
ExecStart=${JAVA_BIN} -jar ${TARGET_BACKEND_JAR}
Restart=on-failure
RestartSec=5
NoNewPrivileges=false

[Install]
WantedBy=multi-user.target
EOF
  chmod 0644 "${SERVICE_FILE}"
  log "Installed systemd unit at ${SERVICE_FILE}."
}

enable_service() {
  if ! command_exists systemctl; then
    warn "systemctl is not available. The service file was written, but Autark-OS was not enabled or started."
    return 0
  fi
  run systemctl daemon-reload
  if [[ "${NO_START}" -eq 1 ]]; then
    log "Skipping service enable/start because --no-start was provided."
    return 0
  fi
  if [[ "${BACKEND_JAR_READY}" -ne 1 && ! -f "${TARGET_BACKEND_JAR}" ]]; then
    warn "Backend jar is missing; skipping service enable/start."
    return 0
  fi
  run systemctl enable "${SERVICE_NAME}"
  run systemctl restart "${SERVICE_NAME}"
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    log "Would enable and restart ${SERVICE_NAME}."
  else
    log "Enabled and restarted ${SERVICE_NAME}."
  fi
}

main() {
  parse_args "$@"
  require_root_or_reexec "$@"

  if [[ "${CHECK_ONLY}" -eq 1 ]]; then
    check_state
    exit 0
  fi

  log "Installing Autark-OS service-user architecture."
  preflight_host
  preflight_install_collision
  ensure_group
  ensure_user
  ensure_directories
  install_setup_script
  install_cli
  install_fileops_helper
  configure_fileops_privilege
  configure_docker_access
  configure_tailscale_operator
  install_runtime_image
  install_backend_jar || true
  install_release_metadata
  write_env_file
  write_systemd_unit
  enable_service
  log "Setup complete. Run 'sudo ${INSTALLED_SETUP_SCRIPT} --check' to verify the host state."
}

main "$@"
