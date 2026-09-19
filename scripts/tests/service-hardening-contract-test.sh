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

# The root supervisor accesses app storage directly; no sudo helper is installed.
for directive in User=root Group=root NoNewPrivileges=true PrivateTmp=true ProtectSystem=full ProtectHome=true ProtectControlGroups=true ProtectKernelTunables=true ProtectKernelModules=true UMask=0022; do
  assert_installer_contains "${directive}"
done
assert_installer_contains 'RequiresMountsFor=${RUNTIME_DIR}'
assert_installer_contains 'ReadWritePaths=${CONFIG_DIR}'
assert_installer_contains 'Installed service permissions or hardening directives have drifted'

if grep -Eq 'autark-os-fileops|sudoers|AUTARK_OS_USER|AUTARK_OS_GROUP|operator=' "${installer}"; then
  printf 'Obsolete service-account or privilege-helper setup remains.\n' >&2
  exit 1
fi

if grep -Eq 'AUTARK_OS_CORE_UPDATE|autark-os-update-helper|core-update-release.pub|install_core_update_signing_key' "${installer}"; then
  printf 'Removed appliance core-updater machinery is still present in the service installer.\n' >&2
  exit 1
fi
