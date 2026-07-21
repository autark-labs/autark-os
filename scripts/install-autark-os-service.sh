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
DOCUMENTATION_DIR="${AUTARK_OS_DOCUMENTATION_DIR:-/usr/share/doc/autark-os}"
AUTARK_OS_VERSION="${AUTARK_OS_VERSION:-0.0.1-SNAPSHOT}"
AUTARK_OS_BUILD_SHA="${AUTARK_OS_BUILD_SHA:-}"
AUTARK_OS_BUILD_DATE="${AUTARK_OS_BUILD_DATE:-}"
AUTARK_OS_UPDATE_CHANNEL="${AUTARK_OS_UPDATE_CHANNEL:-beta}"
AUTARK_OS_INSTALL_METHOD="${AUTARK_OS_INSTALL_METHOD:-portable}"
AUTARK_OS_UPDATE_REPOSITORY="${AUTARK_OS_UPDATE_REPOSITORY:-autark-labs/autark-os}"
COSIGN_EXECUTABLE="${AUTARK_OS_COSIGN_EXECUTABLE:-${INSTALL_DIR}/bin/cosign}"

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
COSIGN_SOURCE="${REPO_ROOT}/tools/cosign"

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
  AUTARK_OS_INSTALL_METHOD, AUTARK_OS_UPDATE_REPOSITORY,
  AUTARK_OS_DOCUMENTATION_DIR, AUTARK_OS_COSIGN_EXECUTABLE
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

