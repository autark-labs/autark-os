#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PROJECT_OS_BACKEND_PORT:-8082}"
SERVICE_NAME="${PROJECT_OS_SERVICE_NAME:-project-os}"
AUTO_PORT=0
STOP_SERVICE=0
STATUS_ONLY=0

usage() {
  cat <<USAGE
Usage: $0 [options]

Options:
  --port PORT       Run the dev backend on PORT.
  --auto-port       If PORT is busy, choose the next available port.
  --stop-service    Stop ${SERVICE_NAME}.service if it is holding the dev port.
  --status          Show current dev/prod backend port state and exit.
  -h, --help        Show this help.

Environment:
  PROJECT_OS_BACKEND_PORT      Default backend port for dev mode. Defaults to 8082.
  PROJECT_OS_SERVICE_NAME      Production systemd service name. Defaults to project-os.

Examples:
  ./scripts/dev-backend.sh
  ./scripts/dev-backend.sh --stop-service
  ./scripts/dev-backend.sh --auto-port
  ./scripts/dev-backend.sh --port 8092
USAGE
}

log() {
  printf '[project-os dev] %s\n' "$*"
}

die() {
  printf '[project-os dev] error: %s\n' "$*" >&2
  exit 1
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --port)
        [[ $# -ge 2 ]] || die "--port requires a value."
        PORT="$2"
        shift
        ;;
      --auto-port)
        AUTO_PORT=1
        ;;
      --stop-service)
        STOP_SERVICE=1
        ;;
      --status)
        STATUS_ONLY=1
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

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

service_active() {
  command_exists systemctl && systemctl is-active --quiet "${SERVICE_NAME}.service"
}

port_busy() {
  local port="$1"
  command_exists ss && ss -ltn "sport = :${port}" | grep -q LISTEN
}

find_free_port() {
  local candidate="$1"
  while port_busy "${candidate}"; do
    candidate=$((candidate + 1))
    if [[ "${candidate}" -gt 65535 ]]; then
      die "No available port found."
    fi
  done
  printf '%s\n' "${candidate}"
}

show_status() {
  log "Backend port: ${PORT}"
  if port_busy "${PORT}"; then
    log "Port ${PORT}: in use"
  else
    log "Port ${PORT}: available"
  fi
  if service_active; then
    log "${SERVICE_NAME}.service: active"
  elif command_exists systemctl; then
    log "${SERVICE_NAME}.service: $(systemctl is-active "${SERVICE_NAME}.service" 2>/dev/null || true)"
  else
    log "systemd: unavailable"
  fi
}

stop_service_if_requested() {
  if [[ "${STOP_SERVICE}" -ne 1 ]]; then
    return 0
  fi
  if ! service_active; then
    log "${SERVICE_NAME}.service is not active."
    return 0
  fi
  command_exists sudo || die "sudo is required to stop ${SERVICE_NAME}.service."
  log "Stopping ${SERVICE_NAME}.service so dev mode can use port ${PORT}."
  sudo systemctl stop "${SERVICE_NAME}.service"
}

explain_conflict() {
  log "Port ${PORT} is already in use."
  if service_active; then
    log "${SERVICE_NAME}.service is active and is likely holding the production backend port."
    log "Choose one workflow:"
    log "  1. Stop production for this dev session: ./scripts/dev-backend.sh --stop-service"
    log "  2. Keep production running and use another port: ./scripts/dev-backend.sh --auto-port"
    log "  3. Use a specific port: ./scripts/dev-backend.sh --port 8092"
  else
    log "Stop the process using ${PORT}, or run: ./scripts/dev-backend.sh --auto-port"
  fi
}

parse_args "$@"

if [[ "${STATUS_ONLY}" -eq 1 ]]; then
  show_status
  exit 0
fi

stop_service_if_requested

if port_busy "${PORT}"; then
  if [[ "${AUTO_PORT}" -eq 1 ]]; then
    ORIGINAL_PORT="${PORT}"
    PORT="$(find_free_port "$((PORT + 1))")"
    log "Port ${ORIGINAL_PORT} is busy; using ${PORT} for this dev backend."
  else
    explain_conflict
    exit 1
  fi
fi

log "Starting backend with SPRING_PROFILES_ACTIVE=dev on port ${PORT}."
log "Frontend proxy for this backend: PROJECT_OS_BACKEND_URL=http://localhost:${PORT} yarn dev"

export SPRING_PROFILES_ACTIVE="${SPRING_PROFILES_ACTIVE:-dev}"
export SERVER_PORT="${PORT}"

exec "${ROOT_DIR}/backend/gradlew" -p "${ROOT_DIR}/backend" bootRun
