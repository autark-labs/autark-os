#!/usr/bin/env bash
set -Eeuo pipefail

SKIP_TESTS=0
NO_START=0
INSTALL_ONLY=0
DRY_RUN=0
AUTO_INSTALL_DEPS=0
PLAN_ONLY=0
DOCTOR_ONLY=0
JSON_OUTPUT=0
RELEASE_BUNDLE_DIR=""
RELEASE_JAR=""
RELEASE_METADATA=""
RUNTIME_DIR_OVERRIDE=""
INSTALL_DIR_OVERRIDE=""
CONFIG_DIR_OVERRIDE=""
LOG_DIR_OVERRIDE=""
SERVER_PORT_OVERRIDE=""
STATE_DIR_OVERRIDE=""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
INSTALL_SCRIPT="${SCRIPT_DIR}/install-project-os-service.sh"

usage() {
  cat <<USAGE
Usage: $0 [options]

Build and install Project OS from this checkout, or install a packaged release.

Options:
  --skip-tests       Skip backend tests before packaging.
  --no-start         Install service files but do not enable/start project-os.service.
  --install-only     Skip builds and install the existing backend jar.
  --dry-run          Show install actions without changing the host.
  --plan             Print the install plan without changing the host.
  --doctor           Check whether this host is ready before installing.
  --json             With --plan or --doctor, print JSON.
  --auto-install-deps Install supported host dependencies on Debian/Ubuntu/RPi OS.
  --release-bundle DIR Install from a packaged release bundle instead of building this checkout.
  --release-jar FILE   Install this packaged backend jar instead of building this checkout.
  --runtime-dir DIR  Store Project OS runtime data, database, apps, and backups in DIR.
  --install-dir DIR  Install Project OS binaries into DIR. Default: /opt/project-os.
  --config-dir DIR   Store Project OS host config in DIR. Default: /etc/project-os.
  --log-dir DIR      Store Project OS logs in DIR. Default: /var/log/project-os.
  --state-dir DIR    Store resumable installer state in DIR.
  --port PORT        Run the production backend on PORT. Default: 8082.
  -h, --help         Show this help.

Repo mode builds Project OS from this checkout. Release mode installs a
prebuilt backend jar and does not require Node.js or Yarn on the target host.
USAGE
}

log() {
  printf '[project-os bootstrap] %s\n' "$*"
}

die() {
  printf '[project-os bootstrap] error: %s\n' "$*" >&2
  exit 1
}

has_command() {
  command -v "$1" >/dev/null 2>&1
}

apt_package_installed() {
  dpkg-query -W -f='${Status}' "$1" 2>/dev/null | grep -q 'install ok installed'
}

os_field() {
  local key="$1"
  local os_release="${PROJECT_OS_OS_RELEASE_FIXTURE:-/etc/os-release}"
  [[ -r "${os_release}" ]] || return 0
  awk -F= -v key="${key}" '$1 == key {gsub(/"/, "", $2); print $2; exit}' "${os_release}"
}

is_apt_host() {
  has_command apt-get
}

supported_apt_host() {
  is_apt_host || return 1
  local os_id os_like
  os_id="$(os_field ID || true)"
  os_like="$(os_field ID_LIKE || true)"
  case "${os_id} ${os_like}" in
    *debian*|*ubuntu*|*raspbian*) return 0 ;;
    *) return 1 ;;
  esac
}

run_root() {
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    printf '+'
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
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

require_readable_file() {
  local label="$1"
  local value="$2"
  [[ -f "${value}" && -r "${value}" ]] || die "${label} must be a readable file: ${value}"
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

java_21_available() {
  has_command java || return 1
  local major
  major="$(java_major_version java)"
  [[ "${major}" =~ ^[0-9]+$ && "${major}" -ge 21 ]]
}

yarn_1_available() {
  has_command yarn || return 1
  local version
  version="$(yarn --version 2>/dev/null || true)"
  [[ "${version}" == 1.* ]]
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --skip-tests)
        SKIP_TESTS=1
        ;;
      --no-start)
        NO_START=1
        ;;
      --install-only)
        INSTALL_ONLY=1
        ;;
      --dry-run)
        DRY_RUN=1
        ;;
      --plan)
        PLAN_ONLY=1
        ;;
      --doctor)
        DOCTOR_ONLY=1
        ;;
      --json)
        JSON_OUTPUT=1
        ;;
      --auto-install-deps)
        AUTO_INSTALL_DEPS=1
        ;;
      --release-bundle)
        shift
        [[ $# -gt 0 ]] || die "--release-bundle requires a directory."
        RELEASE_BUNDLE_DIR="$1"
        ;;
      --release-bundle=*)
        RELEASE_BUNDLE_DIR="${1#*=}"
        ;;
      --release-jar)
        shift
        [[ $# -gt 0 ]] || die "--release-jar requires a file."
        RELEASE_JAR="$1"
        ;;
      --release-jar=*)
        RELEASE_JAR="${1#*=}"
        ;;
      --runtime-dir)
        shift
        [[ $# -gt 0 ]] || die "--runtime-dir requires a path."
        RUNTIME_DIR_OVERRIDE="$1"
        require_absolute_path "--runtime-dir" "${RUNTIME_DIR_OVERRIDE}"
        ;;
      --runtime-dir=*)
        RUNTIME_DIR_OVERRIDE="${1#*=}"
        require_absolute_path "--runtime-dir" "${RUNTIME_DIR_OVERRIDE}"
        ;;
      --install-dir)
        shift
        [[ $# -gt 0 ]] || die "--install-dir requires a path."
        INSTALL_DIR_OVERRIDE="$1"
        require_absolute_path "--install-dir" "${INSTALL_DIR_OVERRIDE}"
        ;;
      --install-dir=*)
        INSTALL_DIR_OVERRIDE="${1#*=}"
        require_absolute_path "--install-dir" "${INSTALL_DIR_OVERRIDE}"
        ;;
      --config-dir)
        shift
        [[ $# -gt 0 ]] || die "--config-dir requires a path."
        CONFIG_DIR_OVERRIDE="$1"
        require_absolute_path "--config-dir" "${CONFIG_DIR_OVERRIDE}"
        ;;
      --config-dir=*)
        CONFIG_DIR_OVERRIDE="${1#*=}"
        require_absolute_path "--config-dir" "${CONFIG_DIR_OVERRIDE}"
        ;;
      --log-dir)
        shift
        [[ $# -gt 0 ]] || die "--log-dir requires a path."
        LOG_DIR_OVERRIDE="$1"
        require_absolute_path "--log-dir" "${LOG_DIR_OVERRIDE}"
        ;;
      --log-dir=*)
        LOG_DIR_OVERRIDE="${1#*=}"
        require_absolute_path "--log-dir" "${LOG_DIR_OVERRIDE}"
        ;;
      --state-dir)
        shift
        [[ $# -gt 0 ]] || die "--state-dir requires a path."
        STATE_DIR_OVERRIDE="$1"
        require_absolute_path "--state-dir" "${STATE_DIR_OVERRIDE}"
        ;;
      --state-dir=*)
        STATE_DIR_OVERRIDE="${1#*=}"
        require_absolute_path "--state-dir" "${STATE_DIR_OVERRIDE}"
        ;;
      --port)
        shift
        [[ $# -gt 0 ]] || die "--port requires a value."
        SERVER_PORT_OVERRIDE="$1"
        require_port "${SERVER_PORT_OVERRIDE}"
        ;;
      --port=*)
        SERVER_PORT_OVERRIDE="${1#*=}"
        require_port "${SERVER_PORT_OVERRIDE}"
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
  resolve_release_bundle
  if [[ "${JSON_OUTPUT}" -eq 1 && "${PLAN_ONLY}" -eq 0 && "${DOCTOR_ONLY}" -eq 0 ]]; then
    die "--json is currently supported with --plan or --doctor."
  fi
}

