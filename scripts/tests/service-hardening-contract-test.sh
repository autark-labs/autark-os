#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
installer="${repo_root}/scripts/install-autark-os-service.sh"

assert_installer_contains() {
  local expected="$1"
  if ! grep -Fq "${expected}" "${installer}"; then
    printf 'Service hardening contract is missing: %s\n' "${expected}" >&2
    exit 1
  fi
}

# These settings preserve Java, Docker socket, and the bounded sudo helper
# while materially reducing access to the rest of the host.
for directive in \
  'PrivateTmp=true' \
  'ProtectSystem=strict' \
  'ProtectHome=true' \
  'ProtectKernelTunables=true' \
  'ProtectKernelModules=true' \
  'ProtectControlGroups=true' \
  'ProtectClock=true' \
  'ProtectKernelLogs=true' \
  'PrivateDevices=true' \
  'LockPersonality=true' \
  'RestrictRealtime=true' \
  'SystemCallArchitectures=native' \
  'RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6' \
  'CapabilityBoundingSet=CAP_AUDIT_WRITE CAP_DAC_OVERRIDE CAP_SETGID CAP_SETUID' \
  'AmbientCapabilities=' \
  'UMask=0077'; do
  if ! grep -Fxq "${directive}" "${installer}"; then
    printf 'Service hardening directive is missing: %s\n' "${directive}" >&2
    exit 1
  fi
done

assert_installer_contains 'NoNewPrivileges=false'
assert_installer_contains 'sudo needs its setuid/setgid and audit'
assert_installer_contains 'Retain only those four capabilities'
assert_installer_contains 'ReadWritePaths=${RUNTIME_DIR} ${LOG_DIR} ${CONFIG_DIR}'
assert_installer_contains 'Installed service permissions or hardening directives have drifted'
assert_installer_contains 'AUTARK_OS_FILEOPS_HELPER_SHA256'
assert_installer_contains 'AUTARK_OS_CORE_UPDATE_HELPER_SHA256'
assert_installer_contains 'autark-os-update-helper'
assert_installer_contains 'install_core_update_signing_key'
assert_installer_contains 'core-update-release.pub'
assert_installer_contains 'checksum differs'
assert_installer_contains 'systemd 247 or newer'
