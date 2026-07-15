#!/usr/bin/env bash
set -Eeuo pipefail

OUTPUT_DIR=""
VERSION="${AUTARK_OS_VERSION:-0.0.1-SNAPSHOT}"
CHANNEL="${AUTARK_OS_UPDATE_CHANNEL:-beta}"
RELEASE_NOTES_URL="${AUTARK_OS_RELEASE_NOTES_URL:-}"
ARTIFACT_ARCHITECTURE="${AUTARK_OS_ARTIFACT_ARCHITECTURE:-}"
SKIP_BUILD=0
DRY_RUN=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
HOST_MATRIX_FILE="${SCRIPT_DIR}/supported-host-matrix.env"
[[ -r "${HOST_MATRIX_FILE}" ]] || { printf '[autark-os release] error: supported host policy is missing: %s\n' "${HOST_MATRIX_FILE}" >&2; exit 1; }
# shellcheck source=supported-host-matrix.env
source "${HOST_MATRIX_FILE}"

usage() {
  cat <<USAGE
Usage: $0 [options]

Build a local Autark-OS release bundle that can be installed without Node.js
or Yarn on the target host.

Options:
  --output-dir DIR  Directory where the bundle should be created. Default: release/autark-os-VERSION-ARCH.
  --version VALUE   Release version metadata. Default: ${VERSION}.
  --channel VALUE   Release channel metadata. Default: ${CHANNEL}.
  --architecture VALUE Artifact architecture: amd64 or arm64. Default: build host architecture.
  --release-notes-url URL Release notes URL metadata.
  --skip-build      Use the existing backend boot jar.
  --dry-run         Print actions without creating files.
  -h, --help        Show this help.

The bundle layout is:
  autark-os-release.env
  SHA256SUMS
  backend/autark-os-backend.jar
  scripts/bootstrap-autark-os.sh
  scripts/supported-host-matrix.env
  scripts/install-autark-os-service.sh
  scripts/install-autark-os.sh
  scripts/autark-os-gui-installer.sh
  scripts/autark-os
  scripts/autark-os-fileops
USAGE
}

log() {
  printf '[autark-os release] %s\n' "$*"
}

die() {
  printf '[autark-os release] error: %s\n' "$*" >&2
  exit 1
}

has_command() {
  command -v "$1" >/dev/null 2>&1
}

normalize_architecture() {
  case "$1" in
    x86_64|amd64) printf 'amd64\n' ;;
    aarch64|arm64) printf 'arm64\n' ;;
    *) return 1 ;;
  esac
}

build_host_architecture() {
  local detected
  if has_command dpkg; then
    detected="$(dpkg --print-architecture)"
  else
    detected="$(uname -m)"
  fi
  normalize_architecture "${detected}" || die "Unsupported build host architecture: ${detected}. Autark-OS release artifacts require amd64 or arm64."
}

validate_build_architecture() {
  local host_architecture
  ARTIFACT_ARCHITECTURE="$(normalize_architecture "${ARTIFACT_ARCHITECTURE}")" || die "--architecture must be amd64 or arm64: ${ARTIFACT_ARCHITECTURE}"
  host_architecture="$(build_host_architecture)"
  [[ "${ARTIFACT_ARCHITECTURE}" == "${host_architecture}" ]] || die "Cannot build ${ARTIFACT_ARCHITECTURE} release artifacts on ${host_architecture}. Use a native ${ARTIFACT_ARCHITECTURE} builder."
}

runtime_architecture() {
  local java_binary="$1"
  local description
  has_command file || die "file is required to verify the bundled Java runtime architecture."
  description="$(file -Lb "${java_binary}")"
  case "${description}" in
    *x86-64*|*x86_64*) printf 'amd64\n' ;;
    *aarch64*|*AArch64*|*ARM64*) printf 'arm64\n' ;;
    *) die "Could not identify bundled Java runtime architecture: ${description}" ;;
  esac
}

