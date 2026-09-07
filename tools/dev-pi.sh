#!/usr/bin/env bash
set -Eeuo pipefail

# Local developer helper. This file is deliberately outside scripts/ because
# it is not part of the appliance or any public release artifact.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="${AUTARK_PI_CONFIG:-${ROOT_DIR}/tools/dev-pi.env}"
ARTIFACT_ROOT="${AUTARK_PI_ARTIFACT_ROOT:-${ROOT_DIR}/.autark-os-dev/pi}"
PI_HOST="${AUTARK_PI_HOST:-}"
PI_USER="${AUTARK_PI_USER:-}"
PI_SSH_PORT="${AUTARK_PI_SSH_PORT:-22}"

usage() {
  cat <<'USAGE'
Usage: tools/dev-pi.sh <command> [options]

Control a reachable development Pi through ordinary SSH. Configuration is read
from tools/dev-pi.env when present; that file and collected evidence are ignored
by Git.

Commands:
  status                         Print installed version, service state and URL.
  verify                         Run the appliance doctor check (may prompt for sudo).
  deploy --bundle-dir DIR        Copy an extracted ARM64 release bundle and apply it.
  collect                        Download a redacted support bundle and recent logs.
  logs [--follow]                Show recent service logs; --follow keeps watching.
  tunnel [--local-port PORT]     Forward the Pi UI to http://localhost:PORT.

Configuration example (tools/dev-pi.env):
  AUTARK_PI_HOST=192.168.68.55
  AUTARK_PI_USER=jackson
  AUTARK_PI_SSH_PORT=22

Examples:
  tools/dev-pi.sh status
  tools/dev-pi.sh deploy --bundle-dir /path/to/autark-os-0.9.1-beta.24-arm64
  tools/dev-pi.sh collect
  tools/dev-pi.sh tunnel --local-port 18082

Safety:
  deploy is the only mutating command. It calls the installed appliance's
  official `autark-os update apply --release-bundle` path, which verifies the
  bundle, creates its normal update snapshot, checks health and rolls back on
  failed health verification. sudo prompts occur in this terminal, not on the
  Pi's display.
USAGE
}

log() {
  printf '[autark-os dev-pi] %s\n' "$*"
}

die() {
  printf '[autark-os dev-pi] error: %s\n' "$*" >&2
  exit 1
}

load_config() {
  if [[ -f "${CONFIG_FILE}" ]]; then
    # The config is local, ignored and intentionally owned by the developer.
    # shellcheck disable=SC1090
    source "${CONFIG_FILE}"
  fi
  PI_HOST="${AUTARK_PI_HOST:-${PI_HOST}}"
  PI_USER="${AUTARK_PI_USER:-${PI_USER}}"
  PI_SSH_PORT="${AUTARK_PI_SSH_PORT:-${PI_SSH_PORT}}"
  [[ -n "${PI_HOST}" ]] || die "Set AUTARK_PI_HOST or create ${CONFIG_FILE}."
  [[ -n "${PI_USER}" ]] || die "Set AUTARK_PI_USER or create ${CONFIG_FILE}."
  [[ "${PI_SSH_PORT}" =~ ^[0-9]+$ ]] || die "AUTARK_PI_SSH_PORT must be a number."
}

target() {
  printf '%s@%s\n' "${PI_USER}" "${PI_HOST}"
}

ssh_base() {
  ssh -o BatchMode=no -o ConnectTimeout=10 -p "${PI_SSH_PORT}" "$(target)" "$@"
}

ssh_tty() {
  ssh -tt -o BatchMode=no -o ConnectTimeout=10 -p "${PI_SSH_PORT}" "$(target)" "$@"
}

scp_to_pi() {
  local source="$1"
  local destination="$2"
  scp -P "${PI_SSH_PORT}" "${source}" "$(target):${destination}"
}

scp_from_pi() {
  local source="$1"
  local destination="$2"
  scp -P "${PI_SSH_PORT}" "$(target):${source}" "${destination}"
}

new_run_dir() {
  local label="$1"
  local directory="${ARTIFACT_ROOT}/$(date -u +%Y%m%dT%H%M%SZ)-${label}"
  mkdir -p "${directory}"
  printf '%s\n' "${directory}"
}

run_logged() {
  local output_file="$1"
  shift
  set +e
  "$@" 2>&1 | tee "${output_file}"
  local command_status="${PIPESTATUS[0]}"
  set -e
  return "${command_status}"
}

remote_stage() {
  printf '%s\n' ".cache/autark-os-dev/$(date -u +%Y%m%dT%H%M%SZ)"
}

status() {
  local run_dir
  run_dir="$(new_run_dir status)"
  run_logged "${run_dir}/status.log" ssh_base '
    set -eu
    printf "host="; hostname
    printf "architecture="; dpkg --print-architecture
    printf "service="; systemctl is-active autark-os.service || true
    /usr/local/bin/autark-os version
    printf "url="; /usr/local/bin/autark-os url
  '
  log "Saved status evidence to ${run_dir}."
}

verify() {
  local run_dir
  run_dir="$(new_run_dir verify)"
  log "The Pi may ask for your sudo password in this terminal."
  run_logged "${run_dir}/doctor.json" ssh_tty '/usr/local/bin/autark-os doctor --json'
  log "Saved doctor evidence to ${run_dir}."
}

