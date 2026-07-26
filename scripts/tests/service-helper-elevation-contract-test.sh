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
    --bounding-set=-all,+setuid,+setgid,+audit_write,+dac_override \
    sudo -n "${helper}"
)"
[[ "${result}" == '{"status":"ready"}' ]] || {
  printf 'The production capability boundary could not execute the bounded root helper.\n' >&2
  exit 1
}

printf 'Live bounded helper elevation contract passed.\n'
