#!/usr/bin/env bash
set -Eeuo pipefail

OUTPUT_DIR=""
VERSION="${PROJECT_OS_VERSION:-0.0.1-SNAPSHOT}"
CHANNEL="${PROJECT_OS_UPDATE_CHANNEL:-beta}"
RELEASE_NOTES_URL="${PROJECT_OS_RELEASE_NOTES_URL:-}"
SUPPORTED_ARCHITECTURES="${PROJECT_OS_SUPPORTED_ARCHITECTURES:-x86_64,aarch64,arm64}"
SKIP_BUILD=0
DRY_RUN=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
  cat <<USAGE
Usage: $0 [options]

Build a local Project OS release bundle that can be installed without Node.js
or Yarn on the target host.

Options:
  --output-dir DIR  Directory where the bundle should be created. Default: release/project-os-VERSION.
  --version VALUE   Release version metadata. Default: ${VERSION}.
  --channel VALUE   Release channel metadata. Default: ${CHANNEL}.
  --release-notes-url URL Release notes URL metadata.
  --supported-architectures LIST Comma-separated supported architectures.
  --skip-build      Use the existing backend boot jar.
  --dry-run         Print actions without creating files.
  -h, --help        Show this help.

The bundle layout is:
  project-os-release.env
  SHA256SUMS
  backend/project-os-backend.jar
  scripts/bootstrap-project-os.sh
  scripts/install-project-os-service.sh
  scripts/install-project-os.sh
  scripts/project-os-gui-installer.sh
  scripts/project-os
  scripts/project-os-fileops
USAGE
}

log() {
  printf '[project-os release] %s\n' "$*"
}

die() {
  printf '[project-os release] error: %s\n' "$*" >&2
  exit 1
}

has_command() {
  command -v "$1" >/dev/null 2>&1
}