verify_runtime_architecture() {
  [[ "${DRY_RUN}" -eq 0 ]] || return 0
  local java_binary="${OUTPUT_DIR}/runtime/bin/java"
  [[ -x "${java_binary}" ]] || die "Bundled Java runtime is missing or not executable: ${java_binary}"
  local detected
  detected="$(runtime_architecture "${java_binary}")"
  [[ "${detected}" == "${ARTIFACT_ARCHITECTURE}" ]] || die "Bundled Java runtime is ${detected}, but this artifact is declared ${ARTIFACT_ARCHITECTURE}."
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
      --architecture)
        shift
        [[ $# -gt 0 ]] || die "--architecture requires a value."
        ARTIFACT_ARCHITECTURE="$1"
        ;;
      --architecture=*)
        ARTIFACT_ARCHITECTURE="${1#*=}"
        ;;
      --release-notes-url)
        shift
        [[ $# -gt 0 ]] || die "--release-notes-url requires a URL."
        RELEASE_NOTES_URL="$1"
        ;;
      --release-notes-url=*)
        RELEASE_NOTES_URL="${1#*=}"
        ;;
      --supported-architectures|--supported-architectures=*)
        die "--supported-architectures has been replaced by one --architecture per artifact build."
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
  [[ -n "${ARTIFACT_ARCHITECTURE}" ]] || ARTIFACT_ARCHITECTURE="$(build_host_architecture)"
  validate_build_architecture
  [[ -n "${OUTPUT_DIR}" ]] || OUTPUT_DIR="${REPO_ROOT}/release/autark-os-${VERSION}-${ARTIFACT_ARCHITECTURE}"
  if [[ "${OUTPUT_DIR}" != /* ]]; then
    OUTPUT_DIR="${REPO_ROOT}/${OUTPUT_DIR}"
  fi
}

find_backend_jar() {
  find "${REPO_ROOT}/backend/build/libs" -maxdepth 1 -type f -name 'autark-os-backend*.jar' ! -name '*plain*.jar' | sort | head -n 1
}

build_runtime() {
  local runtime_dir="${OUTPUT_DIR}/runtime"
  if [[ "${SKIP_BUILD}" -eq 1 && -d "${AUTARK_OS_RUNTIME_DIR:-}" ]]; then
    run_cmd cp -a "${AUTARK_OS_RUNTIME_DIR}" "${runtime_dir}"
    return 0
  fi
  command -v jlink >/dev/null 2>&1 || die "jlink from a Java 21 JDK is required to build the bundled runtime."
  run_cmd jlink --add-modules java.base,java.compiler,java.desktop,java.instrument,java.logging,java.management,java.naming,java.net.http,java.security.jgss,java.sql,java.transaction.xa,java.xml,jdk.management,jdk.unsupported --strip-debug --no-header-files --no-man-pages --output "${runtime_dir}"
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
  run_cmd env AUTARK_OS_BUILD_VERSION="${VERSION}" \
    "${REPO_ROOT}/backend/gradlew" -p "${REPO_ROOT}/backend" clean bootJar
}

write_metadata() {
  local build_sha build_date
  build_sha="$(git -C "${REPO_ROOT}" rev-parse --short=12 HEAD 2>/dev/null || printf unknown)"
  build_date="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    cat <<META
+ cat > ${OUTPUT_DIR}/autark-os-release.env
AUTARK_OS_VERSION=${VERSION}
AUTARK_OS_BUILD_SHA=${build_sha}
AUTARK_OS_BUILD_DATE=${build_date}
AUTARK_OS_UPDATE_CHANNEL=${CHANNEL}
AUTARK_OS_RELEASE_NOTES_URL=${RELEASE_NOTES_URL}
AUTARK_OS_ARTIFACT_ARCHITECTURE=${ARTIFACT_ARCHITECTURE}
AUTARK_OS_RUNTIME_ARCHITECTURE=${ARTIFACT_ARCHITECTURE}
AUTARK_OS_SUPPORTED_HOST_POLICY_VERSION=${AUTARK_OS_SUPPORTED_HOST_POLICY_VERSION}
AUTARK_OS_MIN_MEMORY_MB=${AUTARK_OS_MIN_MEMORY_MB}
AUTARK_OS_MIN_DISK_KB=${AUTARK_OS_MIN_DISK_KB}
META
    return 0
  fi
  cat >"${OUTPUT_DIR}/autark-os-release.env" <<META
AUTARK_OS_VERSION=${VERSION}
AUTARK_OS_BUILD_SHA=${build_sha}
AUTARK_OS_BUILD_DATE=${build_date}
AUTARK_OS_UPDATE_CHANNEL=${CHANNEL}
AUTARK_OS_RELEASE_NOTES_URL=${RELEASE_NOTES_URL}
AUTARK_OS_ARTIFACT_ARCHITECTURE=${ARTIFACT_ARCHITECTURE}
AUTARK_OS_RUNTIME_ARCHITECTURE=${ARTIFACT_ARCHITECTURE}
AUTARK_OS_SUPPORTED_HOST_POLICY_VERSION=${AUTARK_OS_SUPPORTED_HOST_POLICY_VERSION}
AUTARK_OS_MIN_MEMORY_MB=${AUTARK_OS_MIN_MEMORY_MB}
AUTARK_OS_MIN_DISK_KB=${AUTARK_OS_MIN_DISK_KB}
META
  write_release_json "${build_sha}" "${build_date}"
  write_provenance_json "${build_sha}" "${build_date}"
}

json_space_list() {
  local values="$1"
  local first=1
  printf '['
  local value
  for value in ${values}; do
    if [[ "${first}" -eq 0 ]]; then
      printf ','
    fi
    first=0
    printf '"%s"' "${value}"
  done
  printf ']'
}

write_release_json() {
  local build_sha="$1"
  local build_date="$2"
  cat >"${OUTPUT_DIR}/autark-os-release.json" <<JSON
{
  "schemaVersion": 2,
  "name": "autark-os",
  "version": "${VERSION}",
  "channel": "${CHANNEL}",
  "buildSha": "${build_sha}",
  "buildDate": "${build_date}",
  "releaseNotesUrl": "${RELEASE_NOTES_URL}",
  "artifactArchitecture": "${ARTIFACT_ARCHITECTURE}",
  "runtimeArchitecture": "${ARTIFACT_ARCHITECTURE}",
  "supportedHostPolicyVersion": "${AUTARK_OS_SUPPORTED_HOST_POLICY_VERSION}",
  "requirements": {
    "minimumMemoryMb": ${AUTARK_OS_MIN_MEMORY_MB},
    "minimumDiskKb": ${AUTARK_OS_MIN_DISK_KB},
    "init": "${AUTARK_OS_REQUIRED_INIT}"
  },
  "supportedHosts": {
    "debian": {
      "versions": $(json_space_list "${AUTARK_OS_SUPPORTED_DEBIAN_VERSIONS}"),
      "architectures": $(json_space_list "${AUTARK_OS_SUPPORTED_DEBIAN_ARCHITECTURES}")
    },
    "ubuntu": {
      "versions": $(json_space_list "${AUTARK_OS_SUPPORTED_UBUNTU_VERSIONS}"),
      "architectures": $(json_space_list "${AUTARK_OS_SUPPORTED_UBUNTU_ARCHITECTURES}")
    },
    "raspbian": {
      "versions": $(json_space_list "${AUTARK_OS_SUPPORTED_RASPBIAN_VERSIONS}"),
      "architectures": $(json_space_list "${AUTARK_OS_SUPPORTED_RASPBIAN_ARCHITECTURES}")
    }
  },
  "artifacts": [
    "backend/autark-os-backend.jar",
    "runtime/bin/java",
    "scripts/bootstrap-autark-os.sh",
    "scripts/install-autark-os-service.sh",
    "scripts/install-autark-os.sh",
    "scripts/autark-os-gui-installer.sh",
    "scripts/autark-os",
    "scripts/autark-os-fileops"
  ],
  "signatureStatus": "unsigned-reserved"
}
JSON
}

write_provenance_json() {
  local build_sha="$1"
  local build_date="$2"
  cat >"${OUTPUT_DIR}/autark-os-provenance.json" <<JSON
{
  "schemaVersion": 2,
  "buildSha": "${build_sha}",
  "buildDate": "${build_date}",
  "builder": "scripts/build-release-bundle.sh",
  "builderArchitecture": "$(build_host_architecture)",
  "artifactArchitecture": "${ARTIFACT_ARCHITECTURE}",
  "runtimeArchitecture": "${ARTIFACT_ARCHITECTURE}",
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
  build_runtime
  verify_runtime_architecture
  run_cmd cp "${jar}" "${OUTPUT_DIR}/backend/autark-os-backend.jar"
  run_cmd cp "${SCRIPT_DIR}/bootstrap-autark-os.sh" "${OUTPUT_DIR}/scripts/bootstrap-autark-os.sh"
  run_cmd cp "${SCRIPT_DIR}/supported-host-matrix.env" "${OUTPUT_DIR}/scripts/supported-host-matrix.env"
  run_cmd cp "${SCRIPT_DIR}/install-autark-os-service.sh" "${OUTPUT_DIR}/scripts/install-autark-os-service.sh"
  run_cmd cp "${SCRIPT_DIR}/install-autark-os.sh" "${OUTPUT_DIR}/scripts/install-autark-os.sh"
  run_cmd cp "${SCRIPT_DIR}/autark-os-gui-installer.sh" "${OUTPUT_DIR}/scripts/autark-os-gui-installer.sh"
  run_cmd cp "${SCRIPT_DIR}/autark-os" "${OUTPUT_DIR}/scripts/autark-os"
  run_cmd cp "${SCRIPT_DIR}/autark-os-fileops" "${OUTPUT_DIR}/scripts/autark-os-fileops"
  run_cmd chmod +x \
    "${OUTPUT_DIR}/scripts/bootstrap-autark-os.sh" \
    "${OUTPUT_DIR}/scripts/install-autark-os-service.sh" \
    "${OUTPUT_DIR}/scripts/install-autark-os.sh" \
    "${OUTPUT_DIR}/scripts/autark-os-gui-installer.sh" \
    "${OUTPUT_DIR}/scripts/autark-os" \
    "${OUTPUT_DIR}/scripts/autark-os-fileops"
  write_metadata

  if [[ "${DRY_RUN}" -eq 1 ]]; then
    printf '+ cd %q && find backend runtime scripts \\( -type f -o -type l \\) -print0 | sort -z | xargs -0 sha256sum; sha256sum autark-os-release.env autark-os-release.json autark-os-provenance.json > SHA256SUMS\n' "${OUTPUT_DIR}"
  else
    (
      cd "${OUTPUT_DIR}"
      {
        find backend runtime scripts \( -type f -o -type l \) -print0 | sort -z | xargs -0 sha256sum
        sha256sum autark-os-release.env autark-os-release.json autark-os-provenance.json
      } >SHA256SUMS
    )
  fi
}

print_next_step() {
  cat <<NEXT

Release bundle ready:
  ${OUTPUT_DIR}

Install it on a target host:
  ${OUTPUT_DIR}/scripts/bootstrap-autark-os.sh --release-bundle ${OUTPUT_DIR} --auto-install-deps

Preview target-host changes first:
  ${OUTPUT_DIR}/scripts/bootstrap-autark-os.sh --release-bundle ${OUTPUT_DIR} --auto-install-deps --dry-run

NEXT
}

main() {
  parse_args "$@"
  build_project
  create_bundle
  print_next_step
}

main "$@"
