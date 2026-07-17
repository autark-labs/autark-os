#!/usr/bin/env bash
set -Eeuo pipefail

VERSION="${AUTARK_OS_VERSION:-0.0.1-SNAPSHOT}"
CHANNEL="${AUTARK_OS_UPDATE_CHANNEL:-beta}"
RELEASE_NOTES_URL="${AUTARK_OS_RELEASE_NOTES_URL:-}"
ARCHITECTURE="${AUTARK_OS_PACKAGE_ARCHITECTURE:-}"
OUTPUT_DIR=""
SKIP_BUILD=0
DRY_RUN=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
HOST_MATRIX_FILE="${SCRIPT_DIR}/supported-host-matrix.env"
[[ -r "${HOST_MATRIX_FILE}" ]] || { printf '[autark-os artifacts] error: supported host policy is missing: %s\n' "${HOST_MATRIX_FILE}" >&2; exit 1; }
# shellcheck source=supported-host-matrix.env
source "${HOST_MATRIX_FILE}"

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

normalize_architecture() {
  case "$1" in
    x86_64|amd64) printf 'amd64\n' ;;
    aarch64|arm64) printf 'arm64\n' ;;
    *) return 1 ;;
  esac
}

validate_build_architecture() {
  local host_architecture
  ARCHITECTURE="$(normalize_architecture "${ARCHITECTURE}")" || die "--architecture must be amd64 or arm64: ${ARCHITECTURE}"
  host_architecture="$(normalize_architecture "$(default_architecture)")" || die "Unsupported build host architecture: $(default_architecture)"
  [[ "${ARCHITECTURE}" == "${host_architecture}" ]] || die "Cannot build ${ARCHITECTURE} release artifacts on ${host_architecture}. Use a native ${ARCHITECTURE} builder."
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

  [[ -n "${ARCHITECTURE}" ]] || ARCHITECTURE="$(default_architecture)"
  validate_build_architecture
  [[ -n "${OUTPUT_DIR}" ]] || OUTPUT_DIR="${REPO_ROOT}/release/artifacts-${VERSION}"
  if [[ "${OUTPUT_DIR}" != /* ]]; then
    OUTPUT_DIR="${REPO_ROOT}/${OUTPUT_DIR}"
  fi
}

artifact_names() {
  BUNDLE_NAME="autark-os-${VERSION}-${ARCHITECTURE}"
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
+ ${SCRIPT_DIR}/build-release-bundle.sh --version ${VERSION} --channel ${CHANNEL} --architecture ${ARCHITECTURE} --release-notes-url ${RELEASE_NOTES_URL} --output-dir ${BUNDLE_DIR}$([[ "${SKIP_BUILD}" -eq 1 ]] && printf ' --skip-build')
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
    --architecture "${ARCHITECTURE}"
    --release-notes-url "${RELEASE_NOTES_URL}"
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
Depends: bash, sudo, systemd, curl, ca-certificates
Installed-Size: ${size_kb}
Homepage: https://github.com/autark-labs/autark-os
Description: Calm local control center for self-hosted apps
 Autark-OS installs and manages supported self-hosted apps with Docker
 Compose, private access, backups, restore, and guided recovery.
CONTROL
}

write_deb_scripts() {
  local deb_root="$1"
  cat >"${deb_root}/DEBIAN/preinst" <<'PREINST'
#!/usr/bin/env bash
set -euo pipefail
expected_architecture="__AUTARK_OS_ARTIFACT_ARCHITECTURE__"
supported_debian_versions="__AUTARK_OS_SUPPORTED_DEBIAN_VERSIONS__"
supported_ubuntu_versions="__AUTARK_OS_SUPPORTED_UBUNTU_VERSIONS__"
supported_raspbian_versions="__AUTARK_OS_SUPPORTED_RASPBIAN_VERSIONS__"
supported_debian_architectures="__AUTARK_OS_SUPPORTED_DEBIAN_ARCHITECTURES__"
supported_ubuntu_architectures="__AUTARK_OS_SUPPORTED_UBUNTU_ARCHITECTURES__"
supported_raspbian_architectures="__AUTARK_OS_SUPPORTED_RASPBIAN_ARCHITECTURES__"
. /etc/os-release
normalize_architecture() {
  case "$1" in
    x86_64|amd64) printf 'amd64\n' ;;
    aarch64|arm64) printf 'arm64\n' ;;
    *) printf '%s\n' "$1" ;;
  esac
}
if command -v dpkg >/dev/null 2>&1; then
  arch="$(normalize_architecture "$(dpkg --print-architecture)")"
else
  arch="$(normalize_architecture "$(uname -m)")"
fi
contains() { [[ " $1 " == *" $2 "* ]]; }
case "${ID}" in
  debian) versions="${supported_debian_versions}"; architectures="${supported_debian_architectures}" ;;
  ubuntu) versions="${supported_ubuntu_versions}"; architectures="${supported_ubuntu_architectures}" ;;
  raspbian) versions="${supported_raspbian_versions}"; architectures="${supported_raspbian_architectures}" ;;
  *) echo "Autark-OS: unsupported Linux distribution." >&2; exit 1 ;;
esac
[[ "${arch}" == "${expected_architecture}" ]] || { echo "Autark-OS: this package is ${expected_architecture}, but this host is ${arch}." >&2; exit 1; }
contains "${versions}" "${VERSION_ID}" && contains "${architectures}" "${arch}" || { echo "Autark-OS: unsupported OS version or architecture. See https://github.com/autark-labs/autark-os/blob/main/docs/technical-installation.md" >&2; exit 1; }
command -v systemctl >/dev/null || { echo "Autark-OS: systemd is required." >&2; exit 1; }
if [[ "${1:-}" == "upgrade" ]] && [[ -d /etc/autark-os || -f /etc/systemd/system/autark-os.service ]]; then
  public_metadata=/opt/autark-os/release-metadata/install.env
  metadata_value() {
    local key="$1"
    [[ -r "${public_metadata}" ]] || return 0
    awk -F= -v key="${key}" '$1 == key {print $2; exit}' "${public_metadata}"
  }
  install_dir="$(metadata_value AUTARK_OS_INSTALL_DIR)"
  runtime_dir="$(metadata_value AUTARK_OS_RUNTIME_ROOT)"
  config_dir="$(metadata_value AUTARK_OS_CONFIG_DIR)"
  [[ -n "${install_dir}" ]] || install_dir=/opt/autark-os
  [[ -n "${runtime_dir}" ]] || runtime_dir=/var/lib/autark-os
  [[ -n "${config_dir}" ]] || config_dir=/etc/autark-os
  env_file="${config_dir}/autark-os.env"
  if [[ -r "${env_file}" ]]; then
    configured_runtime="$(awk -F= '$1 == "AUTARK_OS_RUNTIME_ROOT" {print $2; exit}' "${env_file}")"
    configured_install="$(awk -F= '$1 == "AUTARK_OS_INSTALL_DIR" {print $2; exit}' "${env_file}")"
    [[ -n "${configured_runtime}" ]] && runtime_dir="${configured_runtime}"
    [[ -n "${configured_install}" ]] && install_dir="${configured_install}"
  fi
  checkpoint_dir="${runtime_dir}/backups/package-upgrades"
  mkdir -p "${checkpoint_dir}"
  checkpoint="${checkpoint_dir}/pre-upgrade-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
  checkpoint_paths=()
  for path in "${install_dir}" "${config_dir}" /etc/systemd/system/autark-os.service /etc/sudoers.d/autark-os-fileops "${runtime_dir}/autark-os.db" "${runtime_dir}/autark-os.db-shm" "${runtime_dir}/autark-os.db-wal"; do
    [[ -e "${path}" || -L "${path}" ]] && checkpoint_paths+=("${path}")
  done
  service_was_active=0
  if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet autark-os.service; then
    service_was_active=1
    systemctl stop autark-os.service >/dev/null 2>&1 || true
  fi
  if ! tar -czf "${checkpoint}" "${checkpoint_paths[@]}"; then
    [[ "${service_was_active}" -eq 0 ]] || systemctl start autark-os.service >/dev/null 2>&1 || true
    exit 1
  fi
  printf '%s\n' "${checkpoint}" >"${checkpoint_dir}/latest"
  printf '%s\n' "${checkpoint}" >/run/autark-os-package-upgrade-checkpoint
  echo "Autark-OS: saved package configuration checkpoint at ${checkpoint}." >&2
fi
PREINST
  sed -i \
    -e "s/__AUTARK_OS_ARTIFACT_ARCHITECTURE__/${ARCHITECTURE}/g" \
    -e "s/__AUTARK_OS_SUPPORTED_DEBIAN_VERSIONS__/${AUTARK_OS_SUPPORTED_DEBIAN_VERSIONS}/g" \
    -e "s/__AUTARK_OS_SUPPORTED_UBUNTU_VERSIONS__/${AUTARK_OS_SUPPORTED_UBUNTU_VERSIONS}/g" \
    -e "s/__AUTARK_OS_SUPPORTED_RASPBIAN_VERSIONS__/${AUTARK_OS_SUPPORTED_RASPBIAN_VERSIONS}/g" \
    -e "s/__AUTARK_OS_SUPPORTED_DEBIAN_ARCHITECTURES__/${AUTARK_OS_SUPPORTED_DEBIAN_ARCHITECTURES}/g" \
    -e "s/__AUTARK_OS_SUPPORTED_UBUNTU_ARCHITECTURES__/${AUTARK_OS_SUPPORTED_UBUNTU_ARCHITECTURES}/g" \
    -e "s/__AUTARK_OS_SUPPORTED_RASPBIAN_ARCHITECTURES__/${AUTARK_OS_SUPPORTED_RASPBIAN_ARCHITECTURES}/g" \
    "${deb_root}/DEBIAN/preinst"
  cat >"${deb_root}/DEBIAN/postinst" <<POSTINST
#!/usr/bin/env bash
set -euo pipefail

if [[ "\${1:-configure}" == "configure" ]]; then
  public_metadata=/opt/autark-os/release-metadata/install.env
  public_value() {
    local key="\$1"
    [[ -r "\${public_metadata}" ]] || return 0
    awk -F= -v key="\${key}" '\$1 == key {print \$2; exit}' "\${public_metadata}"
  }
  config_dir="\$(public_value AUTARK_OS_CONFIG_DIR)"
  [[ -n "\${config_dir}" ]] || config_dir=/etc/autark-os
  env_file="\${config_dir}/autark-os.env"
  existing_value() {
    local key="\$1"
    [[ -r "\${env_file}" ]] || return 0
    awk -F= -v key="\${key}" '\$1 == key {print \$2; exit}' "\${env_file}"
  }
  runtime_dir="\$(existing_value AUTARK_OS_RUNTIME_ROOT)"
  install_dir="\$(existing_value AUTARK_OS_INSTALL_DIR)"
  configured_config_dir="\$(existing_value AUTARK_OS_CONFIG_DIR)"
  log_dir="\$(existing_value AUTARK_OS_LOG_DIR)"
  server_port="\$(existing_value SERVER_PORT)"
  [[ -n "\${runtime_dir}" ]] || runtime_dir="\$(public_value AUTARK_OS_RUNTIME_ROOT)"
  [[ -n "\${install_dir}" ]] || install_dir="\$(public_value AUTARK_OS_INSTALL_DIR)"
  [[ -n "\${configured_config_dir}" ]] || configured_config_dir="\$(public_value AUTARK_OS_CONFIG_DIR)"
  [[ -n "\${log_dir}" ]] || log_dir="\$(public_value AUTARK_OS_LOG_DIR)"
  [[ -n "\${runtime_dir}" ]] || runtime_dir=/var/lib/autark-os
  [[ -n "\${install_dir}" ]] || install_dir=/opt/autark-os
  [[ -n "\${configured_config_dir}" ]] && config_dir="\${configured_config_dir}"
  [[ -n "\${config_dir}" ]] || config_dir=/etc/autark-os
  [[ -n "\${log_dir}" ]] || log_dir=/var/log/autark-os
  [[ -n "\${server_port}" ]] || server_port=8082
  if ! /usr/lib/autark-os/release/runtime/bin/java -version >/dev/null 2>&1; then
    echo "Autark-OS: the bundled ${ARCHITECTURE} Java runtime cannot execute on this host." >&2
    exit 1
  fi
  AUTARK_OS_BACKEND_JAR=/usr/lib/autark-os/release/backend/autark-os-backend.jar \\
  AUTARK_OS_RUNTIME_DIR="\${runtime_dir}" \\
  AUTARK_OS_INSTALL_DIR="\${install_dir}" \\
  AUTARK_OS_CONFIG_DIR="\${config_dir}" \\
  AUTARK_OS_LOG_DIR="\${log_dir}" \\
  AUTARK_OS_SERVER_PORT="\${server_port}" \\
  AUTARK_OS_VERSION=${VERSION} \\
  AUTARK_OS_BUILD_SHA=$(build_sha) \\
  AUTARK_OS_BUILD_DATE=$(build_date) \\
  AUTARK_OS_UPDATE_CHANNEL=${CHANNEL} \\
  AUTARK_OS_INSTALL_METHOD=package \\
  AUTARK_OS_UPDATE_REPOSITORY=autark-labs/autark-os \\
  AUTARK_OS_JAVA_BIN=/usr/lib/autark-os/release/runtime/bin/java \\
    /usr/lib/autark-os/release/scripts/install-autark-os-service.sh --skip-tailscale
  ready=0
  for _attempt in \$(seq 1 60); do
    if curl --fail --silent "http://127.0.0.1:\${server_port}/api/health" >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 2
  done
  if [[ "\${ready}" -eq 1 ]] && ! "\${install_dir}/bin/autark-os" doctor >/dev/null 2>&1; then
    ready=0
  fi
  if [[ "\${ready}" -ne 1 ]]; then
    checkpoint_file=/run/autark-os-package-upgrade-checkpoint
    if [[ -r "\${checkpoint_file}" ]]; then
      checkpoint="\$(cat "\${checkpoint_file}")"
      if [[ -f "\${checkpoint}" ]]; then
        systemctl stop autark-os.service >/dev/null 2>&1 || true
        rm -rf "\${install_dir}" "\${config_dir}"
        rm -f /etc/systemd/system/autark-os.service /etc/sudoers.d/autark-os-fileops
        rm -f "\${runtime_dir}/autark-os.db" "\${runtime_dir}/autark-os.db-shm" "\${runtime_dir}/autark-os.db-wal"
        tar -xzf "\${checkpoint}" -C /
        systemctl daemon-reload
        systemctl start autark-os.service >/dev/null 2>&1 || true
        echo "Autark-OS: the package failed health verification; restored the pre-upgrade service snapshot." >&2
      fi
    fi
    rm -f "\${checkpoint_file}"
    exit 1
  fi
  rm -f /run/autark-os-package-upgrade-checkpoint
  echo "Autark-OS base service installed."
  echo "Next: open http://localhost:\${server_port} to complete setup."
  echo "Logs: journalctl -u autark-os.service -f"
  if docker compose version >/dev/null 2>&1; then
    echo "Docker Engine and Docker Compose v2 are ready for catalog apps."
  else
    echo "Catalog app installs are unavailable until Docker Engine and Docker Compose v2 are installed and running."
    echo "For automatic Docker setup on a supported host, use the Autark-OS portable .run installer instead of the advanced .deb path."
  fi
fi
POSTINST
  cat >"${deb_root}/DEBIAN/prerm" <<'PRERM'
#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "remove" || "${1:-}" == "deconfigure" || "${1:-}" == "upgrade" ]]; then
  if command -v systemctl >/dev/null 2>&1; then
    systemctl stop autark-os.service >/dev/null 2>&1 || true
  fi
fi
PRERM
  cat >"${deb_root}/DEBIAN/postrm" <<'POSTRM'
#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "remove" || "${1:-}" == "purge" ]]; then
  if command -v systemctl >/dev/null 2>&1; then
    systemctl disable --now autark-os.service >/dev/null 2>&1 || true
  fi
  rm -f /etc/systemd/system/autark-os.service /usr/local/bin/autark-os /etc/sudoers.d/autark-os-fileops
  rm -rf /opt/autark-os
  if command -v systemctl >/dev/null 2>&1; then
    systemctl daemon-reload >/dev/null 2>&1 || true
  fi
fi

# Runtime data, apps, backups, configuration, and package-upgrade checkpoints
# are deliberately preserved on remove and purge. Use `autark-os uninstall
# --remove-data` only after reviewing its explicit destructive plan.
exit 0
POSTRM
  chmod 0755 "${deb_root}/DEBIAN/preinst" "${deb_root}/DEBIAN/postinst" "${deb_root}/DEBIAN/prerm" "${deb_root}/DEBIAN/postrm"
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
INSTALLER_TEMP_DIR=""

usage() {
  cat <<USAGE
Autark-OS Portable Installer ${AUTARK_OS_INSTALLER_VERSION}

Usage: $0 [options]

Options:
  --extract-only DIR  Extract the bundled release into DIR and exit.
  --dry-run           Preview install actions without changing this host.
  --yes               Confirm guided prompts where supported.
  --runtime-dir DIR   Store Autark-OS runtime data in DIR.
  --port PORT         Run Autark-OS on PORT.
  -h, --help          Show this help.

Run without options to start the terminal-based portable installer. On a Linux
desktop, zenity may show an optional confirmation before terminal progress. If
Autark-OS is already installed, the same file runs the shared update plan and
automatic rollback flow instead of creating a second installation.
USAGE
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

cleanup_installer_temp_dir() {
  [[ -n "${INSTALLER_TEMP_DIR}" ]] || return 0
  rm -rf "${INSTALLER_TEMP_DIR}"
}

normalize_architecture() {
  case "$1" in
    x86_64|amd64) printf 'amd64\n' ;;
    aarch64|arm64) printf 'arm64\n' ;;
    *) printf '%s\n' "$1" ;;
  esac
}

host_architecture() {
  if command_exists dpkg; then
    normalize_architecture "$(dpkg --print-architecture)"
  else
    normalize_architecture "$(uname -m)"
  fi
}

verify_installer_architecture() {
  local detected
  detected="$(host_architecture)"
  [[ "${detected}" == "${AUTARK_OS_INSTALLER_ARCHITECTURE}" ]] || {
    printf 'Autark-OS Portable Installer error: this installer is %s, but this host is %s.\n' "${AUTARK_OS_INSTALLER_ARCHITECTURE}" "${detected}" >&2
    exit 1
  }
}

payload_line() {
  awk "/^${PAYLOAD_MARKER}\$/ {print NR + 1; exit 0}" "$0"
}

extract_payload() {
  local target_dir="$1"
  mkdir -p "${target_dir}"
  if find "${target_dir}" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
    printf 'Autark-OS Installer error: extraction target is not empty: %s\n' "${target_dir}" >&2
    exit 1
  fi
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
  verify_installer_architecture
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
  INSTALLER_TEMP_DIR="${temp_dir}"
  trap cleanup_installer_temp_dir EXIT
  extract_payload "${temp_dir}"
  [[ -f "${temp_dir}/SHA256SUMS" ]] || { printf 'Autark-OS Portable Installer error: release checksums are missing.\n' >&2; exit 1; }
  (cd "${temp_dir}" && sha256sum -c SHA256SUMS) || { printf 'Autark-OS Portable Installer error: release checksum verification failed.\n' >&2; exit 1; }

  printf 'Autark-OS Portable Installer %s\n' "${AUTARK_OS_INSTALLER_VERSION}"
  if [[ -f /etc/autark-os/autark-os.env || -f /etc/systemd/system/autark-os.service ]]; then
    printf 'An existing Autark-OS installation was found. This installer will use the shared update and rollback flow.\n'
    local update_args=(--release-bundle "${temp_dir}")
    local install_arg
    for install_arg in "${install_args[@]}"; do
      case "${install_arg}" in
        --yes|--dry-run|--skip-service-restart|--force)
          update_args+=("${install_arg}")
          ;;
        --runtime-dir|--runtime-dir=*|--port|--port=*)
          printf 'Autark-OS Portable Installer error: storage and port changes are not update operations. Use the installed migration/settings flow first.\n' >&2
          return 1
          ;;
        *)
          printf 'Autark-OS Portable Installer error: unsupported update option: %s\n' "${install_arg}" >&2
          return 1
          ;;
      esac
    done
    set +e
    AUTARK_OS_INSTALL_METHOD=portable "${temp_dir}/scripts/autark-os" update "${update_args[@]}"
    local update_status=$?
    set -e
    if [[ "${update_status}" -ne 0 ]]; then
      printf '\nAutark-OS Portable Installer update did not complete. Run autark-os update status and autark-os logs for details.\n' >&2
      return "${update_status}"
    fi
    printf 'Autark-OS Portable Installer update completed successfully.\n'
    return 0
  fi

  printf 'This terminal installer will check this device, request administrator approval once, install Autark-OS, and start the service.\n'
  set +e
  AUTARK_OS_INSTALL_METHOD=portable "${temp_dir}/scripts/autark-os" install --release-bundle "${temp_dir}" --guided "${install_args[@]}"
  local install_status=$?
  set -e
  if [[ "${install_status}" -ne 0 ]]; then
    cat >&2 <<FAILURE

Autark-OS Portable Installer did not complete.
No success state was reported, so Autark-OS may not be installed yet.
Review the failed stage above, then safely rerun this same installer file.
If an installer log was created, its path is printed above.

FAILURE
    return "${install_status}"
  fi
  printf 'Autark-OS Portable Installer completed successfully.\n'
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
  local tar_name deb_name run_name release_build_sha release_build_date
  tar_name="$(basename "${TARBALL}")"
  deb_name="$(basename "${DEB}")"
  run_name="$(basename "${RUN_INSTALLER}")"
  release_build_sha="$(build_sha)"
  release_build_date="$(build_date)"
  [[ -n "${release_build_sha}" && "${release_build_sha}" != "development" && "${release_build_sha}" != "unknown" ]] || die "Release bundle is missing a verified build SHA."
  [[ -n "${release_build_date}" && "${release_build_date}" != "development" ]] || die "Release bundle is missing a verified build date."
  cat >"${ARTIFACT_MANIFEST}" <<JSON
{
  "schemaVersion": 2,
  "name": "autark-os",
  "version": "$(json_escape "${VERSION}")",
  "channel": "$(json_escape "${CHANNEL}")",
  "buildSha": "$(json_escape "${release_build_sha}")",
  "buildDate": "$(json_escape "${release_build_date}")",
  "artifactArchitecture": "$(json_escape "${ARCHITECTURE}")",
  "runtimeArchitecture": "$(json_escape "${ARCHITECTURE}")",
  "supportedHostPolicyVersion": "$(json_escape "${AUTARK_OS_SUPPORTED_HOST_POLICY_VERSION}")",
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
