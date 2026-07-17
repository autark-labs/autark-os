#!/usr/bin/env bash
set -Eeuo pipefail

OUTPUT_DIR=""
VERSION="${AUTARK_OS_VERSION:-0.0.1-SNAPSHOT}"
CHANNEL="${AUTARK_OS_UPDATE_CHANNEL:-beta}"
RELEASE_NOTES_URL="${AUTARK_OS_RELEASE_NOTES_URL:-}"
ARTIFACT_ARCHITECTURE="${AUTARK_OS_ARTIFACT_ARCHITECTURE:-}"
BUILD_SHA="${AUTARK_OS_BUILD_SHA:-}"
BUILD_DATE="${AUTARK_OS_BUILD_DATE:-}"
VERSION_WAS_PROVIDED=0
BUILD_SHA_WAS_PROVIDED=0
[[ -n "${AUTARK_OS_VERSION:-}" ]] && VERSION_WAS_PROVIDED=1
[[ -n "${AUTARK_OS_BUILD_SHA:-}" ]] && BUILD_SHA_WAS_PROVIDED=1
SKIP_BUILD=0
DRY_RUN=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
HOST_MATRIX_FILE="${SCRIPT_DIR}/supported-host-matrix.env"
RELEASE_DOCS_SOURCE_DIR="${REPO_ROOT}/docs/release"
LICENSE_SOURCE="${REPO_ROOT}/LICENSE.md"
COMMERCIAL_LICENSE_SOURCE="${REPO_ROOT}/COMMERCIAL-LICENSE.md"
SUPPORT_SOURCE="${REPO_ROOT}/SUPPORT.md"
SECURITY_SOURCE="${REPO_ROOT}/SECURITY.md"
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
  --build-sha SHA    Build commit recorded in the backend jar and release metadata.
  --build-date DATE  UTC build timestamp recorded in the backend jar and release metadata.
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
  docs/GETTING_STARTED.md
  docs/RELEASE_NOTES.md
  docs/LICENSE.md
  docs/THIRD_PARTY_NOTICES.md
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
        VERSION_WAS_PROVIDED=1
        ;;
      --version=*)
        VERSION="${1#*=}"
        VERSION_WAS_PROVIDED=1
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
      --build-sha)
        shift
        [[ $# -gt 0 ]] || die "--build-sha requires a value."
        BUILD_SHA="$1"
        BUILD_SHA_WAS_PROVIDED=1
        ;;
      --build-sha=*)
        BUILD_SHA="${1#*=}"
        BUILD_SHA_WAS_PROVIDED=1
        ;;
      --build-date)
        shift
        [[ $# -gt 0 ]] || die "--build-date requires a value."
        BUILD_DATE="$1"
        ;;
      --build-date=*)
        BUILD_DATE="${1#*=}"
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
  [[ -n "${BUILD_SHA}" ]] || BUILD_SHA="$(git -C "${REPO_ROOT}" rev-parse HEAD 2>/dev/null || printf unknown)"
  [[ -n "${BUILD_DATE}" ]] || BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  if [[ "${SKIP_BUILD}" -eq 1 && "${DRY_RUN}" -eq 0 ]]; then
    [[ "${VERSION_WAS_PROVIDED}" -eq 1 ]] || die "--skip-build requires an explicit --version or AUTARK_OS_VERSION."
    [[ "${BUILD_SHA_WAS_PROVIDED}" -eq 1 ]] || die "--skip-build requires an explicit --build-sha or AUTARK_OS_BUILD_SHA."
  fi
}

find_backend_jar() {
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    printf '%s\n' "${AUTARK_OS_BACKEND_JAR:-${REPO_ROOT}/backend/build/libs/autark-os-backend-VERSION.jar}"
    return 0
  fi
  if [[ -n "${AUTARK_OS_BACKEND_JAR:-}" ]]; then
    [[ -r "${AUTARK_OS_BACKEND_JAR}" ]] || die "AUTARK_OS_BACKEND_JAR is not readable: ${AUTARK_OS_BACKEND_JAR}"
    printf '%s\n' "${AUTARK_OS_BACKEND_JAR}"
    return 0
  fi
  local jars=()
  mapfile -t jars < <(find "${REPO_ROOT}/backend/build/libs" -maxdepth 1 -type f -name 'autark-os-backend*.jar' ! -name '*plain*.jar' | sort)
  [[ "${#jars[@]}" -eq 1 ]] || die "Expected exactly one backend boot jar. Set AUTARK_OS_BACKEND_JAR explicitly or remove stale jars from backend/build/libs."
  printf '%s\n' "${jars[0]}"
}

jar_manifest_value() {
  local jar="$1"
  local key="$2"
  has_command unzip || die "unzip is required to inspect the backend jar release identity."
  unzip -p "${jar}" META-INF/MANIFEST.MF 2>/dev/null | tr -d '\r' | awk -F': ' -v key="${key}" '$1 == key {print $2; exit}'
}

