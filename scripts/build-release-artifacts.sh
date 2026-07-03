#!/usr/bin/env bash
set -Eeuo pipefail

VERSION="${AUTARK_OS_VERSION:-0.0.1-SNAPSHOT}"
CHANNEL="${AUTARK_OS_UPDATE_CHANNEL:-beta}"
RELEASE_NOTES_URL="${AUTARK_OS_RELEASE_NOTES_URL:-}"
SUPPORTED_ARCHITECTURES="${AUTARK_OS_SUPPORTED_ARCHITECTURES:-x86_64,aarch64,arm64}"
ARCHITECTURE="${AUTARK_OS_PACKAGE_ARCHITECTURE:-}"
OUTPUT_DIR=""
SKIP_BUILD=0
DRY_RUN=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
  cat <<USAGE
Usage: $0 [options]

Build GitHub-hostable Autark-OS release artifacts from the canonical release
bundle: .tar.gz, .deb, and self-extracting .run installer.

Options:
  --output-dir DIR  Directory where artifacts should be created. Default: release/artifacts-VERSION.
  --version VALUE   Release version metadata. Default: ${VERSION}.
  --channel VALUE   Release channel metadata. Default: ${CHANNEL}.
  --architecture VALUE Debian/package architecture. Default: host architecture.
  --release-notes-url URL Release notes URL metadata.
  --supported-architectures LIST Comma-separated supported runtime architectures.
  --skip-build      Use the existing backend boot jar.
  --dry-run         Print actions without creating files.
  -h, --help        Show this help.

Artifacts:
  autark-os-VERSION.tar.gz
  autark-os_VERSION_ARCH.deb
  Autark-OS-Installer-VERSION-ARCH.run
  autark-os-artifacts.json
  SHA256SUMS
USAGE
}

log() {
  printf '[autark-os artifacts] %s\n' "$*"
}

die() {
  printf '[autark-os artifacts] error: %s\n' "$*" >&2
  exit 1
}

has_command() {
  command -v "$1" >/dev/null 2>&1
}

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

json_string() {
  printf '"%s"' "$(json_escape "$1")"
}

require_tool() {
  local tool="$1"
  has_command "${tool}" || die "${tool} is required to build release artifacts."
}