resolve_release_bundle() {
  if [[ -n "${RELEASE_BUNDLE_DIR}" ]]; then
    [[ -d "${RELEASE_BUNDLE_DIR}" ]] || die "--release-bundle must be a directory: ${RELEASE_BUNDLE_DIR}"
    RELEASE_BUNDLE_DIR="$(cd "${RELEASE_BUNDLE_DIR}" && pwd)"
    RELEASE_METADATA="${RELEASE_BUNDLE_DIR}/project-os-release.env"
    if [[ -z "${RELEASE_JAR}" ]]; then
      RELEASE_JAR="$(find "${RELEASE_BUNDLE_DIR}" -maxdepth 2 -type f -name 'project-os-backend*.jar' ! -name '*plain*.jar' | sort | head -n 1)"
    fi
    [[ -n "${RELEASE_JAR}" ]] || die "No backend jar found in release bundle: ${RELEASE_BUNDLE_DIR}"
  fi
  if [[ -n "${RELEASE_JAR}" ]]; then
    require_readable_file "--release-jar" "${RELEASE_JAR}"
    RELEASE_JAR="$(cd "$(dirname "${RELEASE_JAR}")" && pwd)/$(basename "${RELEASE_JAR}")"
    INSTALL_ONLY=1
    SKIP_TESTS=1
  fi
}

release_metadata_value() {
  local key="$1"
  [[ -n "${RELEASE_METADATA}" && -r "${RELEASE_METADATA}" ]] || return 0
  awk -F= -v key="${key}" '$1 == key {print $2; exit}' "${RELEASE_METADATA}"
}

verify_release_checksum() {
  [[ -n "${RELEASE_BUNDLE_DIR}" && -n "${RELEASE_JAR}" ]] || return 0
  [[ "${PROJECT_OS_RELEASE_VERIFIED:-0}" == "1" ]] && return 0
  local checksum_file="${RELEASE_BUNDLE_DIR}/SHA256SUMS"
  if [[ ! -r "${checksum_file}" ]]; then
    log "No SHA256SUMS file found in release bundle; skipping checksum verification."
    return 0
  fi
  has_command sha256sum || die "sha256sum is required to verify release bundle checksums."
  log "Verifying release bundle checksum."
  (cd "${RELEASE_BUNDLE_DIR}" && sha256sum -c "${checksum_file}" --ignore-missing)
}

dependency_state() {
  local name="$1"
  local check_command="$2"
  if eval "${check_command}" >/dev/null 2>&1; then
    printf 'present'
  else
    printf 'missing'
  fi
}

dependency_status() {
  local check_command="$1"
  if eval "${check_command}" >/dev/null 2>&1; then
    printf 'present'
  else
    printf 'missing'
  fi
}

package_manager_status() {
  if supported_apt_host; then
    printf 'apt-supported'
  elif is_apt_host; then
    printf 'apt-unsupported'
  else
    printf 'unsupported'
  fi
}

apt_support_label() {
  local os_id version_id
  os_id="$(os_field ID || true)"
  version_id="$(os_field VERSION_ID || true)"
  if [[ "${os_id}" == "ubuntu" ]]; then
    case "${version_id}" in
      20.04|22.04|24.04) printf 'apt (supported)' ;;
      *) printf 'apt (compatible, not fully tested on this OS release)' ;;
    esac
    return 0
  fi
  if supported_apt_host; then
    printf 'apt (supported)'
  elif is_apt_host; then
    printf 'apt (unsupported distro)'
  else
    printf 'unsupported'
  fi
}

install_mode() {
  if [[ -n "${RELEASE_BUNDLE_DIR}" ]]; then
    printf 'release-bundle'
  elif [[ -n "${RELEASE_JAR}" ]]; then
    printf 'release-jar'
  elif [[ "${INSTALL_ONLY}" -eq 1 ]]; then
    printf 'install-only'
  else
    printf 'source'
  fi
}

install_audience() {
  case "$(install_mode)" in
    release-bundle) printf 'one-command-cli' ;;
    release-jar|install-only|source) printf 'advanced-cli' ;;
  esac
}

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

json_string() {
  printf '"%s"' "$(json_escape "$1")"
}

json_string_array() {
  local first=1
  printf '['
  for value in "$@"; do
    if [[ "${first}" -eq 0 ]]; then
      printf ','
    fi
    first=0
    json_string "${value}"
  done
  printf ']'
}

json_dependency() {
  local name="$1"
  local status="$2"
  local required="$3"
  local note="$4"
  printf '{"name":'
  json_string "${name}"
  printf ',"status":'
  json_string "${status}"
  printf ',"required":%s,"note":' "${required}"
  json_string "${note}"
  printf '}'
}

json_warning() {
  local id="$1"
  local message="$2"
  printf '{"id":'
  json_string "${id}"
  printf ',"message":'
  json_string "${message}"
  printf '}'
}

json_check() {
  local id="$1"
  local label="$2"
  local status="$3"
  local message="$4"
  local next_action="$5"
  printf '{"id":'
  json_string "${id}"
  printf ',"label":'
  json_string "${label}"
  printf ',"status":'
  json_string "${status}"
  printf ',"message":'
  json_string "${message}"
  printf ',"nextAction":'
  json_string "${next_action}"
  printf '}'
}

plan_dependencies() {
  local include_node="$1"
  local java_status docker_status compose_status tailscale_status node_status yarn_status sudo_status
  java_status="$(dependency_status 'java -version')"
  docker_status="$(dependency_status 'docker version')"
  compose_status="$(dependency_status 'docker compose version')"
  tailscale_status="$(dependency_status 'tailscale version')"
  sudo_status="$(dependency_status 'sudo --version')"
  json_dependency "Java" "${java_status}" true "Required to run the Project OS backend."
  printf ','
  json_dependency "sudo" "${sudo_status}" true "Required to install Project OS as a system service."
  printf ','
  json_dependency "Docker" "${docker_status}" true "Required for Marketplace app installs."
  printf ','
  json_dependency "Docker Compose" "${compose_status}" true "Required to run managed app stacks."
  printf ','
  json_dependency "Tailscale" "${tailscale_status}" false "Optional for local-only use, required for private HTTPS app links."
  if [[ "${include_node}" -eq 1 ]]; then
    node_status="$(dependency_status 'node --version')"
    yarn_status="$(dependency_status 'yarn --version')"
    printf ','
    json_dependency "Node.js" "${node_status}" true "Required only when building Project OS from source."
    printf ','
    json_dependency "Yarn" "${yarn_status}" true "Required only when building Project OS from source."
  fi
}

