#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_OS_USER="${PROJECT_OS_USER:-projectos}"
PROJECT_OS_GROUP="${PROJECT_OS_GROUP:-projectos}"
RUNTIME_DIR="${PROJECT_OS_RUNTIME_DIR:-/var/lib/project-os}"
CONFIG_DIR="${PROJECT_OS_CONFIG_DIR:-/etc/project-os}"
LOG_DIR="${PROJECT_OS_LOG_DIR:-/var/log/project-os}"
INSTALL_DIR="${PROJECT_OS_INSTALL_DIR:-/opt/project-os}"
SERVICE_NAME="${PROJECT_OS_SERVICE_NAME:-project-os}"
SERVICE_FILE="${PROJECT_OS_SERVICE_FILE:-/etc/systemd/system/${SERVICE_NAME}.service}"
JAVA_BIN="${PROJECT_OS_JAVA_BIN:-/usr/bin/java}"
SERVER_PORT="${PROJECT_OS_SERVER_PORT:-8082}"
BACKEND_JAR="${PROJECT_OS_BACKEND_JAR:-}"
CLI_LINK="${PROJECT_OS_CLI_LINK:-/usr/local/bin/project-os}"
PROJECT_OS_VERSION="${PROJECT_OS_VERSION:-0.0.1-SNAPSHOT}"
PROJECT_OS_BUILD_SHA="${PROJECT_OS_BUILD_SHA:-}"
PROJECT_OS_BUILD_DATE="${PROJECT_OS_BUILD_DATE:-}"

DRY_RUN=0
CHECK_ONLY=0
NO_START=0
SKIP_TAILSCALE=0
SKIP_DOCKER=0
BACKEND_JAR_READY=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_PATH="${SCRIPT_DIR}/$(basename "${BASH_SOURCE[0]}")"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TARGET_BACKEND_JAR="${INSTALL_DIR}/backend/project-os-backend.jar"
INSTALLED_SETUP_SCRIPT="${INSTALL_DIR}/bin/install-project-os-service.sh"
INSTALLED_CLI="${INSTALL_DIR}/bin/project-os"

usage() {
  cat <<USAGE
Usage: $0 [options]

Options:
  --dry-run          Print actions without changing the host.
  --check           Report current service-user setup state.
  --no-start        Install files and unit, but do not enable/start systemd service.
  --runtime-dir DIR  Store Project OS runtime data, database, apps, and backups in DIR.
  --install-dir DIR  Install Project OS binaries into DIR.
  --config-dir DIR   Store Project OS host config in DIR.
  --log-dir DIR      Store Project OS logs in DIR.
  --port PORT        Run the production backend on PORT.
  --skip-tailscale  Do not attempt tailscale operator setup.
  --skip-docker     Do not add the project-os user to the docker group.
  -h, --help        Show this help.

Environment overrides:
  PROJECT_OS_USER, PROJECT_OS_GROUP, PROJECT_OS_RUNTIME_DIR,
  PROJECT_OS_CONFIG_DIR, PROJECT_OS_LOG_DIR, PROJECT_OS_INSTALL_DIR,
  PROJECT_OS_BACKEND_JAR, PROJECT_OS_JAVA_BIN, PROJECT_OS_SERVER_PORT,
  PROJECT_OS_SERVICE_NAME, PROJECT_OS_SERVICE_FILE, PROJECT_OS_CLI_LINK,
  PROJECT_OS_VERSION, PROJECT_OS_BUILD_SHA, PROJECT_OS_BUILD_DATE
USAGE
}

log() {
  printf '[project-os setup] %s\n' "$*"
}

warn() {
  printf '[project-os setup] warning: %s\n' "$*" >&2
}

die() {
  printf '[project-os setup] error: %s\n' "$*" >&2
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
  TARGET_BACKEND_JAR="${INSTALL_DIR}/backend/project-os-backend.jar"
  INSTALLED_SETUP_SCRIPT="${INSTALL_DIR}/bin/install-project-os-service.sh"
  INSTALLED_CLI="${INSTALL_DIR}/bin/project-os"
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
  exec sudo --preserve-env=PROJECT_OS_USER,PROJECT_OS_GROUP,PROJECT_OS_RUNTIME_DIR,PROJECT_OS_CONFIG_DIR,PROJECT_OS_LOG_DIR,PROJECT_OS_INSTALL_DIR,PROJECT_OS_BACKEND_JAR,PROJECT_OS_JAVA_BIN,PROJECT_OS_SERVER_PORT,PROJECT_OS_SERVICE_NAME,PROJECT_OS_SERVICE_FILE,PROJECT_OS_CLI_LINK,PROJECT_OS_VERSION,PROJECT_OS_BUILD_SHA,PROJECT_OS_BUILD_DATE,PROJECT_OS_ASSUME_DEPENDENCIES_INSTALLED bash "${SCRIPT_PATH}" "$@"
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
  log "Checking Project OS service-user setup."
  if id "${PROJECT_OS_USER}" >/dev/null 2>&1; then
    status_line "User" "present (${PROJECT_OS_USER})"
  else
    status_line "User" "missing (${PROJECT_OS_USER})"
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

  status_line "Project OS version" "${PROJECT_OS_VERSION}"
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
    status_line "Project OS command" "${INSTALLED_CLI}"
  else
    status_line "Project OS command" "missing (${INSTALLED_CLI})"
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
  if [[ ! -x "${JAVA_BIN}" ]]; then
    if [[ "${DRY_RUN}" -eq 1 && "${PROJECT_OS_ASSUME_DEPENDENCIES_INSTALLED:-0}" == "1" ]]; then
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
    docker compose version >/dev/null 2>&1 || warn "Docker Compose v2 was not found. Marketplace installs need the Docker Compose plugin."
  fi

  if command_exists findmnt; then
    local runtime_mount
    runtime_mount="$(path_mount_summary "${RUNTIME_DIR}")"
    [[ -n "${runtime_mount}" ]] && log "Runtime data will use filesystem: ${runtime_mount}"
  fi
}