validate_bundle() {
  local bundle_dir="$1"
  [[ -d "${bundle_dir}" ]] || die "Release bundle directory was not found: ${bundle_dir}"
  [[ -r "${bundle_dir}/autark-os-release.json" ]] || die "Bundle is missing autark-os-release.json."
  [[ -r "${bundle_dir}/SHA256SUMS" ]] || die "Bundle is missing SHA256SUMS."
  (cd "${bundle_dir}" && sha256sum -c SHA256SUMS --ignore-missing >/dev/null)
}

deploy() {
  local bundle_dir=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --bundle-dir)
        shift
        [[ $# -gt 0 ]] || die "--bundle-dir requires a directory."
        bundle_dir="$1"
        ;;
      --bundle-dir=*) bundle_dir="${1#*=}" ;;
      *) die "Unknown deploy option: $1" ;;
    esac
    shift
  done
  [[ -n "${bundle_dir}" ]] || die "deploy requires --bundle-dir DIR."
  bundle_dir="$(cd "${bundle_dir}" && pwd)"
  validate_bundle "${bundle_dir}"

  local run_dir stage archive cleanup_command
  run_dir="$(new_run_dir deploy)"
  stage="$(remote_stage)"
  archive="$(mktemp "${TMPDIR:-/tmp}/autark-os-dev-pi.XXXXXX.tar.gz")"
  printf -v cleanup_command 'rm -f %q' "${archive}"
  trap "${cleanup_command}" EXIT

  log "Creating a transfer archive from the verified release bundle."
  tar -C "${bundle_dir}" -czf "${archive}" .
  ssh_base "mkdir -p '${stage}/bundle'"
  scp_to_pi "${archive}" "${stage}/bundle.tar.gz"
  log "Applying the official update flow on $(target). The Pi may ask for your sudo password here."
  run_logged "${run_dir}/deploy.log" ssh_tty "
    set -euo pipefail
    tar -xzf '${stage}/bundle.tar.gz' -C '${stage}/bundle'
    cd '${stage}/bundle'
    sha256sum -c SHA256SUMS --ignore-missing
    sudo /usr/local/bin/autark-os update apply --release-bundle '${stage}/bundle' --yes
    sudo /usr/local/bin/autark-os doctor --json
  "
  printf '%s\n' "${stage}" >"${run_dir}/remote-stage.txt"
  log "Deployment and doctor check passed. Evidence: ${run_dir}"
}

collect() {
  local run_dir stage
  run_dir="$(new_run_dir collect)"
  stage="$(remote_stage)"
  log "Collecting a redacted support bundle. The Pi may ask for your sudo password here."
  run_logged "${run_dir}/collect.log" ssh_tty "
    set -euo pipefail
    mkdir -p '${stage}'
    sudo /usr/local/bin/autark-os support-bundle --output '${stage}/support-bundle.tar.gz'
    sudo chown \"\$(id -un)\" '${stage}/support-bundle.tar.gz'
    /usr/local/bin/autark-os logs --lines 250
  "
  scp_from_pi "${stage}/support-bundle.tar.gz" "${run_dir}/support-bundle.tar.gz"
  printf '%s\n' "${stage}" >"${run_dir}/remote-stage.txt"
  log "Downloaded support evidence to ${run_dir}."
}

logs() {
  local follow=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --follow|-f) follow=1 ;;
      *) die "Unknown logs option: $1" ;;
    esac
    shift
  done
  if [[ "${follow}" -eq 1 ]]; then
    exec ssh_tty '/usr/local/bin/autark-os logs --follow'
  fi
  ssh_tty '/usr/local/bin/autark-os logs --lines 250'
}

tunnel() {
  local local_port="18082"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --local-port)
        shift
        [[ $# -gt 0 ]] || die "--local-port requires a port number."
        local_port="$1"
        ;;
      --local-port=*) local_port="${1#*=}" ;;
      *) die "Unknown tunnel option: $1" ;;
    esac
    shift
  done
  [[ "${local_port}" =~ ^[0-9]+$ ]] && (( local_port >= 1 && local_port <= 65535 )) || die "--local-port must be between 1 and 65535."
  local remote_port
  remote_port="$(ssh_base '/usr/local/bin/autark-os port')"
  [[ "${remote_port}" =~ ^[0-9]+$ ]] || die "The Pi did not report a valid Autark-OS port."
  log "Open http://localhost:${local_port}. Press Ctrl+C to close the tunnel."
  exec ssh -N -o ExitOnForwardFailure=yes -o ConnectTimeout=10 -p "${PI_SSH_PORT}" -L "${local_port}:localhost:${remote_port}" "$(target)"
}

main() {
  local command="${1:-}"
  [[ -n "${command}" ]] || { usage; exit 1; }
  case "${command}" in
    -h|--help|help) usage; return 0 ;;
  esac
  shift
  load_config
  case "${command}" in
    status) [[ $# -eq 0 ]] || die "status does not accept options."; status ;;
    verify) [[ $# -eq 0 ]] || die "verify does not accept options."; verify ;;
    deploy) deploy "$@" ;;
    collect) [[ $# -eq 0 ]] || die "collect does not accept options."; collect ;;
    logs) logs "$@" ;;
    tunnel) tunnel "$@" ;;
    *) die "Unknown command: ${command}" ;;
  esac
}

main "$@"