require_supported_systemd_hardening() {
  # ProtectClock is the newest directive in the reviewed unit profile. Debian
  # 11/Raspberry Pi OS Bullseye ships systemd 247; every supported target is
  # at or above that baseline. Refuse before changing files on older hosts so
  # an update leaves the previous unit available for rollback.
  command_exists systemctl || return 0
  local systemd_version
  systemd_version="$(systemctl --version 2>/dev/null | awk 'NR == 1 {print $2}')"
  if [[ "${systemd_version}" =~ ^[0-9]+$ && "${systemd_version}" -lt 247 ]]; then
    die "Autark-OS requires systemd 247 or newer for its supported service hardening profile. No service files were changed; upgrade this host or use a supported OS release."
  fi
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
  COSIGN_EXECUTABLE="${AUTARK_OS_COSIGN_EXECUTABLE:-${INSTALL_DIR}/bin/cosign}"
  COSIGN_SOURCE="${REPO_ROOT}/tools/cosign"
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

jar_manifest_value() {
  local jar="$1"
  local key="$2"
  command_exists unzip || return 1
  unzip -p "${jar}" META-INF/MANIFEST.MF 2>/dev/null | tr -d '\r' | awk -F': ' -v key="${key}" '$1 == key {print $2; exit}'
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
  require_absolute_path "AUTARK_OS_COSIGN_EXECUTABLE" "${COSIGN_EXECUTABLE}"
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
  exec sudo --preserve-env=AUTARK_OS_USER,AUTARK_OS_GROUP,AUTARK_OS_RUNTIME_DIR,AUTARK_OS_CONFIG_DIR,AUTARK_OS_LOG_DIR,AUTARK_OS_INSTALL_DIR,AUTARK_OS_BACKEND_JAR,AUTARK_OS_JAVA_BIN,AUTARK_OS_SERVER_PORT,AUTARK_OS_SERVICE_NAME,AUTARK_OS_SERVICE_FILE,AUTARK_OS_CLI_LINK,AUTARK_OS_FILEOPS_HELPER,AUTARK_OS_SUDOERS_FILE,AUTARK_OS_VERSION,AUTARK_OS_BUILD_SHA,AUTARK_OS_BUILD_DATE,AUTARK_OS_UPDATE_CHANNEL,AUTARK_OS_INSTALL_METHOD,AUTARK_OS_UPDATE_REPOSITORY,AUTARK_OS_DOCUMENTATION_DIR,AUTARK_OS_COSIGN_EXECUTABLE,AUTARK_OS_ASSUME_DEPENDENCIES_INSTALLED bash "${SCRIPT_PATH}" "$@"
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
  local installed_env="${CONFIG_DIR}/autark-os.env"
  local installed_version installed_sha installed_date installed_helper_sha actual_helper_sha
  local jar_version="" jar_sha="" jar_date="" identity_ok=0 security_ok=0
  installed_version="$(env_file_value "${installed_env}" AUTARK_OS_VERSION)"
  installed_sha="$(env_file_value "${installed_env}" AUTARK_OS_BUILD_SHA)"
  installed_date="$(env_file_value "${installed_env}" AUTARK_OS_BUILD_DATE)"
  installed_helper_sha="$(env_file_value "${installed_env}" AUTARK_OS_FILEOPS_HELPER_SHA256)"
  [[ -n "${installed_version}" ]] || installed_version="${AUTARK_OS_VERSION}"
  [[ -n "${installed_sha}" ]] || installed_sha="$(build_sha)"
  [[ -n "${installed_date}" ]] || installed_date="$(build_date)"
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

  local admin_credential_dir="${RUNTIME_DIR}/config"
  local admin_local_secret="${admin_credential_dir}/admin-local-secret"
  local admin_setup_code="${admin_credential_dir}/admin-setup-code"
  if [[ -f "${admin_local_secret}" ]]; then
    status_line "Admin recovery credential" "protected ($(stat -c '%a %U:%G' "${admin_local_secret}" 2>/dev/null || printf 'owner-only'))"
  else
    status_line "Admin recovery credential" "not initialized (start the service)"
  fi
  if [[ -f "${admin_setup_code}" ]]; then
    status_line "Admin setup code" "available with sudo autark-os admin setup-code"
  else
    status_line "Admin setup code" "not present (expected after claim)"
  fi

  if [[ -f "${TARGET_BACKEND_JAR}" ]]; then
    status_line "Backend jar" "${TARGET_BACKEND_JAR}"
    if command_exists unzip; then
      jar_version="$(jar_manifest_value "${TARGET_BACKEND_JAR}" Implementation-Version || true)"
      jar_sha="$(jar_manifest_value "${TARGET_BACKEND_JAR}" Autark-OS-Build-Sha || true)"
      jar_date="$(jar_manifest_value "${TARGET_BACKEND_JAR}" Autark-OS-Build-Date || true)"
      status_line "Backend jar version" "${jar_version:-missing}"
      status_line "Backend jar build SHA" "${jar_sha:-missing}"
      status_line "Backend jar build date" "${jar_date:-missing}"
      if [[ "${jar_version}" != "${installed_version}" || "${jar_sha}" != "${installed_sha}" || "${jar_date}" != "${installed_date}" ]]; then
        identity_ok=1
      fi
    else
      status_line "Backend jar identity" "cannot inspect (unzip is missing)"
      identity_ok=1
    fi
  else
    status_line "Backend jar" "missing (${TARGET_BACKEND_JAR})"
  fi

  status_line "Autark-OS version" "${installed_version}"
  status_line "Build SHA" "${installed_sha}"
  status_line "Build date" "${installed_date}"

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
  if [[ -x "${COSIGN_EXECUTABLE}" ]]; then
    status_line "Pro image verifier" "present (${COSIGN_EXECUTABLE})"
  else
    status_line "Pro image verifier" "unavailable (${COSIGN_EXECUTABLE}); CE remains available"
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

  # Only enforce ownership checks for real system locations. Custom paths are
  # deliberately supported for isolated tests and development installations.
  if [[ "${AUTARK_OS_ENFORCE_SERVICE_HARDENING_CHECK:-0}" == 1 || "${INSTALL_DIR}" == /opt/* || "${CONFIG_DIR}" == /etc/* || "${SERVICE_FILE}" == /etc/* || "${SUDOERS_FILE}" == /etc/* ]]; then
    local security_paths_ok=1
    check_root_owned_path() {
      local label="$1"
      local path="$2"
      local required="$3"
      if [[ ! -e "${path}" ]]; then
        status_line "${label}" "missing (${path})"
        security_paths_ok=0
        return
      fi
      local owner mode
      owner="$(stat -c '%U' "${path}" 2>/dev/null || printf 'unknown')"
      mode="$(stat -c '%a' "${path}" 2>/dev/null || printf '0000')"
      if [[ "${owner}" != root || ! "${mode}" =~ ^[0-7]{3,4}$ || $(( 8#${mode} & 0022 )) -ne 0 ]]; then
        status_line "${label}" "needs repair (${owner}:${mode})"
        security_paths_ok=0
        return
      fi
      status_line "${label}" "protected (${owner}:${mode})"
    }
    check_root_owned_path "Installed helper" "${INSTALLED_FILEOPS_HELPER}" "required"
    check_root_owned_path "Autark-OS command" "${INSTALLED_CLI}" "required"
    check_root_owned_path "Bootstrap helper" "${INSTALLED_BOOTSTRAP}" "required"
    check_root_owned_path "Host support matrix" "${INSTALLED_HOST_MATRIX}" "required"
    if [[ -e "${COSIGN_EXECUTABLE}" ]]; then
      check_root_owned_path "Pro image verifier" "${COSIGN_EXECUTABLE}" "optional"
    fi
    check_root_owned_path "Installed backend" "${TARGET_BACKEND_JAR}" "required"
    check_root_owned_path "Program directory" "${INSTALL_DIR}" "required"
    check_root_owned_path "Service unit" "${SERVICE_FILE}" "required"
    check_root_owned_path "Sudoers rule" "${SUDOERS_FILE}" "required"
    check_root_owned_path "Service environment" "${installed_env}" "required"
    if [[ -e "${CONFIG_DIR}/backup-destination.env" ]]; then
      check_root_owned_path "Backup destination policy" "${CONFIG_DIR}/backup-destination.env" "optional"
    fi
    if [[ -x "${INSTALLED_FILEOPS_HELPER}" && -n "${installed_helper_sha}" ]] && command_exists sha256sum; then
      actual_helper_sha="$(sha256sum "${INSTALLED_FILEOPS_HELPER}" | awk '{print $1}')"
      if [[ "${actual_helper_sha}" != "${installed_helper_sha}" ]]; then
        status_line "Installed helper identity" "needs repair (checksum differs)"
        security_paths_ok=0
      else
        status_line "Installed helper identity" "verified"
      fi
    elif [[ -x "${INSTALLED_FILEOPS_HELPER}" ]]; then
      status_line "Installed helper identity" "needs repair (checksum is missing)"
      security_paths_ok=0
    fi
    if [[ -f "${SERVICE_FILE}" ]]; then
      local required_directives=(
        'NoNewPrivileges=false'
        'PrivateTmp=true'
        'ProtectSystem=strict'
        'ProtectHome=true'
        'ProtectKernelTunables=true'
        'ProtectKernelModules=true'
        'ProtectControlGroups=true'
        'ProtectClock=true'
        'ProtectKernelLogs=true'
        'PrivateDevices=true'
        'LockPersonality=true'
        'RestrictRealtime=true'
        'SystemCallArchitectures=native'
        'RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6'
        'CapabilityBoundingSet='
        'AmbientCapabilities='
      )
      local directive
      for directive in "${required_directives[@]}"; do
        if ! grep -Fxq "${directive}" "${SERVICE_FILE}"; then
          status_line "Service hardening" "needs repair (missing ${directive})"
          security_paths_ok=0
          break
        fi
      done
      if ! grep -Fxq "ReadWritePaths=${RUNTIME_DIR} ${LOG_DIR} ${CONFIG_DIR}" "${SERVICE_FILE}"; then
        status_line "Service hardening" "needs repair (missing explicit writable paths)"
        security_paths_ok=0
      fi
    fi
    if [[ -f "${SUDOERS_FILE}" ]] && ! grep -Fqx "${AUTARK_OS_USER} ALL=(root) NOPASSWD: ${INSTALLED_FILEOPS_HELPER} *" "${SUDOERS_FILE}"; then
      status_line "Sudoers rule" "needs repair (helper allow-list differs)"
      security_paths_ok=0
    fi
    if id "${AUTARK_OS_USER}" >/dev/null 2>&1; then
      local service_groups unexpected_group=""
      service_groups="$(id -nG "${AUTARK_OS_USER}")"
      local group_name
      for group_name in ${service_groups}; do
        if [[ "${group_name}" != "${AUTARK_OS_GROUP}" && "${group_name}" != docker ]]; then
          unexpected_group="${group_name}"
          break
        fi
      done
      if [[ -n "${unexpected_group}" ]]; then
        status_line "Service user groups" "needs review (unexpected ${unexpected_group})"
        security_paths_ok=0
      else
        status_line "Service user groups" "expected (${service_groups})"
      fi
    else
      status_line "Service user groups" "needs repair (service user is missing)"
      security_paths_ok=0
    fi
    if [[ "${security_paths_ok}" -eq 1 ]]; then
      status_line "Service hardening" "protected (privileged helper exception documented)"
    else
      security_ok=1
    fi
  else
    status_line "Service hardening" "not checked for custom paths"
  fi

  if [[ "${identity_ok}" -ne 0 ]]; then
    warn "Installed release identity does not match the backend jar. Run 'sudo autark-os update' or reinstall a verified release bundle."
    return 1
  fi
  if [[ "${security_ok}" -ne 0 ]]; then
    warn "Installed service permissions or hardening directives have drifted. Run 'sudo ${INSTALLED_SETUP_SCRIPT}' to repair them."
    return 1
  fi
}

preflight_host() {
  require_supported_systemd_hardening
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
  run install -d -o root -g root -m 0755 "${INSTALL_DIR}/backend"
  # The installed command is intentionally available to the interactive host
  # user through /usr/local/bin. Runtime and configuration paths remain private.
  run install -d -o root -g root -m 0755 "${INSTALL_DIR}/bin"
}

install_setup_script() {
  run install -o root -g root -m 0750 "${SCRIPT_PATH}" "${INSTALLED_SETUP_SCRIPT}"
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
  run install -o root -g root -m 0755 "${cli_source}" "${INSTALLED_CLI}"
  log "Installed Autark-OS helper command to ${INSTALLED_CLI}."
  if [[ -f "${bootstrap_source}" && -f "${host_matrix_source}" ]]; then
    run install -o root -g root -m 0755 "${bootstrap_source}" "${INSTALLED_BOOTSTRAP}"
    run install -o root -g root -m 0644 "${host_matrix_source}" "${INSTALLED_HOST_MATRIX}"
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

install_cosign() {
  if [[ ! -f "${COSIGN_SOURCE}" ]]; then
    warn "Pinned Cosign verifier is missing from ${COSIGN_SOURCE}. Community Edition remains available, but Autark Pro image activation will fail closed."
    return 0
  fi
  [[ -x "${COSIGN_SOURCE}" ]] ||
    die "Pinned Cosign verifier is not executable: ${COSIGN_SOURCE}"
  run install -D -o root -g root -m 0755 "${COSIGN_SOURCE}" "${COSIGN_EXECUTABLE}"
  log "Installed the Autark Pro image verifier to ${COSIGN_EXECUTABLE}."
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
  run install -o root -g root -m 0644 "${source_jar}" "${TARGET_BACKEND_JAR}"
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

install_release_docs() {
  local docs_source="${REPO_ROOT}/docs"
  local document
  local required_documents=(
    GETTING_STARTED.md
    RELEASE_NOTES.md
    LICENSE.md
    COMMERCIAL-LICENSE.md
    THIRD_PARTY_NOTICES.md
    THIRD_PARTY_COMPONENTS.txt
    THIRD_PARTY_FRONTEND_LOCK.txt
    SUPPORT.md
    SECURITY.md
  )
  if [[ ! -d "${docs_source}" ]]; then
    warn "Release documentation is missing from ${docs_source}."
    return 0
  fi
  run install -d -o root -g root -m 0755 "${DOCUMENTATION_DIR}"
  for document in "${required_documents[@]}"; do
    if [[ -r "${docs_source}/${document}" ]]; then
      run install -o root -g root -m 0644 "${docs_source}/${document}" "${DOCUMENTATION_DIR}/${document}"
    else
      warn "Release documentation is missing: ${docs_source}/${document}"
    fi
  done
  log "Installed offline release documentation at ${DOCUMENTATION_DIR}."
}

install_runtime_image() {
  [[ -x "${RUNTIME_IMAGE_SOURCE}/bin/java" ]] || return 0
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    log "Would install bundled Java runtime to ${TARGET_RUNTIME_DIR}."
  else
    rm -rf "${TARGET_RUNTIME_DIR}"
    cp -a "${RUNTIME_IMAGE_SOURCE}" "${TARGET_RUNTIME_DIR}"
    chown -R root:root "${TARGET_RUNTIME_DIR}"
    chmod -R go-w "${TARGET_RUNTIME_DIR}"
  fi
  JAVA_BIN="${TARGET_RUNTIME_DIR}/bin/java"
}

write_env_file() {
  local env_file="${CONFIG_DIR}/autark-os.env"
  local setup_command="sudo ${INSTALLED_SETUP_SCRIPT}"
  local fileops_helper_sha=""
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    log "Would write ${env_file} with runtime root ${RUNTIME_DIR} and port ${SERVER_PORT}."
    return 0
  fi

  local tmp_file
  tmp_file="$(mktemp)"
  if [[ -f "${env_file}" ]]; then
    grep -v -E '^(AUTARK_OS_RUNTIME_ROOT|AUTARK_OS_INSTALL_DIR|AUTARK_OS_CONFIG_DIR|AUTARK_OS_LOG_DIR|AUTARK_OS_BACKEND_JAR|AUTARK_OS_FILEOPS_HELPER|AUTARK_OS_FILEOPS_HELPER_SHA256|AUTARK_OS_COSIGN_EXECUTABLE|AUTARK_OS_VERSION|AUTARK_OS_BUILD_SHA|AUTARK_OS_BUILD_DATE|AUTARK_OS_UPDATE_CHANNEL|AUTARK_OS_INSTALL_METHOD|AUTARK_OS_UPDATE_REPOSITORY|SERVER_PORT|LOGGING_FILE_NAME|AUTARK_OS_SETUP_COMMAND)=' "${env_file}" >"${tmp_file}" || true
  fi
  if command_exists sha256sum; then
    fileops_helper_sha="$(sha256sum "${INSTALLED_FILEOPS_HELPER}" | awk '{print $1}')"
  else
    die "sha256sum is required to record the installed privileged helper identity."
  fi
  cat >>"${tmp_file}" <<EOF
AUTARK_OS_RUNTIME_ROOT=${RUNTIME_DIR}
AUTARK_OS_INSTALL_DIR=${INSTALL_DIR}
AUTARK_OS_CONFIG_DIR=${CONFIG_DIR}
AUTARK_OS_LOG_DIR=${LOG_DIR}
AUTARK_OS_BACKEND_JAR=${TARGET_BACKEND_JAR}
AUTARK_OS_FILEOPS_HELPER=${INSTALLED_FILEOPS_HELPER}
AUTARK_OS_FILEOPS_HELPER_SHA256=${fileops_helper_sha}
AUTARK_OS_COSIGN_EXECUTABLE=${COSIGN_EXECUTABLE}
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
SuccessExitStatus=143
Restart=on-failure
RestartSec=5
# The bounded root helper is invoked through sudo for restore, cleanup, and
# Tailscale operator repair. sudo needs to retain its setuid transition, so
# NoNewPrivileges cannot be enabled until that helper becomes a dedicated root
# service. All other compatible sandboxing remains enabled below.
NoNewPrivileges=false
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
ProtectClock=true
ProtectKernelLogs=true
PrivateDevices=true
LockPersonality=true
RestrictRealtime=true
SystemCallArchitectures=native
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
CapabilityBoundingSet=
AmbientCapabilities=
UMask=0077
# The root helper also writes the root-owned approved-backup destination file.
ReadWritePaths=${RUNTIME_DIR} ${LOG_DIR} ${CONFIG_DIR}

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
  install_cosign
  configure_fileops_privilege
  configure_docker_access
  configure_tailscale_operator
  install_runtime_image
  install_backend_jar || true
  install_release_metadata
  install_release_docs
  write_env_file
  write_systemd_unit
  enable_service
  log "Setup complete. Run 'sudo ${INSTALLED_SETUP_SCRIPT} --check' to verify the host state."
}

main "$@"