build_sha() {
  if [[ -n "${PROJECT_OS_BUILD_SHA}" ]]; then
    printf '%s\n' "${PROJECT_OS_BUILD_SHA}"
    return 0
  fi
  if command_exists git && [[ -d "${REPO_ROOT}/.git" ]]; then
    git -C "${REPO_ROOT}" rev-parse --short=12 HEAD 2>/dev/null || printf 'development\n'
    return 0
  fi
  printf 'development\n'
}

build_date() {
  if [[ -n "${PROJECT_OS_BUILD_DATE}" ]]; then
    printf '%s\n' "${PROJECT_OS_BUILD_DATE}"
    return 0
  fi
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

ensure_group() {
  if getent group "${PROJECT_OS_GROUP}" >/dev/null; then
    log "Group ${PROJECT_OS_GROUP} already exists."
    return 0
  fi
  run groupadd --system "${PROJECT_OS_GROUP}"
}

ensure_user() {
  if id "${PROJECT_OS_USER}" >/dev/null 2>&1; then
    log "User ${PROJECT_OS_USER} already exists."
    local current_home
    current_home="$(getent passwd "${PROJECT_OS_USER}" | cut -d: -f6)"
    if [[ "${current_home}" != "${RUNTIME_DIR}" ]]; then
      run usermod --home "${RUNTIME_DIR}" "${PROJECT_OS_USER}"
      log "Updated ${PROJECT_OS_USER} home directory to ${RUNTIME_DIR}."
    fi
    return 0
  fi
  run useradd \
    --system \
    --gid "${PROJECT_OS_GROUP}" \
    --home-dir "${RUNTIME_DIR}" \
    --shell /usr/sbin/nologin \
    --comment "Project OS service user" \
    "${PROJECT_OS_USER}"
}

ensure_directories() {
  run install -d -o "${PROJECT_OS_USER}" -g "${PROJECT_OS_GROUP}" -m 0750 "${RUNTIME_DIR}"
  run install -d -o root -g "${PROJECT_OS_GROUP}" -m 0750 "${CONFIG_DIR}"
  run install -d -o "${PROJECT_OS_USER}" -g "${PROJECT_OS_GROUP}" -m 0750 "${LOG_DIR}"
  run install -d -o root -g root -m 0755 "${INSTALL_DIR}"
  run install -d -o root -g "${PROJECT_OS_GROUP}" -m 0750 "${INSTALL_DIR}/backend"
  run install -d -o root -g "${PROJECT_OS_GROUP}" -m 0750 "${INSTALL_DIR}/bin"
}

install_setup_script() {
  run install -o root -g "${PROJECT_OS_GROUP}" -m 0750 "${SCRIPT_PATH}" "${INSTALLED_SETUP_SCRIPT}"
  log "Installed setup script to ${INSTALLED_SETUP_SCRIPT}."
}

install_cli() {
  local cli_source="${REPO_ROOT}/scripts/project-os"
  if [[ ! -f "${cli_source}" ]]; then
    warn "Project OS helper command is missing from ${cli_source}."
    return 0
  fi
  run install -o root -g "${PROJECT_OS_GROUP}" -m 0755 "${cli_source}" "${INSTALLED_CLI}"
  log "Installed Project OS helper command to ${INSTALLED_CLI}."
  if [[ -n "${CLI_LINK}" ]]; then
    run ln -sfn "${INSTALLED_CLI}" "${CLI_LINK}"
    log "Linked Project OS helper command at ${CLI_LINK}."
  fi
}

configure_docker_access() {
  if [[ "${SKIP_DOCKER}" -eq 1 ]]; then
    log "Skipping Docker group setup."
    return 0
  fi
  if ! command_exists docker; then
    warn "Docker was not found. Install Docker before using marketplace app installs."
    return 0
  fi
  if ! getent group docker >/dev/null; then
    warn "Docker is installed, but the docker group does not exist. Configure Docker access for ${PROJECT_OS_USER} manually."
    return 0
  fi
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    run usermod -aG docker "${PROJECT_OS_USER}"
    log "Would add ${PROJECT_OS_USER} to the docker group."
    return 0
  fi
  if id -nG "${PROJECT_OS_USER}" | tr ' ' '\n' | grep -qx docker; then
    log "User ${PROJECT_OS_USER} is already in the docker group."
    return 0
  fi
  run usermod -aG docker "${PROJECT_OS_USER}"
  log "Added ${PROJECT_OS_USER} to the docker group."
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
    run tailscale set "--operator=${PROJECT_OS_USER}"
    log "Would configure ${PROJECT_OS_USER} as the Tailscale operator."
    return 0
  fi
  if run tailscale set "--operator=${PROJECT_OS_USER}"; then
    log "Configured ${PROJECT_OS_USER} as the Tailscale operator."
    if ! tailscale status >/dev/null 2>&1; then
      log "Tailscale is installed but not connected. Run 'sudo tailscale up' to enable private access."
    fi
  else
    warn "Could not set Tailscale operator. Connect Tailscale first, then rerun this script or run: sudo tailscale set --operator=${PROJECT_OS_USER}"
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
    warn "No backend jar found. Build one with './backend/gradlew -p backend bootJar' or pass PROJECT_OS_BACKEND_JAR=/path/to/app.jar."
    warn "The systemd unit will be installed, but the service will not be started until ${TARGET_BACKEND_JAR} exists."
    return 1
  fi
  [[ -f "${source_jar}" ]] || die "Backend jar does not exist: ${source_jar}"
  run install -o root -g "${PROJECT_OS_GROUP}" -m 0640 "${source_jar}" "${TARGET_BACKEND_JAR}"
  BACKEND_JAR_READY=1
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    log "Would install backend jar to ${TARGET_BACKEND_JAR}."
  else
    log "Installed backend jar to ${TARGET_BACKEND_JAR}."
  fi
}

write_env_file() {
  local env_file="${CONFIG_DIR}/project-os.env"
  local setup_command="sudo ${INSTALLED_SETUP_SCRIPT}"
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    log "Would write ${env_file} with runtime root ${RUNTIME_DIR} and port ${SERVER_PORT}."
    return 0
  fi

  local tmp_file
  tmp_file="$(mktemp)"
  if [[ -f "${env_file}" ]]; then
    grep -v -E '^(PROJECT_OS_RUNTIME_ROOT|PROJECT_OS_INSTALL_DIR|PROJECT_OS_BACKEND_JAR|PROJECT_OS_VERSION|PROJECT_OS_BUILD_SHA|PROJECT_OS_BUILD_DATE|SERVER_PORT|PROJECT_OS_SETUP_COMMAND)=' "${env_file}" >"${tmp_file}" || true
  fi
  cat >>"${tmp_file}" <<EOF
PROJECT_OS_RUNTIME_ROOT=${RUNTIME_DIR}
PROJECT_OS_INSTALL_DIR=${INSTALL_DIR}
PROJECT_OS_BACKEND_JAR=${TARGET_BACKEND_JAR}
PROJECT_OS_VERSION=${PROJECT_OS_VERSION}
PROJECT_OS_BUILD_SHA=$(build_sha)
PROJECT_OS_BUILD_DATE=$(build_date)
SERVER_PORT=${SERVER_PORT}
PROJECT_OS_SETUP_COMMAND=${setup_command}
EOF
  install -o root -g "${PROJECT_OS_GROUP}" -m 0640 "${tmp_file}" "${env_file}"
  rm -f "${tmp_file}"
  chown root:"${PROJECT_OS_GROUP}" "${env_file}"
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
Description=Project OS backend
Wants=network-online.target
After=network-online.target docker.service tailscaled.service

[Service]
Type=simple
User=${PROJECT_OS_USER}
Group=${PROJECT_OS_GROUP}
${supplementary_groups}
WorkingDirectory=${RUNTIME_DIR}
Environment=PROJECT_OS_RUNTIME_ROOT=${RUNTIME_DIR}
EnvironmentFile=-${CONFIG_DIR}/project-os.env
ExecStart=${JAVA_BIN} -jar ${TARGET_BACKEND_JAR}
Restart=on-failure
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF
  chmod 0644 "${SERVICE_FILE}"
  log "Installed systemd unit at ${SERVICE_FILE}."
}

enable_service() {
  if ! command_exists systemctl; then
    warn "systemctl is not available. The service file was written, but Project OS was not enabled or started."
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

  log "Installing Project OS service-user architecture."
  preflight_host
  ensure_group
  ensure_user
  ensure_directories
  install_setup_script
  install_cli
  configure_docker_access
  configure_tailscale_operator
  install_backend_jar || true
  write_env_file
  write_systemd_unit
  enable_service
  log "Setup complete. Run 'sudo ${INSTALLED_SETUP_SCRIPT} --check' to verify the host state."
}

main "$@"