default_architecture() {
  if has_command dpkg; then
    dpkg --print-architecture
    return 0
  fi
  case "$(uname -m)" in
    x86_64|amd64) printf 'amd64\n' ;;
    aarch64|arm64) printf 'arm64\n' ;;
    armv7l|armhf) printf 'armhf\n' ;;
    *) uname -m ;;
  esac
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
        ARCHITECTURE="$1"
        ;;
      --architecture=*)
        ARCHITECTURE="${1#*=}"
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

  [[ -n "${ARCHITECTURE}" ]] || ARCHITECTURE="$(default_architecture)"
  [[ -n "${OUTPUT_DIR}" ]] || OUTPUT_DIR="${REPO_ROOT}/release/artifacts-${VERSION}"
  if [[ "${OUTPUT_DIR}" != /* ]]; then
    OUTPUT_DIR="${REPO_ROOT}/${OUTPUT_DIR}"
  fi
}

artifact_names() {
  BUNDLE_NAME="autark-os-${VERSION}"
  BUNDLE_DIR="${OUTPUT_DIR}/${BUNDLE_NAME}"
  TARBALL="${OUTPUT_DIR}/${BUNDLE_NAME}.tar.gz"
  DEB="${OUTPUT_DIR}/autark-os_${VERSION}_${ARCHITECTURE}.deb"
  RUN_INSTALLER="${OUTPUT_DIR}/Autark-OS-Installer-${VERSION}-${ARCHITECTURE}.run"
  ARTIFACT_MANIFEST="${OUTPUT_DIR}/autark-os-artifacts.json"
  CHECKSUMS="${OUTPUT_DIR}/SHA256SUMS"
}

print_dry_run() {
  cat <<DRYRUN
[autark-os artifacts] Would build release artifacts.
+ ${SCRIPT_DIR}/build-release-bundle.sh --version ${VERSION} --channel ${CHANNEL} --release-notes-url ${RELEASE_NOTES_URL} --supported-architectures ${SUPPORTED_ARCHITECTURES} --output-dir ${BUNDLE_DIR}$([[ "${SKIP_BUILD}" -eq 1 ]] && printf ' --skip-build')
+ tar -czf ${TARBALL} -C ${OUTPUT_DIR} ${BUNDLE_NAME}
+ dpkg-deb --root-owner-group --build <deb-root> ${DEB}
+ create self-extracting installer ${RUN_INSTALLER}
+ write ${ARTIFACT_MANIFEST}
+ write ${CHECKSUMS}
DRYRUN
}

prepare_output_dir() {
  [[ "${OUTPUT_DIR}" != "/" ]] || die "--output-dir cannot be /."
  rm -rf "${OUTPUT_DIR}"
  mkdir -p "${OUTPUT_DIR}"
}

build_bundle() {
  local args=(
    --version "${VERSION}"
    --channel "${CHANNEL}"
    --release-notes-url "${RELEASE_NOTES_URL}"
    --supported-architectures "${SUPPORTED_ARCHITECTURES}"
    --output-dir "${BUNDLE_DIR}"
  )
  [[ "${SKIP_BUILD}" -eq 1 ]] && args+=(--skip-build)
  "${SCRIPT_DIR}/build-release-bundle.sh" "${args[@]}"
}

package_tarball() {
  log "Creating tarball ${TARBALL}."
  tar -czf "${TARBALL}" -C "${OUTPUT_DIR}" "${BUNDLE_NAME}"
}

build_sha() {
  awk -F= '$1 == "AUTARK_OS_BUILD_SHA" {print $2; exit}' "${BUNDLE_DIR}/autark-os-release.env" 2>/dev/null || true
}

build_date() {
  awk -F= '$1 == "AUTARK_OS_BUILD_DATE" {print $2; exit}' "${BUNDLE_DIR}/autark-os-release.env" 2>/dev/null || true
}

installed_size_kb() {
  du -sk "$1" | awk '{print $1}'
}

write_deb_control() {
  local deb_root="$1"
  local size_kb="$2"
  cat >"${deb_root}/DEBIAN/control" <<CONTROL
Package: autark-os
Version: ${VERSION}
Section: admin
Priority: optional
Architecture: ${ARCHITECTURE}
Maintainer: Autark Labs <support@autarklabs.local>
Depends: bash, sudo, systemd, curl, ca-certificates, openjdk-21-jre-headless | java-runtime
Installed-Size: ${size_kb}
Homepage: https://github.com/autark-labs/autark-os
Description: Calm local control center for self-hosted apps
 Autark-OS installs and manages supported self-hosted apps with Docker
 Compose, private access, backups, restore, and guided recovery.
CONTROL
}

write_deb_scripts() {
  local deb_root="$1"
  cat >"${deb_root}/DEBIAN/postinst" <<POSTINST
#!/usr/bin/env bash
set -euo pipefail

if [[ "\${1:-configure}" == "configure" ]]; then
  AUTARK_OS_BACKEND_JAR=/usr/lib/autark-os/release/backend/autark-os-backend.jar \\
  AUTARK_OS_VERSION=${VERSION} \\
  AUTARK_OS_BUILD_SHA=$(build_sha) \\
  AUTARK_OS_BUILD_DATE=$(build_date) \\
    /usr/lib/autark-os/release/scripts/install-autark-os-service.sh
fi
POSTINST
  cat >"${deb_root}/DEBIAN/prerm" <<'PRERM'
#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "remove" || "${1:-}" == "deconfigure" ]]; then
  if command -v systemctl >/dev/null 2>&1; then
    systemctl stop autark-os.service >/dev/null 2>&1 || true
  fi
fi
PRERM
  chmod 0755 "${deb_root}/DEBIAN/postinst" "${deb_root}/DEBIAN/prerm"
}

package_deb() {
  require_tool dpkg-deb
  local work_dir deb_root payload_dir size_kb
  work_dir="$(mktemp -d)"
  trap 'rm -rf "${work_dir}"' RETURN
  deb_root="${work_dir}/deb-root"
  payload_dir="${deb_root}/usr/lib/autark-os/release"
  mkdir -p "${payload_dir}" "${deb_root}/DEBIAN"
  cp -a "${BUNDLE_DIR}/." "${payload_dir}/"
  chmod +x "${payload_dir}/scripts/"*.sh "${payload_dir}/scripts/autark-os" "${payload_dir}/scripts/autark-os-fileops"
  size_kb="$(installed_size_kb "${deb_root}/usr")"
  write_deb_control "${deb_root}" "${size_kb}"
  write_deb_scripts "${deb_root}"
  log "Creating Debian package ${DEB}."
  dpkg-deb --root-owner-group --build "${deb_root}" "${DEB}" >/dev/null
  rm -rf "${work_dir}"
  trap - RETURN
}

write_run_header() {
  cat >"${RUN_INSTALLER}" <<'RUNHEADER'
#!/usr/bin/env bash
set -Eeuo pipefail

AUTARK_OS_INSTALLER_VERSION="__AUTARK_OS_VERSION__"
AUTARK_OS_INSTALLER_ARCHITECTURE="__AUTARK_OS_ARCHITECTURE__"
PAYLOAD_MARKER="__AUTARK_OS_PAYLOAD_BELOW__"

usage() {
  cat <<USAGE
Autark-OS Installer ${AUTARK_OS_INSTALLER_VERSION}

Usage: $0 [options]

Options:
  --extract-only DIR  Extract the bundled release into DIR and exit.
  --dry-run           Preview install actions without changing this host.
  --yes               Confirm guided prompts where supported.
  --runtime-dir DIR   Store Autark-OS runtime data in DIR.
  --port PORT         Run Autark-OS on PORT.
  -h, --help          Show this help.

Run without options to start the guided Autark-OS installer. When launched
from a Linux desktop with zenity and a terminal available, this installer asks
for confirmation graphically and opens a terminal for progress.
USAGE
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

payload_line() {
  awk "/^${PAYLOAD_MARKER}\$/ {print NR + 1; exit 0}" "$0"
}

extract_payload() {
  local target_dir="$1"
  mkdir -p "${target_dir}"
  tail -n +"$(payload_line)" "$0" | tar -xzf - -C "${target_dir}" --strip-components=1
}

launch_terminal_for_desktop() {
  [[ "$#" -eq 0 ]] || return 1
  [[ "${AUTARK_OS_FORCE_TERMINAL:-0}" != "1" ]] || return 1
  [[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]] || return 1
  command_exists zenity || return 1

  if ! zenity --question \
    --title="Autark-OS Installer" \
    --text="Install Autark-OS on this device?\n\nA terminal will open to show progress and ask for administrator approval when needed."; then
    exit 0
  fi

  local self command
  self="$(readlink -f "$0" 2>/dev/null || printf '%s' "$0")"
  command="AUTARK_OS_FORCE_TERMINAL=1 $(printf '%q' "${self}"); printf '\\nAutark-OS installer finished. Press Enter to close. '; read -r _"

  if command_exists x-terminal-emulator; then
    x-terminal-emulator -e bash -lc "${command}" &
    exit 0
  fi
  if command_exists gnome-terminal; then
    gnome-terminal -- bash -lc "${command}" &
    exit 0
  fi
  if command_exists xterm; then
    xterm -e bash -lc "${command}" &
    exit 0
  fi

  zenity --info --title="Autark-OS Installer" --text="No desktop terminal was found. The installer will continue in this shell."
  return 1
}

main() {
  launch_terminal_for_desktop "$@" || true

  local extract_only=""
  local install_args=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --extract-only)
        shift
        [[ $# -gt 0 ]] || { printf 'Autark-OS Installer error: --extract-only requires a directory.\n' >&2; exit 1; }
        extract_only="$1"
        ;;
      --extract-only=*)
        extract_only="${1#*=}"
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        install_args+=("$1")
        ;;
    esac
    shift
  done

  if [[ -n "${extract_only}" ]]; then
    extract_payload "${extract_only}"
    printf 'Extracted Autark-OS installer payload to %s\n' "${extract_only}"
    exit 0
  fi

  local temp_dir
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "${temp_dir}"' EXIT
  extract_payload "${temp_dir}"

  printf 'Autark-OS Installer %s\n' "${AUTARK_OS_INSTALLER_VERSION}"
  printf 'This installer will check this device, install Autark-OS, and start the service.\n'
  "${temp_dir}/scripts/autark-os" install --release-bundle "${temp_dir}" --guided "${install_args[@]}"
}

main "$@"
exit 0
__AUTARK_OS_PAYLOAD_BELOW__
RUNHEADER
  sed -i \
    -e "s/__AUTARK_OS_VERSION__/${VERSION}/g" \
    -e "s/__AUTARK_OS_ARCHITECTURE__/${ARCHITECTURE}/g" \
    "${RUN_INSTALLER}"
}

package_run_installer() {
  log "Creating self-extracting installer ${RUN_INSTALLER}."
  write_run_header
  cat "${TARBALL}" >>"${RUN_INSTALLER}"
  chmod 0755 "${RUN_INSTALLER}"
}

sha256_for() {
  sha256sum "$1" | awk '{print $1}'
}

write_artifact_manifest() {
  local tar_name deb_name run_name
  tar_name="$(basename "${TARBALL}")"
  deb_name="$(basename "${DEB}")"
  run_name="$(basename "${RUN_INSTALLER}")"
  cat >"${ARTIFACT_MANIFEST}" <<JSON
{
  "schemaVersion": 1,
  "name": "autark-os",
  "version": "$(json_escape "${VERSION}")",
  "channel": "$(json_escape "${CHANNEL}")",
  "architecture": "$(json_escape "${ARCHITECTURE}")",
  "releaseNotesUrl": "$(json_escape "${RELEASE_NOTES_URL}")",
  "bundleDirectory": "$(json_escape "${BUNDLE_NAME}")",
  "artifacts": [
    {
      "type": "tarball",
      "fileName": "$(json_escape "${tar_name}")",
      "sha256": "$(sha256_for "${TARBALL}")",
      "installHint": "tar -xzf ${tar_name} && cd ${BUNDLE_NAME} && ./scripts/autark-os install"
    },
    {
      "type": "debian-package",
      "fileName": "$(json_escape "${deb_name}")",
      "sha256": "$(sha256_for "${DEB}")",
      "installHint": "sudo apt install ./${deb_name}"
    },
    {
      "type": "guided-run-installer",
      "fileName": "$(json_escape "${run_name}")",
      "sha256": "$(sha256_for "${RUN_INSTALLER}")",
      "installHint": "chmod +x ${run_name} && ./${run_name}"
    }
  ]
}
JSON
}

write_checksums() {
  log "Writing ${CHECKSUMS}."
  (
    cd "${OUTPUT_DIR}"
    sha256sum \
      "$(basename "${TARBALL}")" \
      "$(basename "${DEB}")" \
      "$(basename "${RUN_INSTALLER}")" \
      "$(basename "${ARTIFACT_MANIFEST}")" \
      >"$(basename "${CHECKSUMS}")"
  )
}

print_next_steps() {
  cat <<NEXT

Release artifacts ready:
  ${OUTPUT_DIR}

Upload these files to GitHub Releases:
  $(basename "${TARBALL}")
  $(basename "${DEB}")
  $(basename "${RUN_INSTALLER}")
  $(basename "${ARTIFACT_MANIFEST}")
  $(basename "${CHECKSUMS}")

NEXT
}

main() {
  parse_args "$@"
  artifact_names
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    print_dry_run
    exit 0
  fi

  require_tool tar
  require_tool sha256sum
  prepare_output_dir
  build_bundle
  package_tarball
  package_deb
  package_run_installer
  write_artifact_manifest
  write_checksums
  print_next_steps
}

main "$@"
