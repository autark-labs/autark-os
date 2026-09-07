#!/usr/bin/env bash
set -Eeuo pipefail

if ! command -v setpriv >/dev/null 2>&1; then
  printf 'Skipping live helper elevation contract: setpriv is unavailable.\n'
  exit 0
fi
if ! sudo -n true >/dev/null 2>&1; then
  printf 'Skipping live helper elevation contract: passwordless test sudo is unavailable.\n'
  exit 0
fi

contract_root="$(mktemp -d)"
helper="${contract_root}/bounded-helper"
protected_dir="${contract_root}/protected"
sudoers_rule="/etc/sudoers.d/autark-os-helper-elevation-contract-$$"

cleanup() {
  sudo -n rm -f "${sudoers_rule}"
  sudo -n rm -rf "${contract_root}"
}
trap cleanup EXIT

chmod 0755 "${contract_root}"
sudo -n install -d -o root -g root -m 0700 "${protected_dir}"
printf 'protected state\n' | sudo -n tee "${protected_dir}/health" >/dev/null

cat >"${helper}" <<SH
#!/usr/bin/env bash
set -Eeuo pipefail
[[ "\$(id -u)" -eq 0 ]]
grep -q '^protected state\$' '${protected_dir}/health'
if [[ "\${1:-}" == metadata ]]; then
  rm -f '${protected_dir}/metadata'
  cp '${protected_dir}/health' '${protected_dir}/metadata'
  chown nobody:nogroup '${protected_dir}/metadata'
  chmod 0640 '${protected_dir}/metadata'
  [[ "\$(stat -c '%u:%g:%a' '${protected_dir}/metadata')" == "\$(id -u nobody):\$(id -g nobody):640" ]]
fi
printf '{"status":"ready"}\\n'
SH
sudo -n chown root:root "${helper}"
sudo -n chmod 0755 "${helper}"
# Match production: the service user owns the parent runtime directory, while
# the protected update state and executable are root-owned. After sudo drops
# supplementary groups, root needs DAC override to cross this parent.
sudo -n chown nobody:nogroup "${contract_root}"
sudo -n chmod 0750 "${contract_root}"

printf 'nobody ALL=(root) NOPASSWD: %s\n' "${helper}" |
  sudo -n tee "${sudoers_rule}" >/dev/null
sudo -n chmod 0440 "${sudoers_rule}"
if command -v visudo >/dev/null 2>&1; then
  sudo -n visudo -cf "${sudoers_rule}" >/dev/null
fi

if sudo -n setpriv \
    --reuid=nobody --regid=nogroup --clear-groups \
    --bounding-set=-all,+setuid,+setgid \
    sudo -n "${helper}" >/dev/null 2>&1; then
  printf 'The legacy two-capability boundary unexpectedly allowed the root helper.\n' >&2
  exit 1
fi

# Without audit-write, sudo may complete but prepend an audit warning. That
# corrupts the helper's single-JSON-object protocol as observed by the backend.
set +e
without_audit="$(
  sudo -n setpriv \
    --reuid=nobody --regid=nogroup --clear-groups \
    --bounding-set=-all,+setuid,+setgid,+dac_override \
    sudo -n "${helper}" 2>&1
)"
without_audit_status=$?
set -e
if [[ "${without_audit_status}" -eq 0 && "${without_audit}" == '{"status":"ready"}' ]]; then
  printf 'The no-audit boundary unexpectedly preserved the single-object helper protocol.\n' >&2
  exit 1
fi

result="$(
  sudo -n setpriv \
    --reuid=nobody --regid=nogroup --clear-groups \
    --bounding-set=-all,+setuid,+setgid,+audit_write,+dac_override,+chown,+fowner \
    sudo -n "${helper}" metadata
)"
[[ "${result}" == '{"status":"ready"}' ]] || {
  printf 'The production capability boundary could not execute the bounded root helper.\n' >&2
  exit 1
}

printf 'Live bounded helper elevation contract passed.\n'

# Reading protected data is insufficient: restore must preserve container UIDs
# and modes. Both missing capabilities failed on the installed Debian artifact.
for legacy_bound in \
    '-all,+setuid,+setgid,+audit_write,+dac_override' \
    '-all,+setuid,+setgid,+audit_write,+dac_override,+chown'; do
  if sudo -n setpriv --reuid=nobody --regid=nogroup --clear-groups \
      --bounding-set="${legacy_bound}" sudo -n "${helper}" metadata >/dev/null 2>&1; then
    printf 'An incomplete capability bound unexpectedly restored ownership and modes.\n' >&2
    exit 1
  fi
done

if [[ ! -d /run/systemd/system ]] || ! command -v systemd-run >/dev/null 2>&1; then
  printf 'Skipping systemd helper profile contract: systemd is unavailable.\n'
  exit 0
fi

# Exercise the shipped sandbox directives, not just setpriv's capability mask.
# Several systemd directives implicitly set NNP even with NoNewPrivileges=false.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
properties=(-p User=nobody -p Group=nogroup -p "BindPaths=${contract_root}" -p "ReadWritePaths=${contract_root}")
while IFS= read -r directive; do
  properties+=(-p "${directive}")
done < <(sed -n '/^\[Service\]/,/^\[Install\]/p' "${repo_root}/scripts/install-autark-os-service.sh" |
  grep -E '^(NoNewPrivileges|PrivateTmp|Protect[A-Za-z]+|PrivateDevices|LockPersonality|Restrict[A-Za-z]+|SystemCall[A-Za-z]+|ReadOnlyPaths|InaccessiblePaths|DevicePolicy|CapabilityBoundingSet|AmbientCapabilities|UMask)=')

result="$(sudo -n systemd-run --quiet --wait --pipe --collect \
  --unit="autark-os-helper-contract-$$" "${properties[@]}" \
  /bin/sh -ec '
    grep -Eq "^NoNewPrivs:[[:space:]]*0$" /proc/self/status
    if sudo -n /usr/bin/id -u >/dev/null 2>&1; then exit 1; fi
    sudo -n "$1" metadata
  ' sh "${helper}")"
[[ "${result}" == '{"status":"ready"}' ]] || {
  printf 'The shipped systemd profile could not execute the bounded helper.\n' >&2
  exit 1
}
printf 'Live systemd bounded helper profile contract passed.\n'