verify_backend_jar_identity() {
  local jar="$1"
  local jar_version jar_sha jar_date
  jar_version="$(jar_manifest_value "${jar}" Implementation-Version)"
  jar_sha="$(jar_manifest_value "${jar}" Autark-OS-Build-Sha)"
  jar_date="$(jar_manifest_value "${jar}" Autark-OS-Build-Date)"
  [[ "${jar_version}" == "${VERSION}" ]] || die "Backend jar version '${jar_version:-missing}' does not match requested release version '${VERSION}'. Rebuild without --skip-build or select the matching jar."
  [[ -n "${jar_sha}" && "${jar_sha}" != "development" && "${jar_sha}" != "unknown" ]] || die "Backend jar is missing a release build SHA. Rebuild without --skip-build."
  [[ "${jar_sha}" == "${BUILD_SHA}" ]] || die "Backend jar build SHA '${jar_sha}' does not match requested release build SHA '${BUILD_SHA}'."
  [[ -n "${jar_date}" && "${jar_date}" != "development" ]] || die "Backend jar is missing a release build date. Rebuild without --skip-build."
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
  run_cmd env AUTARK_OS_BUILD_VERSION="${VERSION}" AUTARK_OS_BUILD_SHA="${BUILD_SHA}" AUTARK_OS_BUILD_DATE="${BUILD_DATE}" \
    "${REPO_ROOT}/backend/gradlew" -p "${REPO_ROOT}/backend" clean bootJar
}