runtime_dir() {
  printf '%s\n' "${RUNTIME_DIR_OVERRIDE:-/var/lib/project-os}"
}

install_dir() {
  printf '%s\n' "${INSTALL_DIR_OVERRIDE:-/opt/project-os}"
}

config_dir() {
  printf '%s\n' "${CONFIG_DIR_OVERRIDE:-/etc/project-os}"
}

log_dir() {
  printf '%s\n' "${LOG_DIR_OVERRIDE:-/var/log/project-os}"
}

server_port() {
  printf '%s\n' "${SERVER_PORT_OVERRIDE:-8082}"
}

state_dir() {
  printf '%s\n' "${STATE_DIR_OVERRIDE:-$(runtime_dir)/installer}"
}

path_probe() {
  local path="$1"
  local probe="${path}"
  while [[ ! -e "${probe}" && "${probe}" != "/" ]]; do
    probe="$(dirname "${probe}")"
  done
  printf '%s\n' "${probe}"
}

disk_available_kb() {
  local path="$1"
  local probe
  probe="$(path_probe "${path}")"
  df -Pk "${probe}" 2>/dev/null | awk 'NR == 2 {print $4; exit}'
}

lsblk_output() {
  if [[ -n "${PROJECT_OS_LSBLK_FIXTURE:-}" ]]; then
    cat "${PROJECT_OS_LSBLK_FIXTURE}"
    return 0
  fi
  if has_command lsblk; then
    lsblk -P -b -o NAME,TYPE,RM,SIZE,MOUNTPOINT,FSTYPE,TRAN,UUID 2>/dev/null || true
  fi
}

