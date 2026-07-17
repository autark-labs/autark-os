#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
installer="${repo_root}/scripts/install-autark-os-service.sh"

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
  'CapabilityBoundingSet=' \
  'AmbientCapabilities=' \
  'UMask=0077'; do
  grep -Fxq "${directive}" "${installer}"
done

grep -Fq 'NoNewPrivileges=false' "${installer}"
grep -Fq 'sudo needs to retain its setuid transition' "${installer}"
grep -Fq 'ReadWritePaths=${RUNTIME_DIR} ${LOG_DIR} ${CONFIG_DIR}' "${installer}"
grep -Fq 'Installed service permissions or hardening directives have drifted' "${installer}"
grep -Fq 'AUTARK_OS_FILEOPS_HELPER_SHA256' "${installer}"
grep -Fq 'checksum differs' "${installer}"
grep -Fq 'systemd 247 or newer' "${installer}"
