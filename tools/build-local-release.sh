#!/usr/bin/env bash
set -Eeuo pipefail

# Produces the same installable artifact types as the GitHub release job without
# emulation or target-device build work. The application is built once on this
# host; architecture-specific packaging differs only in its bundled runtime and
# Cosign binary.

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly TEMURIN_VERSION="21.0.9_10"
readonly TEMURIN_TAG="jdk-21.0.9%2B10"

VERSION=""
CHANNEL="beta"
ALLOW_DIRTY=0

usage() {
  cat <<'USAGE'
Usage: tools/build-local-release.sh --version VERSION [options]

Build ready-to-install local AMD64 and ARM64 Autark-OS release artifacts.

Options:
  --version VERSION  Required release version, without a leading v.
  --channel CHANNEL  beta or stable. Default: beta.
  --allow-dirty      Package intentional uncommitted work. Default: refuse it.
  -h, --help         Show this help.

Output:
  build/releases/VERSION/amd64/
  build/releases/VERSION/arm64/

The command runs the native frontend and backend checks once, then validates
the completed installer artifacts. It creates no containers and never connects
to a target device or system service.
USAGE
}

log() {
  printf '[autark-os local-release] %s\n' "$*"
}

die() {
  printf '[autark-os local-release] error: %s\n' "$*" >&2
  exit 1
}

require_tool() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is required."
}