write_metadata() {
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    cat <<META
+ cat > ${OUTPUT_DIR}/autark-os-release.env
AUTARK_OS_VERSION=${VERSION}
AUTARK_OS_BUILD_SHA=${BUILD_SHA}
AUTARK_OS_BUILD_DATE=${BUILD_DATE}
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
AUTARK_OS_BUILD_SHA=${BUILD_SHA}
AUTARK_OS_BUILD_DATE=${BUILD_DATE}
AUTARK_OS_UPDATE_CHANNEL=${CHANNEL}
AUTARK_OS_RELEASE_NOTES_URL=${RELEASE_NOTES_URL}
AUTARK_OS_ARTIFACT_ARCHITECTURE=${ARTIFACT_ARCHITECTURE}
AUTARK_OS_RUNTIME_ARCHITECTURE=${ARTIFACT_ARCHITECTURE}
AUTARK_OS_SUPPORTED_HOST_POLICY_VERSION=${AUTARK_OS_SUPPORTED_HOST_POLICY_VERSION}
AUTARK_OS_MIN_MEMORY_MB=${AUTARK_OS_MIN_MEMORY_MB}
AUTARK_OS_MIN_DISK_KB=${AUTARK_OS_MIN_DISK_KB}
META
  write_release_json "${BUILD_SHA}" "${BUILD_DATE}"
  write_provenance_json "${BUILD_SHA}" "${BUILD_DATE}"
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
    "scripts/autark-os-fileops",
    "docs/GETTING_STARTED.md",
    "docs/RELEASE_NOTES.md",
    "docs/LICENSE.md",
    "docs/THIRD_PARTY_NOTICES.md",
    "docs/THIRD_PARTY_COMPONENTS.txt",
    "docs/THIRD_PARTY_FRONTEND_LOCK.txt",
    "docs/SUPPORT.md",
    "docs/SECURITY.md"
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

release_commit_summaries() {
  local summaries
  summaries="$(git -C "${REPO_ROOT}" log -n 12 --format='- %s (%h)' "${BUILD_SHA}" 2>/dev/null || true)"
  if [[ -n "${summaries}" ]]; then
    printf '%s\n' "${summaries}"
  else
    printf '%s\n' "- Release built from source revision ${BUILD_SHA}."
  fi
}

write_release_notes() {
  local docs_dir="$1"
  cat >"${docs_dir}/RELEASE_NOTES.md" <<NOTES
# Autark-OS ${VERSION}

Release channel: ${CHANNEL}
Source revision: ${BUILD_SHA}
Built: ${BUILD_DATE}

## User-visible changes

$(release_commit_summaries)

## Fixed issues

This release includes the fixes represented by the source revisions above. If
you are upgrading from an earlier release, review the update plan before
confirming it and keep a verified backup where one is available.

## Upgrade And Compatibility Notes

- Use \`autark-os update\` for the guided update and automatic health rollback.
- The portable installer updates an existing Autark-OS installation instead of
  creating a second one.
- Supported hosts are Debian 12/13 and Ubuntu 24.04/26.04 on amd64 or arm64,
  plus 64-bit Raspberry Pi OS 11/12/13 on arm64. A Pi 5 is primarily targeted
  by Raspberry Pi OS 13 and also supported on Pi OS 12.
- Managed application data, backups, Docker, and the host Tailscale identity
  are preserved by a normal Autark-OS update.

## Known Limitations

- This is a controlled beta release. Test it on a non-critical host before
  relying on it for important services.
- Tailscale is optional and private links require a connected Tailscale host.
- App catalog coverage is still early; review each app's install plan and
  backup state before relying on it.
- Backups are not described as encrypted. Only restore points shown as verified
  should be treated as ready for recovery.

## Verify This Download

Verify the checksums supplied with this release before installing:

\`\`\`bash
sha256sum -c SHA256SUMS --ignore-missing
\`\`\`

The release page for this immutable tag is:

${RELEASE_NOTES_URL}

For technical component information, read \`THIRD_PARTY_NOTICES.md\` in this
same documentation directory.
NOTES
}

copy_release_docs() {
  local jar="$1"
  local docs_dir="${OUTPUT_DIR}/docs"
  local required_source
  for required_source in \
    "${RELEASE_DOCS_SOURCE_DIR}/GETTING_STARTED.md" \
    "${RELEASE_DOCS_SOURCE_DIR}/THIRD_PARTY_NOTICES.md" \
    "${LICENSE_SOURCE}" \
    "${COMMERCIAL_LICENSE_SOURCE}" \
    "${SUPPORT_SOURCE}" \
    "${SECURITY_SOURCE}"; do
    [[ -r "${required_source}" ]] || die "Required release documentation is missing: ${required_source}"
  done
  run_cmd mkdir -p "${docs_dir}"
  run_cmd cp "${RELEASE_DOCS_SOURCE_DIR}/GETTING_STARTED.md" "${docs_dir}/GETTING_STARTED.md"
  run_cmd cp "${RELEASE_DOCS_SOURCE_DIR}/THIRD_PARTY_NOTICES.md" "${docs_dir}/THIRD_PARTY_NOTICES.md"
  run_cmd cp "${LICENSE_SOURCE}" "${docs_dir}/LICENSE.md"
  run_cmd cp "${COMMERCIAL_LICENSE_SOURCE}" "${docs_dir}/COMMERCIAL-LICENSE.md"
  run_cmd cp "${SUPPORT_SOURCE}" "${docs_dir}/SUPPORT.md"
  run_cmd cp "${SECURITY_SOURCE}" "${docs_dir}/SECURITY.md"
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    printf '+ write %q/RELEASE_NOTES.md and third-party dependency inventories\n' "${docs_dir}"
    return 0
  fi
  write_release_notes "${docs_dir}"
  {
    printf '# Java libraries packaged in backend/autark-os-backend.jar\n\n'
    unzip -Z1 "${jar}" 2>/dev/null | awk -F/ '/^BOOT-INF\/lib\/[^/]+$/ {print $3}' | sort -u
  } >"${docs_dir}/THIRD_PARTY_COMPONENTS.txt"
  if [[ -r "${REPO_ROOT}/frontend/yarn.lock" ]]; then
    cp "${REPO_ROOT}/frontend/yarn.lock" "${docs_dir}/THIRD_PARTY_FRONTEND_LOCK.txt"
  else
    printf '# Frontend dependency lockfile was not available in this source checkout.\n' >"${docs_dir}/THIRD_PARTY_FRONTEND_LOCK.txt"
  fi
}

create_bundle() {
  local jar
  jar="$(find_backend_jar)"
  if [[ "${DRY_RUN}" -eq 0 ]]; then
    [[ -n "${jar}" && -r "${jar}" ]] || die "No backend boot jar found. Run without --skip-build or build with './backend/gradlew -p backend bootJar'."
  fi
  [[ "${DRY_RUN}" -eq 1 ]] || verify_backend_jar_identity "${jar}"

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
  copy_release_docs "${jar}"
  run_cmd chmod +x \
    "${OUTPUT_DIR}/scripts/bootstrap-autark-os.sh" \
    "${OUTPUT_DIR}/scripts/install-autark-os-service.sh" \
    "${OUTPUT_DIR}/scripts/install-autark-os.sh" \
    "${OUTPUT_DIR}/scripts/autark-os-gui-installer.sh" \
    "${OUTPUT_DIR}/scripts/autark-os" \
    "${OUTPUT_DIR}/scripts/autark-os-fileops"
  write_metadata

  if [[ "${DRY_RUN}" -eq 1 ]]; then
    printf '+ cd %q && find backend runtime scripts docs \\( -type f -o -type l \\) -print0 | sort -z | xargs -0 sha256sum; sha256sum autark-os-release.env autark-os-release.json autark-os-provenance.json > SHA256SUMS\n' "${OUTPUT_DIR}"
  else
    (
      cd "${OUTPUT_DIR}"
      {
        find backend runtime scripts docs \( -type f -o -type l \) -print0 | sort -z | xargs -0 sha256sum
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
