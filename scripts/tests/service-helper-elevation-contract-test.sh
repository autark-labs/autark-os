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
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
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
sudo -n cp "${repo_root}/scripts/autark-os-fileops" "${protected_dir}/fileops.py"
# Run the actual archive/restore implementation with a disposable configured
# runtime under the service profile. The fixture stays outside product code.
sudo -n tee "${protected_dir}/restore-contract.py" >/dev/null <<'PY'
import argparse
import importlib.util
import os
from pathlib import Path
import pwd
import shutil
import sys

sys.dont_write_bytecode = True
root = Path(__file__).parent
spec = importlib.util.spec_from_file_location("fileops", root / "fileops.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
runtime = root / "runtime"
shutil.rmtree(runtime, ignore_errors=True)
app = runtime / "apps" / "fixture"
app.mkdir(parents=True)
owner = pwd.getpwnam("nobody")
os.chown(app.parent, owner.pw_uid, owner.pw_gid)
os.chown(app, owner.pw_uid, owner.pw_gid)
data = app / "article.txt"
data.write_text("Saved feed and read state\n")
os.chown(data, 33, 33)
data.chmod(0o640)
backup = runtime / "backups"
backup.mkdir()
archive = backup / "fixture.zip"
module.RUNTIME_CONFIG = root / "fixture.env"
module.RUNTIME_CONFIG.write_text(f"AUTARK_OS_RUNTIME_ROOT={runtime}\n")
args = argparse.Namespace(runtime_root=runtime, backup_root=backup, app="fixture",
                          destination=str(archive), archive=str(archive), scope="app")
module.create_safety_archive(args)
data.write_text("Changed after backup\n")
module.restore_app_data(args)
assert data.read_text() == "Saved feed and read state\n"
assert (data.stat().st_uid, data.stat().st_gid, data.stat().st_mode & 0o777) == (33, 33, 0o640)
assert (app.stat().st_uid, app.stat().st_gid, app.stat().st_mode & 0o777) == (owner.pw_uid, owner.pw_gid, 0o700)
PY

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
  python3 '${protected_dir}/restore-contract.py' >/dev/null
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