run_cmd() {
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    printf '+'
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi
  "$@"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --output-dir)
        shift
        [[ $# -gt 0 ]] || die "--output-dir requires a directory."
        OUTPUT_DIR="$1"
        ;;
      --output-dir=*)
        OUTPUT_DIR="${1#*=}"
        ;;
      --version)
        shift
        [[ $# -gt 0 ]] || die "--version requires a value."
        VERSION="$1"
        ;;
      --version=*)
        VERSION="${1#*=}"
        ;;
      --channel)
        shift
        [[ $# -gt 0 ]] || die "--channel requires a value."
        CHANNEL="$1"
        ;;
      --channel=*)
        CHANNEL="${1#*=}"
        ;;
      --release-notes-url)
        shift
        [[ $# -gt 0 ]] || die "--release-notes-url requires a URL."
        RELEASE_NOTES_URL="$1"
        ;;
      --release-notes-url=*)
        RELEASE_NOTES_URL="${1#*=}"
        ;;
      --supported-architectures)
        shift
        [[ $# -gt 0 ]] || die "--supported-architectures requires a comma-separated list."
        SUPPORTED_ARCHITECTURES="$1"
        ;;
      --supported-architectures=*)
        SUPPORTED_ARCHITECTURES="${1#*=}"
        ;;
      --skip-build)
        SKIP_BUILD=1
        ;;
      --dry-run)
        DRY_RUN=1
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
  [[ -n "${OUTPUT_DIR}" ]] || OUTPUT_DIR="${REPO_ROOT}/release/project-os-${VERSION}"
  if [[ "${OUTPUT_DIR}" != /* ]]; then
    OUTPUT_DIR="${REPO_ROOT}/${OUTPUT_DIR}"
  fi
}

find_backend_jar() {
  find "${REPO_ROOT}/backend/build/libs" -maxdepth 1 -type f -name 'project-os-backend*.jar' ! -name '*plain*.jar' | sort | head -n 1
}

build_project() {
  if [[ "${SKIP_BUILD}" -eq 1 ]]; then
    log "Skipping build and using existing backend jar."
    return 0
  fi
  log "Installing frontend dependencies."
  if [[ -f "${REPO_ROOT}/frontend/yarn.lock" ]]; then
    run_cmd env bash -lc "cd '${REPO_ROOT}/frontend' && yarn install --frozen-lockfile"
  else
    run_cmd env bash -lc "cd '${REPO_ROOT}/frontend' && yarn install"
  fi
  log "Building backend boot jar."
  run_cmd "${REPO_ROOT}/backend/gradlew" -p "${REPO_ROOT}/backend" bootJar
}

write_metadata() {
  local build_sha build_date
  build_sha="$(git -C "${REPO_ROOT}" rev-parse --short=12 HEAD 2>/dev/null || printf unknown)"
  build_date="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    cat <<META
+ cat > ${OUTPUT_DIR}/project-os-release.env
PROJECT_OS_VERSION=${VERSION}
PROJECT_OS_BUILD_SHA=${build_sha}
PROJECT_OS_BUILD_DATE=${build_date}
PROJECT_OS_UPDATE_CHANNEL=${CHANNEL}
PROJECT_OS_RELEASE_NOTES_URL=${RELEASE_NOTES_URL}
PROJECT_OS_SUPPORTED_ARCHITECTURES=${SUPPORTED_ARCHITECTURES}
META
    return 0
  fi
  cat >"${OUTPUT_DIR}/project-os-release.env" <<META
PROJECT_OS_VERSION=${VERSION}
PROJECT_OS_BUILD_SHA=${build_sha}
PROJECT_OS_BUILD_DATE=${build_date}
PROJECT_OS_UPDATE_CHANNEL=${CHANNEL}
PROJECT_OS_RELEASE_NOTES_URL=${RELEASE_NOTES_URL}
PROJECT_OS_SUPPORTED_ARCHITECTURES=${SUPPORTED_ARCHITECTURES}
META
  write_release_json "${build_sha}" "${build_date}"
  write_provenance_json "${build_sha}" "${build_date}"
}

json_architectures() {
  local first=1
  printf '['
  IFS=',' read -ra architectures <<<"${SUPPORTED_ARCHITECTURES}"
  for architecture in "${architectures[@]}"; do
    architecture="$(printf '%s' "${architecture}" | xargs)"
    [[ -n "${architecture}" ]] || continue
    if [[ "${first}" -eq 0 ]]; then
      printf ','
    fi
    first=0
    printf '"%s"' "${architecture}"
  done
  printf ']'
}

write_release_json() {
  local build_sha="$1"
  local build_date="$2"
  cat >"${OUTPUT_DIR}/project-os-release.json" <<JSON
{
  "schemaVersion": 1,
  "name": "project-os",
  "version": "${VERSION}",
  "channel": "${CHANNEL}",
  "buildSha": "${build_sha}",
  "buildDate": "${build_date}",
  "releaseNotesUrl": "${RELEASE_NOTES_URL}",
  "supportedArchitectures": $(json_architectures),
  "artifacts": [
    "backend/project-os-backend.jar",
    "scripts/bootstrap-project-os.sh",
    "scripts/install-project-os-service.sh",
    "scripts/install-project-os.sh",
    "scripts/project-os-gui-installer.sh",
    "scripts/project-os",
    "scripts/project-os-fileops"
  ],
  "signatureStatus": "unsigned-reserved"
}
JSON
}

write_provenance_json() {
  local build_sha="$1"
  local build_date="$2"
  cat >"${OUTPUT_DIR}/project-os-provenance.json" <<JSON
{
  "schemaVersion": 1,
  "buildSha": "${build_sha}",
  "buildDate": "${build_date}",
  "builder": "scripts/build-release-bundle.sh",
  "source": "local-worktree",
  "signatureStatus": "unsigned-reserved"
}
JSON
}

create_bundle() {
  local jar
  jar="$(find_backend_jar)"
  [[ -n "${jar}" && -r "${jar}" ]] || die "No backend boot jar found. Run without --skip-build or build with './backend/gradlew -p backend bootJar'."

  log "Creating release bundle at ${OUTPUT_DIR}."
  run_cmd rm -rf "${OUTPUT_DIR}"
  run_cmd mkdir -p "${OUTPUT_DIR}/backend" "${OUTPUT_DIR}/scripts"
  run_cmd cp "${jar}" "${OUTPUT_DIR}/backend/project-os-backend.jar"
  run_cmd cp "${SCRIPT_DIR}/bootstrap-project-os.sh" "${OUTPUT_DIR}/scripts/bootstrap-project-os.sh"
  run_cmd cp "${SCRIPT_DIR}/install-project-os-service.sh" "${OUTPUT_DIR}/scripts/install-project-os-service.sh"
  run_cmd cp "${SCRIPT_DIR}/install-project-os.sh" "${OUTPUT_DIR}/scripts/install-project-os.sh"
  run_cmd cp "${SCRIPT_DIR}/project-os-gui-installer.sh" "${OUTPUT_DIR}/scripts/project-os-gui-installer.sh"
  run_cmd cp "${SCRIPT_DIR}/project-os" "${OUTPUT_DIR}/scripts/project-os"
  run_cmd cp "${SCRIPT_DIR}/project-os-fileops" "${OUTPUT_DIR}/scripts/project-os-fileops"
  run_cmd chmod +x \
    "${OUTPUT_DIR}/scripts/bootstrap-project-os.sh" \
    "${OUTPUT_DIR}/scripts/install-project-os-service.sh" \
    "${OUTPUT_DIR}/scripts/install-project-os.sh" \
    "${OUTPUT_DIR}/scripts/project-os-gui-installer.sh" \
    "${OUTPUT_DIR}/scripts/project-os" \
    "${OUTPUT_DIR}/scripts/project-os-fileops"
  write_metadata

  if [[ "${DRY_RUN}" -eq 1 ]]; then
    printf '+ cd %q && sha256sum backend/project-os-backend.jar scripts/bootstrap-project-os.sh scripts/install-project-os-service.sh scripts/install-project-os.sh scripts/project-os-gui-installer.sh scripts/project-os scripts/project-os-fileops project-os-release.env project-os-release.json project-os-provenance.json > SHA256SUMS\n' "${OUTPUT_DIR}"
  else
    (cd "${OUTPUT_DIR}" && sha256sum backend/project-os-backend.jar scripts/bootstrap-project-os.sh scripts/install-project-os-service.sh scripts/install-project-os.sh scripts/project-os-gui-installer.sh scripts/project-os scripts/project-os-fileops project-os-release.env project-os-release.json project-os-provenance.json > SHA256SUMS)
  fi
}

print_next_step() {
  cat <<NEXT

Release bundle ready:
  ${OUTPUT_DIR}

Install it on a target host:
  ${OUTPUT_DIR}/scripts/bootstrap-project-os.sh --release-bundle ${OUTPUT_DIR} --auto-install-deps

Preview target-host changes first:
  ${OUTPUT_DIR}/scripts/bootstrap-project-os.sh --release-bundle ${OUTPUT_DIR} --auto-install-deps --dry-run

NEXT
}

main() {
  parse_args "$@"
  build_project
  create_bundle
  print_next_step
}

main "$@"