lsblk_value() {
  local key="$1"
  local line="$2"
  if [[ " ${line}" =~ [[:space:]]${key}=\"([^\"]*)\" ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
  fi
}

mount_stability() {
  local mount_point="$1"
  case "${mount_point}" in
    /media/*|/run/media/*) printf 'unstable' ;;
    "") printf 'unknown' ;;
    *) printf 'stable' ;;
  esac
}

storage_classification() {
  local mount_point="$1"
  local removable="$2"
  local transport="$3"
  local fstype="$4"
  if [[ "${mount_point}" == "/" ]]; then
    printf 'root-filesystem'
  elif [[ "${fstype}" =~ ^(nfs|nfs4|cifs|smb|sshfs)$ ]]; then
    printf 'network-mount'
  elif [[ "${transport}" == "usb" ]]; then
    printf 'usb-ssd'
  elif [[ "${removable}" == "1" ]]; then
    printf 'removable-drive'
  else
    printf 'local-disk'
  fi
}

storage_risk() {
  local classification="$1"
  local stability="$2"
  if [[ "${stability}" == "unstable" ]]; then
    printf 'high'
    return 0
  fi
  case "${classification}" in
    usb-ssd|local-disk|network-mount) printf 'low' ;;
    root-filesystem|removable-drive) printf 'medium' ;;
    *) printf 'unknown' ;;
  esac
}

runtime_mount_line() {
  local runtime_path="$1"
  local best_line=""
  local best_length=0
  local line mount_point length
  while IFS= read -r line; do
    mount_point="$(lsblk_value MOUNTPOINT "${line}")"
    [[ -n "${mount_point}" ]] || continue
    case "${runtime_path}" in
      "${mount_point}"|"${mount_point}"/*)
        length="${#mount_point}"
        if (( length > best_length )); then
          best_line="${line}"
          best_length="${length}"
        fi
        ;;
    esac
  done < <(lsblk_output)
  printf '%s\n' "${best_line}"
}

json_storage_candidate_from_line() {
  local line="$1"
  local name type removable size mount_point fstype transport uuid stability classification risk
  name="$(lsblk_value NAME "${line}")"
  type="$(lsblk_value TYPE "${line}")"
  removable="$(lsblk_value RM "${line}")"
  size="$(lsblk_value SIZE "${line}")"
  mount_point="$(lsblk_value MOUNTPOINT "${line}")"
  fstype="$(lsblk_value FSTYPE "${line}")"
  transport="$(lsblk_value TRAN "${line}")"
  uuid="$(lsblk_value UUID "${line}")"
  stability="$(mount_stability "${mount_point}")"
  classification="$(storage_classification "${mount_point}" "${removable}" "${transport}" "${fstype}")"
  risk="$(storage_risk "${classification}" "${stability}")"
  printf '{"name":'
  json_string "${name}"
  printf ',"type":'
  json_string "${type}"
  printf ',"mountPoint":'
  json_string "${mount_point}"
  printf ',"filesystem":'
  json_string "${fstype}"
  printf ',"transport":'
  json_string "${transport}"
  printf ',"uuid":'
  json_string "${uuid}"
  printf ',"sizeBytes":%s' "${size:-0}"
  printf ',"classification":'
  json_string "${classification}"
  printf ',"stability":'
  json_string "${stability}"
  printf ',"risk":'
  json_string "${risk}"
  printf '}'
}

storage_candidates_json() {
  local first=1 line mount_point type
  printf '['
  while IFS= read -r line; do
    mount_point="$(lsblk_value MOUNTPOINT "${line}")"
    type="$(lsblk_value TYPE "${line}")"
    [[ -n "${mount_point}" ]] || continue
    [[ "${type}" == "part" || "${type}" == "disk" ]] || continue
    if [[ "${first}" -eq 0 ]]; then
      printf ','
    fi
    first=0
    json_storage_candidate_from_line "${line}"
  done < <(lsblk_output)
  printf ']'
}

recommended_storage_line() {
  local line mount_point removable transport fstype stability classification best_line=""
  while IFS= read -r line; do
    mount_point="$(lsblk_value MOUNTPOINT "${line}")"
    [[ -n "${mount_point}" && "${mount_point}" != "/" ]] || continue
    removable="$(lsblk_value RM "${line}")"
    transport="$(lsblk_value TRAN "${line}")"
    fstype="$(lsblk_value FSTYPE "${line}")"
    stability="$(mount_stability "${mount_point}")"
    classification="$(storage_classification "${mount_point}" "${removable}" "${transport}" "${fstype}")"
    if [[ "${stability}" == "stable" && "${classification}" == "usb-ssd" ]]; then
      printf '%s\n' "${line}"
      return 0
    fi
    if [[ -z "${best_line}" && "${stability}" == "stable" && "${classification}" != "root-filesystem" ]]; then
      best_line="${line}"
    fi
  done < <(lsblk_output)
  printf '%s\n' "${best_line}"
}

storage_recommendation_json() {
  local line mount_point removable transport fstype classification stability risk
  line="$(recommended_storage_line)"
  if [[ -z "${line}" ]]; then
    printf '{"path":'
    json_string "$(runtime_dir)"
    printf ',"mountPoint":"","classification":"default-runtime","stability":"unknown","risk":"unknown"}'
    return 0
  fi
  mount_point="$(lsblk_value MOUNTPOINT "${line}")"
  removable="$(lsblk_value RM "${line}")"
  transport="$(lsblk_value TRAN "${line}")"
  fstype="$(lsblk_value FSTYPE "${line}")"
  stability="$(mount_stability "${mount_point}")"
  classification="$(storage_classification "${mount_point}" "${removable}" "${transport}" "${fstype}")"
  risk="$(storage_risk "${classification}" "${stability}")"
  printf '{"path":'
  json_string "${mount_point}/project-os"
  printf ',"mountPoint":'
  json_string "${mount_point}"
  printf ',"classification":'
  json_string "${classification}"
  printf ',"stability":'
  json_string "${stability}"
  printf ',"risk":'
  json_string "${risk}"
  printf '}'
}

runtime_mount_json() {
  local runtime_path line mount_point removable transport fstype uuid classification stability risk suggestion fstab_example
  runtime_path="$(runtime_dir)"
  line="$(runtime_mount_line "${runtime_path}")"
  if [[ -z "${line}" ]]; then
    printf '{"mountPoint":'
    json_string "$(path_probe "${runtime_path}")"
    printf ',"classification":"unknown","stability":"unknown","risk":"unknown","stableMountSuggestion":"","fstabExample":""}'
    return 0
  fi
  mount_point="$(lsblk_value MOUNTPOINT "${line}")"
  removable="$(lsblk_value RM "${line}")"
  transport="$(lsblk_value TRAN "${line}")"
  fstype="$(lsblk_value FSTYPE "${line}")"
  uuid="$(lsblk_value UUID "${line}")"
  classification="$(storage_classification "${mount_point}" "${removable}" "${transport}" "${fstype}")"
  stability="$(mount_stability "${mount_point}")"
  risk="$(storage_risk "${classification}" "${stability}")"
  suggestion="/mnt/project-os-data"
  fstab_example=""
  if [[ -n "${uuid}" ]]; then
    fstab_example="UUID=${uuid} ${suggestion} ${fstype:-auto} defaults,nofail 0 2"
  fi
  printf '{"mountPoint":'
  json_string "${mount_point}"
  printf ',"classification":'
  json_string "${classification}"
  printf ',"stability":'
  json_string "${stability}"
  printf ',"risk":'
  json_string "${risk}"
  printf ',"stableMountSuggestion":'
  json_string "$([[ "${stability}" == "unstable" ]] && printf '%s' "${suggestion}")"
  printf ',"fstabExample":'
  json_string "$([[ "${stability}" == "unstable" ]] && printf '%s' "${fstab_example}")"
  printf '}'
}

storage_report_json() {
  printf '{"runtimePath":'
  json_string "$(runtime_dir)"
  printf ',"runtimeMount":'
  runtime_mount_json
  printf ',"recommendation":'
  storage_recommendation_json
  printf ',"candidates":'
  storage_candidates_json
  printf '}'
}

storage_recommendation_summary() {
  local line mount_point removable transport fstype classification stability risk
  line="$(recommended_storage_line)"
  if [[ -z "${line}" ]]; then
    printf 'Use default runtime path %s until a dedicated drive is selected.' "$(runtime_dir)"
    return 0
  fi
  mount_point="$(lsblk_value MOUNTPOINT "${line}")"
  removable="$(lsblk_value RM "${line}")"
  transport="$(lsblk_value TRAN "${line}")"
  fstype="$(lsblk_value FSTYPE "${line}")"
  classification="$(storage_classification "${mount_point}" "${removable}" "${transport}" "${fstype}")"
  stability="$(mount_stability "${mount_point}")"
  risk="$(storage_risk "${classification}" "${stability}")"
  printf '%s/project-os (%s, %s risk)' "${mount_point}" "${classification}" "${risk}"
}

runtime_mount_summary() {
  local line mount_point removable transport fstype classification stability risk
  line="$(runtime_mount_line "$(runtime_dir)")"
  if [[ -z "${line}" ]]; then
    printf 'Unknown mount for %s' "$(runtime_dir)"
    return 0
  fi
  mount_point="$(lsblk_value MOUNTPOINT "${line}")"
  removable="$(lsblk_value RM "${line}")"
  transport="$(lsblk_value TRAN "${line}")"
  fstype="$(lsblk_value FSTYPE "${line}")"
  classification="$(storage_classification "${mount_point}" "${removable}" "${transport}" "${fstype}")"
  stability="$(mount_stability "${mount_point}")"
  risk="$(storage_risk "${classification}" "${stability}")"
  printf '%s (%s, %s, %s risk)' "${mount_point}" "${classification}" "${stability}" "${risk}"
}

runtime_mount_is_unstable() {
  [[ "$(runtime_mount_json)" == *'"stability":"unstable"'* ]]
}

port_status() {
  local port="$1"
  if has_command ss && ss -ltn "sport = :${port}" 2>/dev/null | awk 'NR > 1 {found=1} END {exit found ? 0 : 1}'; then
    printf 'busy'
  else
    printf 'available'
  fi
}

internet_status() {
  if has_command timeout; then
    timeout 2 bash -c '</dev/tcp/tailscale.com/443' >/dev/null 2>&1 && {
      printf 'ok'
      return 0
    }
  fi
  printf 'warning'
}

doctor_checks_json() {
  local first=1 package_manager runtime_path available_kb port internet
  package_manager="$(package_manager_status)"
  runtime_path="$(runtime_dir)"
  available_kb="$(disk_available_kb "${runtime_path}")"
  port="$(server_port)"
  internet="$(internet_status)"
  printf '['
  emit_check() {
    if [[ "${first}" -eq 0 ]]; then
      printf ','
    fi
    first=0
    json_check "$@"
  }
  case "${package_manager}" in
    apt-supported) emit_check "os" "Operating system" "ok" "This host uses a supported apt-based Linux distribution." "" ;;
    apt-unsupported) emit_check "os" "Operating system" "warning" "This host uses apt, but the distribution is not in the fully supported list." "Use manual dependency setup or a supported Debian, Ubuntu, or Raspberry Pi OS host." ;;
    *) emit_check "os" "Operating system" "blocked" "This host does not expose a supported package manager for automatic setup." "Use Debian, Ubuntu, Raspberry Pi OS, or install dependencies manually." ;;
  esac
  if has_command systemctl; then
    emit_check "systemd" "System service" "ok" "systemd is available for project-os.service." ""
  else
    emit_check "systemd" "System service" "blocked" "systemd is not available on this host." "Use a Linux host with systemd for the current installer."
  fi
  if has_command sudo || [[ "$(id -u)" -eq 0 ]]; then
    emit_check "sudo" "Administrator access" "ok" "Administrator privileges are available for service installation." ""
  else
    emit_check "sudo" "Administrator access" "blocked" "sudo is not available and this shell is not running as root." "Install sudo or rerun as root."
  fi
  if [[ "${internet}" == "ok" ]]; then
    emit_check "internet" "Internet" "ok" "Outbound HTTPS connectivity is available." ""
  else
    emit_check "internet" "Internet" "warning" "Internet connectivity could not be confirmed." "Check network access before downloading dependencies or releases."
  fi
  if [[ -n "${available_kb}" && "${available_kb}" =~ ^[0-9]+$ && "${available_kb}" -gt 1048576 ]]; then
    emit_check "runtime-storage" "Runtime storage" "ok" "The selected runtime location has more than 1 GB available." ""
  else
    emit_check "runtime-storage" "Runtime storage" "warning" "The selected runtime location may not have enough free space." "Choose a larger drive for apps and backups."
  fi
  case "$(port_status "${port}")" in
    busy) emit_check "port" "Service port" "warning" "Port ${port} appears to be in use." "Choose another port with --port." ;;
    *) emit_check "port" "Service port" "ok" "Port ${port} appears available." "" ;;
  esac
  if has_command java; then
    emit_check "java" "Java" "ok" "Java is installed." ""
  elif supported_apt_host; then
    emit_check "java" "Java" "warning" "Java is missing, but this host can install it through apt." "Run with --auto-install-deps or install Java 21."
  else
    emit_check "java" "Java" "blocked" "Java is missing and automatic dependency setup is not supported here." "Install Java 21 manually."
  fi
  if has_command docker; then
    emit_check "docker" "Docker" "ok" "Docker is installed." ""
  elif supported_apt_host; then
    emit_check "docker" "Docker" "warning" "Docker is missing, but this host can install it through the guided dependency path." "Run with --auto-install-deps or install Docker."
  else
    emit_check "docker" "Docker" "warning" "Docker is missing." "Install Docker before installing Marketplace apps."
  fi
  if docker compose version >/dev/null 2>&1; then
    emit_check "docker-compose" "Docker Compose" "ok" "Docker Compose v2 is available." ""
  else
    emit_check "docker-compose" "Docker Compose" "warning" "Docker Compose v2 was not found." "Install the Docker Compose v2 plugin before installing apps."
  fi
  if has_command tailscale; then
    emit_check "tailscale" "Tailscale" "ok" "Tailscale is installed." ""
  else
    emit_check "tailscale" "Tailscale" "warning" "Tailscale is not installed." "Skip private access for now or install Tailscale."
  fi
  printf ']'
}

doctor_status() {
  local checks
  checks="$(doctor_checks_json)"
  if printf '%s' "${checks}" | grep -q '"status":"blocked"'; then
    printf 'blocked'
  elif printf '%s' "${checks}" | grep -q '"status":"warning"'; then
    printf 'ready_with_notes'
  else
    printf 'ready'
  fi
}

print_doctor_json() {
  local status runtime_path available_kb port checks
  checks="$(doctor_checks_json)"
  if printf '%s' "${checks}" | grep -q '"status":"blocked"'; then
    status="blocked"
  elif printf '%s' "${checks}" | grep -q '"status":"warning"'; then
    status="ready_with_notes"
  else
    status="ready"
  fi
  runtime_path="$(runtime_dir)"
  available_kb="$(disk_available_kb "${runtime_path}")"
  port="$(server_port)"
  printf '{'
  printf '"schemaVersion":1'
  printf ',"status":'
  json_string "${status}"
  printf ',"recommendedNextAction":'
  case "${status}" in
    ready) json_string "This host is ready for Project OS installation." ;;
    ready_with_notes) json_string "Review warnings, then continue or install missing optional dependencies." ;;
    *) json_string "Resolve blockers before installing Project OS." ;;
  esac
  printf ',"host":{"os":'
  json_string "$(os_field PRETTY_NAME || true)"
  printf ',"architecture":'
  json_string "$(uname -m)"
  printf ',"packageManager":'
  json_string "$(package_manager_status)"
  printf '}'
  printf ',"runtime":{"path":'
  json_string "${runtime_path}"
  printf ',"probe":'
  json_string "$(path_probe "${runtime_path}")"
  printf ',"availableKb":%s}' "${available_kb:-0}"
  printf ',"service":{"port":%s}' "${port}"
  printf ',"checks":%s' "${checks}"
  printf '}\n'
}

print_doctor_text() {
  local status
  status="$(doctor_status)"
  cat <<DOCTOR
Project OS pre-install doctor

Status: ${status}
Host: $(os_field PRETTY_NAME || true) ($(uname -m))
Package manager: $(package_manager_status)
Runtime data: $(runtime_dir)
Service port: $(server_port)

Next action: $(
    case "${status}" in
      ready) printf 'This host is ready for Project OS installation.' ;;
      ready_with_notes) printf 'Review warnings, then continue or install missing optional dependencies.' ;;
      *) printf 'Resolve blockers before installing Project OS.' ;;
    esac
  )
DOCTOR
}

print_preinstall_doctor() {
  if [[ "${JSON_OUTPUT}" -eq 1 ]]; then
    print_doctor_json
  else
    print_doctor_text
  fi
}

write_installer_state() {
  local status="$1"
  local stage="$2"
  local state_directory state_file
  state_directory="$(state_dir)"
  state_file="${state_directory}/installer-state.json"
  mkdir -p "${state_directory}"
  {
    printf '{'
    printf '"schemaVersion":1'
    printf ',"status":'
    json_string "${status}"
    printf ',"lastCompletedStage":'
    json_string "${stage}"
    printf ',"stateDir":'
    json_string "${state_directory}"
    printf ',"selectedOptions":{"runtimeDir":'
    json_string "$(runtime_dir)"
    printf ',"installDir":'
    json_string "$(install_dir)"
    printf ',"configDir":'
    json_string "$(config_dir)"
    printf ',"logDir":'
    json_string "$(log_dir)"
    printf ',"port":%s}' "$(server_port)"
    printf ',"artifact":{"releaseBundle":'
    json_string "${RELEASE_BUNDLE_DIR}"
    printf ',"backendJar":'
    json_string "${RELEASE_JAR}"
    printf '}'
    printf ',"recoveryCommand":'
    json_string "Rerun this installer with the same options to resume safely."
    printf '}\n'
  } >"${state_file}"
}

plan_warnings_json() {
  local first=1
  printf '['
  for warning in \
    "confirm-host-mutation|Review and confirm the install plan before changing this host." \
    "docker-required-for-apps|Project OS can start without Docker, but Marketplace app installs need Docker." \
    "tailscale-optional|Tailscale can be skipped for local-only use and configured later."; do
    if [[ "${first}" -eq 0 ]]; then
      printf ','
    fi
    first=0
    json_warning "${warning%%|*}" "${warning#*|}"
  done
  if runtime_mount_is_unstable; then
    if [[ "${first}" -eq 0 ]]; then
      printf ','
    fi
    json_warning "unstable-runtime-mount" "The selected runtime path appears to be on a desktop auto-mount. Use a stable /mnt path mounted by UUID before storing apps and backups there."
  fi
  printf ']'
}

print_plan_json() {
  local mode audience os_name arch package_manager runtime_dir install_dir config_dir log_dir port include_node
  mode="$(install_mode)"
  audience="$(install_audience)"
  os_name="$(os_field PRETTY_NAME || true)"
  arch="$(uname -m)"
  package_manager="$(package_manager_status)"
  runtime_dir="$(runtime_dir)"
  install_dir="$(install_dir)"
  config_dir="$(config_dir)"
  log_dir="$(log_dir)"
  port="$(server_port)"
  include_node=1
  [[ -n "${RELEASE_JAR}" ]] && include_node=0
  printf '{'
  printf '"schemaVersion":1'
  printf ',"mode":'
  json_string "${mode}"
  printf ',"audience":'
  json_string "${audience}"
  printf ',"host":{"os":'
  json_string "${os_name:-unknown}"
  printf ',"architecture":'
  json_string "${arch}"
  printf ',"packageManager":'
  json_string "${package_manager}"
  printf '}'
  printf ',"paths":{"runtimeDir":'
  json_string "${runtime_dir}"
  printf ',"installDir":'
  json_string "${install_dir}"
  printf ',"configDir":'
  json_string "${config_dir}"
  printf ',"logDir":'
  json_string "${log_dir}"
  printf '}'
  printf ',"storage":'
  storage_report_json
  printf ',"service":{"name":"project-os","port":%s,"startAfterInstall":%s}' "${port}" "$([[ "${NO_START}" -eq 1 ]] && printf false || printf true)"
  printf ',"artifact":{"releaseBundle":'
  json_string "${RELEASE_BUNDLE_DIR}"
  printf ',"backendJar":'
  json_string "${RELEASE_JAR}"
  printf '}'
  printf ',"dependencies":['
  plan_dependencies "${include_node}"
  printf ']'
  printf ',"actions":'
  json_string_array "prepare Project OS runtime, config, log, and install directories" "install Project OS system service" "install project-os helper command" "configure Docker access when available" "configure Tailscale operator when connected" "start project-os service unless disabled"
  printf ',"warnings":'
  plan_warnings_json
  printf ',"blockers":[]'
  printf '}\n'
}

print_plan_text() {
  local mode audience runtime_dir install_dir config_dir log_dir port
  mode="$(install_mode)"
  audience="$(install_audience)"
  runtime_dir="$(runtime_dir)"
  install_dir="$(install_dir)"
  config_dir="$(config_dir)"
  log_dir="$(log_dir)"
  port="$(server_port)"
  cat <<PLAN
Project OS install plan

Mode: ${mode}
Audience: ${audience}
Host: $(os_field PRETTY_NAME || true) ($(uname -m))
Package manager: $(package_manager_status)

Paths:
  Runtime data: ${runtime_dir}
  Binaries: ${install_dir}
  Config: ${config_dir}
  Logs: ${log_dir}

Storage:
  Recommendation: $(storage_recommendation_summary)
  Runtime mount: $(runtime_mount_summary)

Service:
  Name: project-os
  Port: ${port}
  Start after install: $([[ "${NO_START}" -eq 1 ]] && printf no || printf yes)

Actions:
  - prepare Project OS runtime, config, log, and install directories
  - install Project OS system service
  - install project-os helper command
  - configure Docker access when available
  - configure Tailscale operator when connected
  - start project-os service unless disabled

Warnings:
  - Review and confirm the install plan before changing this host.
  - Project OS can start without Docker, but Marketplace app installs need Docker.
  - Tailscale can be skipped for local-only use and configured later.
PLAN
}

print_install_plan() {
  if [[ "${JSON_OUTPUT}" -eq 1 ]]; then
    print_plan_json
  else
    print_plan_text
  fi
}

print_dependency_plan() {
  log "Host: $(os_field PRETTY_NAME || true) ($(uname -m))"
  log "Package manager: $(apt_support_label)"
  log "Java: $(dependency_state java 'java -version')"
  if [[ -n "${RELEASE_JAR}" ]]; then
    log "Node.js: not required for release-bundle install"
    log "Yarn: not required for release-bundle install"
  else
    log "Node.js: $(dependency_state node 'node --version')"
    log "Yarn: $(dependency_state yarn 'yarn --version')"
  fi
  log "Docker: $(dependency_state docker 'docker version')"
  log "Docker Compose: $(dependency_state docker-compose 'docker compose version')"
  log "Tailscale: $(dependency_state tailscale 'tailscale version')"
}

install_dependencies_apt() {
  supported_apt_host || die "--auto-install-deps currently supports Debian, Ubuntu, and Raspberry Pi OS hosts with apt-get. Install dependencies manually or use a supported host."
  has_command sudo || [[ "$(id -u)" -eq 0 ]] || die "sudo is required to install host dependencies."
  print_dependency_plan
  log "Installing missing supported host dependencies with apt."
  local packages=()
  local package
  for package in ca-certificates curl gnupg git; do
    apt_package_installed "${package}" || packages+=("${package}")
  done
  java_21_available || packages+=(openjdk-21-jre-headless)
  if [[ -z "${RELEASE_JAR}" ]]; then
    has_command node || packages+=(nodejs)
    has_command npm || packages+=(npm)
  fi
  if [[ "${#packages[@]}" -gt 0 ]]; then
    run_root apt-get update
    run_root apt-get install -y "${packages[@]}"
  else
    log "Required apt packages are already installed."
  fi
  if [[ -z "${RELEASE_JAR}" ]]; then
    if ! yarn_1_available; then
      run_root npm install -g yarn@1.22.22
    fi
  fi
  if ! has_command docker || ! docker compose version >/dev/null 2>&1; then
    log "Installing or repairing Docker using Docker's official convenience script."
    if [[ "${DRY_RUN}" -eq 1 ]]; then
      printf '+ curl -fsSL https://get.docker.com | sh\n'
    else
      run_external_installer "Docker" "https://get.docker.com"
    fi
  else
    log "Docker is already installed."
  fi
  if ! has_command tailscale; then
    log "Installing Tailscale using Tailscale's official install script."
    if [[ "${DRY_RUN}" -eq 1 ]]; then
      printf '+ curl -fsSL https://tailscale.com/install.sh | sh\n'
    else
      run_external_installer "Tailscale" "https://tailscale.com/install.sh"
    fi
  else
    log "Tailscale is already installed."
  fi
}

run_external_installer() {
  local label="$1"
  local url="$2"
  local log_file
  log_file="$(state_dir)/$(printf '%s' "${label}" | tr '[:upper:]' '[:lower:]')-installer.log"
  mkdir -p "$(dirname "${log_file}")"
  if curl -fsSL "${url}" | sh >"${log_file}" 2>&1; then
    log "${label} installer completed. Full log: ${log_file}"
    return 0
  fi
  log "${label} installer failed. Last log lines from ${log_file}:"
  tail -n 40 "${log_file}" >&2 || true
  return 1
}

tailscale_connected() {
  has_command tailscale || return 1
  tailscale status >/dev/null 2>&1
}

run_tailscale_login() {
  if [[ "$(id -u)" -eq 0 ]]; then
    tailscale up --qr --qr-format=small
  else
    sudo tailscale up --qr --qr-format=small
  fi
}

guide_tailscale_connection() {
  [[ "${PROJECT_OS_TAILSCALE_ONBOARDING:-0}" == "1" ]] || return 0
  [[ "${DRY_RUN}" -eq 0 || "${PROJECT_OS_TAILSCALE_ONBOARDING_ALLOW_NON_TTY:-0}" == "1" ]] || return 0
  has_command tailscale || return 0

  if tailscale_connected; then
    log "Tailscale is already connected."
    return 0
  fi

  if [[ ! -t 0 && "${PROJECT_OS_TAILSCALE_ONBOARDING_ALLOW_NON_TTY:-0}" != "1" ]]; then
    log "Tailscale sign-in needs an interactive terminal. Skipping private access setup for now."
    log "Finish later with: sudo tailscale up"
    return 0
  fi

  cat <<TAILSCALE_SETUP

Private access setup with Tailscale

Project OS can use Tailscale so you can reach apps from your trusted phones,
laptops, and tablets without opening public internet ports.

Choose one:
  1) Create an account or sign in with Tailscale now
  2) Skip private access setup for now

TAILSCALE_SETUP

  local choice
  while true; do
    read -r -p "Select 1 to sign in, or 2 to skip [1/2]: " choice
    case "${choice,,}" in
      1|c|connect|signin|sign-in)
        log "Create an account or sign in with Tailscale using the QR code or link below."
        if run_tailscale_login; then
          if tailscale_connected; then
            log "Tailscale sign-in detected."
          else
            log "Tailscale sign-in was started, but Project OS does not see an active connection yet."
            log "Finish later with: sudo tailscale up"
          fi
        else
          log "Tailscale sign-in did not complete. Finish later with: sudo tailscale up"
        fi
        return 0
        ;;
      2|s|skip|later|local|local-only)
        log "Tailscale setup skipped. You can finish private access later with: sudo tailscale up"
        return 0
        ;;
      *)
        log "Please choose 1 to sign in or 2 to skip."
        ;;
    esac
  done
}

preflight() {
  log "Running preflight checks."
  if [[ "${AUTO_INSTALL_DEPS}" -eq 0 ]]; then
    print_dependency_plan
  fi
  if [[ "${AUTO_INSTALL_DEPS}" -eq 1 ]]; then
    install_dependencies_apt
  fi
  has_command java || {
    if [[ "${DRY_RUN}" -eq 1 && "${AUTO_INSTALL_DEPS}" -eq 1 && "$(package_manager_status)" == "apt-supported" ]]; then
      log "Dry run: Java 21 would be installed before service setup."
    else
      die "Java 21 is required. Install Java, then rerun this script."
    fi
  }
  local java_major
  java_major="$(java_major_version java)"
  if [[ ! "${java_major}" =~ ^[0-9]+$ || "${java_major}" -lt 21 ]]; then
    if [[ "${DRY_RUN}" -eq 1 && "${AUTO_INSTALL_DEPS}" -eq 1 && "$(package_manager_status)" == "apt-supported" ]]; then
      log "Dry run: Java 21 would replace detected Java major version ${java_major:-unknown} before service setup."
    else
      die "Java 21 or newer is required. Detected Java major version: ${java_major:-unknown}"
    fi
  fi
  if [[ -z "${RELEASE_JAR}" ]]; then
    has_command node || die "Node.js is required to build the frontend. Use --release-bundle or --release-jar to install a packaged release without Node."
    has_command yarn || die "Yarn is required to build the frontend. Use --release-bundle or --release-jar to install a packaged release without Yarn."
    local yarn_version
    yarn_version="$(yarn --version 2>/dev/null || true)"
    [[ "${yarn_version}" == 1.* ]] || log "Yarn 1.x is expected for this repo. Detected: ${yarn_version:-unknown}."
  fi
  has_command sudo || die "sudo is required to install Project OS as a system service."
  if has_command docker; then
    local docker_output=""
    if ! docker_output="$(docker version 2>&1 >/dev/null)"; then
      if grep -qiE 'permission denied|denied while trying to connect|Got permission denied' <<<"${docker_output}"; then
        log "Docker is installed, but this shell cannot access the Docker socket yet. Project OS will use service-user docker-group access after install."
      else
        log "Docker is installed, but the daemon is not reachable yet. Marketplace installs need Docker running."
      fi
    fi
    docker compose version >/dev/null 2>&1 || log "Docker Compose v2 was not found. Marketplace installs need the Docker Compose plugin."
  else
    log "Docker is not installed yet. The service installer will warn and continue, but app installs need Docker."
  fi
  if has_command tailscale; then
    tailscale status >/dev/null 2>&1 || log "Tailscale is installed, but this host is not connected yet. Private app links can be enabled after Tailscale setup."
  else
    log "Tailscale is not installed yet. Private app links can be enabled after Tailscale setup."
  fi
  print_storage_targets
  verify_release_checksum
}

print_path_target() {
  local label="$1"
  local path="$2"
  [[ -n "${path}" ]] || return 0
  log "${label}: ${path}"
  local probe="${path}"
  while [[ ! -e "${probe}" && "${probe}" != "/" ]]; do
    probe="$(dirname "${probe}")"
  done
  if has_command findmnt; then
    findmnt -T "${probe}" -o TARGET,SOURCE,FSTYPE,OPTIONS -n 2>/dev/null | sed 's/^/[project-os bootstrap]   mount: /' || true
  fi
  df -h "${probe}" 2>/dev/null | awk 'NR == 2 {printf "[project-os bootstrap]   space: %s used of %s, %s available on %s\n", $3, $2, $4, $6}' || true
}

print_storage_targets() {
  print_path_target "Runtime data target" "${RUNTIME_DIR_OVERRIDE:-/var/lib/project-os}"
  [[ -n "${INSTALL_DIR_OVERRIDE}" ]] && print_path_target "Binary install target" "${INSTALL_DIR_OVERRIDE}"
  [[ -n "${CONFIG_DIR_OVERRIDE}" ]] && print_path_target "Config target" "${CONFIG_DIR_OVERRIDE}"
  [[ -n "${LOG_DIR_OVERRIDE}" ]] && print_path_target "Log target" "${LOG_DIR_OVERRIDE}"
  return 0
}

install_frontend_dependencies() {
  log "Installing frontend dependencies."
  if [[ -f "${REPO_ROOT}/frontend/yarn.lock" ]]; then
    (cd "${REPO_ROOT}/frontend" && yarn install --frozen-lockfile)
  else
    (cd "${REPO_ROOT}/frontend" && yarn install)
  fi
}

build_project() {
  if [[ "${INSTALL_ONLY}" -eq 1 ]]; then
    log "Skipping build because --install-only was provided."
    return 0
  fi
  install_frontend_dependencies
  if [[ "${SKIP_TESTS}" -eq 0 ]]; then
    log "Running backend tests."
    "${REPO_ROOT}/backend/gradlew" -p "${REPO_ROOT}/backend" test
  fi
  log "Building production backend jar with embedded frontend."
  "${REPO_ROOT}/backend/gradlew" -p "${REPO_ROOT}/backend" bootJar
}

install_service() {
  local args=()
  local env_args=()
  local passthrough_name
  if [[ "${NO_START}" -eq 1 ]]; then
    args+=(--no-start)
  fi
  [[ -n "${RUNTIME_DIR_OVERRIDE}" ]] && args+=(--runtime-dir "${RUNTIME_DIR_OVERRIDE}") && env_args+=("PROJECT_OS_RUNTIME_DIR=${RUNTIME_DIR_OVERRIDE}")
  [[ -n "${INSTALL_DIR_OVERRIDE}" ]] && args+=(--install-dir "${INSTALL_DIR_OVERRIDE}") && env_args+=("PROJECT_OS_INSTALL_DIR=${INSTALL_DIR_OVERRIDE}")
  [[ -n "${CONFIG_DIR_OVERRIDE}" ]] && args+=(--config-dir "${CONFIG_DIR_OVERRIDE}") && env_args+=("PROJECT_OS_CONFIG_DIR=${CONFIG_DIR_OVERRIDE}")
  [[ -n "${LOG_DIR_OVERRIDE}" ]] && args+=(--log-dir "${LOG_DIR_OVERRIDE}") && env_args+=("PROJECT_OS_LOG_DIR=${LOG_DIR_OVERRIDE}")
  [[ -n "${SERVER_PORT_OVERRIDE}" ]] && args+=(--port "${SERVER_PORT_OVERRIDE}") && env_args+=("PROJECT_OS_SERVER_PORT=${SERVER_PORT_OVERRIDE}")
  for passthrough_name in PROJECT_OS_USER PROJECT_OS_GROUP PROJECT_OS_SERVICE_NAME PROJECT_OS_SERVICE_FILE PROJECT_OS_CLI_LINK PROJECT_OS_JAVA_BIN PROJECT_OS_ASSUME_DEPENDENCIES_INSTALLED; do
    if [[ -n "${!passthrough_name:-}" ]]; then
      env_args+=("${passthrough_name}=${!passthrough_name}")
    fi
  done
  if [[ -n "${RELEASE_JAR}" ]]; then
    env_args+=("PROJECT_OS_BACKEND_JAR=${RELEASE_JAR}")
    local release_version release_sha release_date
    release_version="$(release_metadata_value PROJECT_OS_VERSION)"
    release_sha="$(release_metadata_value PROJECT_OS_BUILD_SHA)"
    release_date="$(release_metadata_value PROJECT_OS_BUILD_DATE)"
    [[ -n "${release_version}" ]] && env_args+=("PROJECT_OS_VERSION=${release_version}")
    [[ -n "${release_sha}" ]] && env_args+=("PROJECT_OS_BUILD_SHA=${release_sha}")
    [[ -n "${release_date}" ]] && env_args+=("PROJECT_OS_BUILD_DATE=${release_date}")
  fi
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    args+=(--dry-run)
    if [[ "${AUTO_INSTALL_DEPS}" -eq 1 && "$(package_manager_status)" == "apt-supported" ]]; then
      env_args+=("PROJECT_OS_ASSUME_DEPENDENCIES_INSTALLED=1")
    fi
    log "Previewing Project OS system service installation."
    env "${env_args[@]}" "${INSTALL_SCRIPT}" "${args[@]}"
    return 0
  fi
  log "Installing Project OS system service."
  sudo env "${env_args[@]}" "${INSTALL_SCRIPT}" "${args[@]}"
}

print_next_steps() {
  local port="${SERVER_PORT_OVERRIDE:-8082}"
  local lan_ip=""
  if has_command hostname; then
    lan_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    local install_command="./scripts/bootstrap-project-os.sh"
    if [[ -n "${RELEASE_BUNDLE_DIR}" ]]; then
      install_command="${RELEASE_BUNDLE_DIR}/scripts/project-os install --yes"
    elif [[ -n "${RELEASE_JAR}" ]]; then
      install_command="./scripts/bootstrap-project-os.sh --release-jar ${RELEASE_JAR}"
    fi
    cat <<NEXT

Project OS installation preview completed.

Run without --dry-run to install:
  ${install_command}

To store runtime data on an SSD:
  ${install_command} --runtime-dir /mnt/project-os-ssd/project-os

After install, open from this device:
  http://localhost:${port}

LAN URL:
  $([[ -n "${lan_ip}" ]] && printf 'http://%s:%s' "${lan_ip}" "${port}" || printf 'Run "hostname -I" after install, then open http://<host-ip>:%s' "${port}")

NEXT
    return 0
  fi

  cat <<NEXT

Project OS installation completed.

Open:
  http://localhost:${port}

LAN URL:
  $([[ -n "${lan_ip}" ]] && printf 'http://%s:%s' "${lan_ip}" "${port}" || printf 'Run "hostname -I", then open http://<host-ip>:%s' "${port}")

Useful commands:
  project-os doctor
  project-os where
  project-os setup --print-next-step
  project-os status
  project-os logs

If this is a headless or remote homelab host, use the LAN URL from another device on the same network.

NEXT
}

main() {
  parse_args "$@"
  if [[ "${DOCTOR_ONLY}" -eq 1 ]]; then
    print_preinstall_doctor
    exit 0
  fi
  if [[ "${PLAN_ONLY}" -eq 1 ]]; then
    if [[ -n "${STATE_DIR_OVERRIDE}" ]]; then
      write_installer_state "planned" "plan"
    fi
    print_install_plan
    exit 0
  fi
  preflight
  guide_tailscale_connection
  if [[ "${PROJECT_OS_TAILSCALE_ONBOARDING_ONLY:-0}" == "1" ]]; then
    exit 0
  fi
  build_project
  install_service
  print_next_steps
}

main "$@"