verify_checksum() {
  local expected="$1"
  local path="$2"
  printf '%s  %s\n' "${expected}" "${path}" | sha256sum --check --status
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      shift
      [[ $# -gt 0 ]] || die "--version requires a value."
      VERSION="$1"
      ;;
    --version=*) VERSION="${1#*=}" ;;
    --channel)
      shift
      [[ $# -gt 0 ]] || die "--channel requires a value."
      CHANNEL="$1"
      ;;
    --channel=*) CHANNEL="${1#*=}" ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
  shift
done

[[ "${VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]] ||
  die "Use a release version such as 0.9.1-beta.24."
[[ "${CHANNEL}" == "beta" || "${CHANNEL}" == "stable" ]] ||
  die "--channel must be beta or stable."
[[ "${CHANNEL}" != "stable" || "${VERSION}" != *-* ]] ||
  die "Stable releases cannot use a prerelease version."
[[ "${CHANNEL}" != "beta" || "${VERSION}" == *-* ]] ||
  die "Beta releases require a prerelease version such as 0.9.1-beta.24."

for tool in curl dpkg-deb file java jlink python3 sha256sum tar unzip yarn; do
  require_tool "${tool}"
done
[[ "$(dpkg --print-architecture)" == "amd64" ]] ||
  die "This local dual-architecture builder runs on an AMD64 workstation."
[[ "$(jlink --version)" == 21.* ]] ||
  die "Java 21 (including jlink) is required."

if [[ "${ALLOW_DIRTY}" -eq 0 ]] && [[ -n "$(git -C "${REPO_ROOT}" status --porcelain)" ]]; then
  die "The worktree has uncommitted changes. Commit them for a GitHub-like candidate or pass --allow-dirty intentionally."
fi

BUILD_SHA="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
OUTPUT_ROOT="${REPO_ROOT}/build/releases/${VERSION}"
CACHE_ROOT="${AUTARK_OS_RELEASE_CACHE_DIR:-${REPO_ROOT}/build/cache}"

[[ ! -e "${OUTPUT_ROOT}" ]] ||
  die "Output already exists: ${OUTPUT_ROOT}. Choose a new version or remove that version directory deliberately."

runtime_url() {
  printf 'https://github.com/adoptium/temurin21-binaries/releases/download/%s/OpenJDK21U-jre_aarch64_linux_hotspot_%s.tar.gz\n' \
    "${TEMURIN_TAG}" "${TEMURIN_VERSION}"
}

prepare_arm64_runtime() {
  local archive_name="OpenJDK21U-jre_aarch64_linux_hotspot_${TEMURIN_VERSION}.tar.gz"
  local archive="${CACHE_ROOT}/${archive_name}"
  local runtime="${CACHE_ROOT}/temurin-jre-${TEMURIN_VERSION}-arm64"
  local expected_sha="1d041073c65e834bdb4da732485a54ff829859dcd1549e7992f15bd73341be29"

  mkdir -p "${CACHE_ROOT}"
  if [[ ! -r "${archive}" ]] || ! verify_checksum "${expected_sha}" "${archive}"; then
    log "Downloading the pinned Temurin ARM64 runtime." >&2
    local download
    download="$(mktemp "${CACHE_ROOT}/.runtime-download.XXXXXX")"
    if ! curl --fail --location --silent --show-error "$(runtime_url)" --output "${download}"; then
      rm -f "${download}"
      die "Could not download the pinned Temurin ARM64 runtime."
    fi
    if ! verify_checksum "${expected_sha}" "${download}"; then
      rm -f "${download}"
      die "Downloaded Temurin ARM64 runtime checksum verification failed."
    fi
    mv "${download}" "${archive}"
  fi

  if [[ ! -x "${runtime}/bin/java" ]]; then
    log "Preparing the cached Temurin ARM64 runtime." >&2
    local extraction
    extraction="$(mktemp -d "${CACHE_ROOT}/.runtime-extract.XXXXXX")"
    trap 'rm -rf "${extraction}"' RETURN
    tar -xzf "${archive}" --strip-components=1 -C "${extraction}"
    test -x "${extraction}/bin/java" || die "Temurin ARM64 archive did not contain bin/java."
    mv "${extraction}" "${runtime}"
    trap - RETURN
  fi

  printf '%s\n' "${runtime}"
}

run_validation() {
  log "Installing and validating frontend dependencies."
  (
    cd "${REPO_ROOT}/frontend"
    yarn install --frozen-lockfile
    yarn typecheck
    yarn lint
    yarn test
    yarn check:ui-tokens
  )

  log "Testing and building the application once on this host."
  (
    cd "${REPO_ROOT}/backend"
    AUTARK_OS_BUILD_VERSION="${VERSION}" \
      AUTARK_OS_BUILD_SHA="${BUILD_SHA}" \
      AUTARK_OS_BUILD_DATE="${BUILD_DATE}" \
      AUTARK_OS_PRIVATE_SOURCEMAPS=1 \
      ./gradlew clean test bootJar --console=plain
  )

}

build_artifacts() {
  local architecture="$1"
  local runtime_dir="${2:-}"
  local output_dir="${OUTPUT_ROOT}/${architecture}"
  local notes_url="https://github.com/autark-labs/autark-os/releases/tag/v${VERSION}"

  log "Packaging ${architecture} release artifacts."
  if [[ -n "${runtime_dir}" ]]; then
    AUTARK_OS_RUNTIME_DIR="${runtime_dir}" \
      AUTARK_OS_BUILD_SHA="${BUILD_SHA}" \
      AUTARK_OS_BUILD_DATE="${BUILD_DATE}" \
      "${REPO_ROOT}/scripts/build-release-artifacts.sh" \
        --skip-build \
        --version "${VERSION}" \
        --channel "${CHANNEL}" \
        --architecture "${architecture}" \
        --release-notes-url "${notes_url}" \
        --output-dir "${output_dir}"
  else
    AUTARK_OS_BUILD_SHA="${BUILD_SHA}" \
      AUTARK_OS_BUILD_DATE="${BUILD_DATE}" \
      "${REPO_ROOT}/scripts/build-release-artifacts.sh" \
        --skip-build \
        --version "${VERSION}" \
        --channel "${CHANNEL}" \
        --architecture "${architecture}" \
        --release-notes-url "${notes_url}" \
        --output-dir "${output_dir}"
  fi

  (
    cd "${output_dir}"
    sha256sum -c SHA256SUMS --ignore-missing >/dev/null
  )
  test -f "${output_dir}/autark-os_${VERSION}_${architecture}.deb"
  test -f "${output_dir}/autark-os-${VERSION}-${architecture}.tar.gz"
  test -f "${output_dir}/Autark-OS-Installer-${VERSION}-${architecture}.run"
  test -f "${output_dir}/autark-os-artifacts.json"
  test -d "${output_dir}/autark-os-${VERSION}-${architecture}"
  [[ "$(dpkg-deb -f "${output_dir}/autark-os_${VERSION}_${architecture}.deb" Architecture)" == "${architecture}" ]]
  tar -tzf "${output_dir}/autark-os-${VERSION}-${architecture}.tar.gz" >/dev/null
  python3 - "${output_dir}/autark-os-artifacts.json" "${VERSION}" "${architecture}" <<'PY'
import json
import sys

manifest = json.load(open(sys.argv[1], encoding="utf-8"))
version, architecture = sys.argv[2:]
assert manifest["version"] == version
assert manifest["artifactArchitecture"] == architecture
assert manifest["runtimeArchitecture"] == architecture
assert manifest["bundleDirectory"] == f"autark-os-{version}-{architecture}"
assert {item["type"] for item in manifest["artifacts"]} == {
    "tarball", "debian-package", "guided-run-installer"
}
PY

  local java_description
  java_description="$(file -Lb "${output_dir}/autark-os-${VERSION}-${architecture}/runtime/bin/java")"
  case "${architecture}" in
    amd64) [[ "${java_description}" == *x86-64* || "${java_description}" == *x86_64* ]] ;;
    arm64) [[ "${java_description}" == *aarch64* || "${java_description}" == *AArch64* || "${java_description}" == *ARM64* ]] ;;
  esac
}

main() {
  run_validation
  build_artifacts amd64
  build_artifacts arm64 "$(prepare_arm64_runtime)"
  log "Local release artifacts are ready: ${OUTPUT_ROOT}"
}

main
