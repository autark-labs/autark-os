#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
service_installer="${repo_root}/scripts/install-autark-os-service.sh"
cli="${repo_root}/scripts/autark-os"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

grep -q '^AUTARK_OS_LOG_DIR=${LOG_DIR}$' "${service_installer}"
grep -q '^LOGGING_FILE_NAME=${LOG_DIR}/autark-os.log$' "${service_installer}"
grep -q 'logs_command()' "${cli}"
grep -q 'local journal_args=(-u "${SERVICE_NAME}.service" --no-pager -n "${lines}")' "${cli}"
grep -q 'sudo journalctl "${journal_args\[@\]}"' "${cli}"

mkdir -p "${tmp_dir}/bin"
cat >"${tmp_dir}/bin/id" <<'SH'
#!/usr/bin/env bash
if [[ "${1:-}" == "-u" ]]; then
  printf '1000\n'
  exit 0
fi
exec /usr/bin/id "$@"
SH
cat >"${tmp_dir}/bin/sudo" <<'SH'
#!/usr/bin/env bash
printf 'sudo %s\n' "$*" >>"${AUTARK_OS_LOG_COMMAND_CAPTURE}"
exec "$@"
SH
cat >"${tmp_dir}/bin/journalctl" <<'SH'
#!/usr/bin/env bash
printf 'journalctl %s\n' "$*" >>"${AUTARK_OS_LOG_COMMAND_CAPTURE}"
SH
chmod +x "${tmp_dir}/bin/id" "${tmp_dir}/bin/sudo" "${tmp_dir}/bin/journalctl"

AUTARK_OS_LOG_COMMAND_CAPTURE="${tmp_dir}/commands.log" \
PATH="${tmp_dir}/bin:/usr/bin:/bin" \
  "${cli}" logs --lines 25 >/dev/null

grep -q '^sudo journalctl -u autark-os.service --no-pager -n 25$' "${tmp_dir}/commands.log"
grep -q '^journalctl -u autark-os.service --no-pager -n 25$' "${tmp_dir}/commands.log"
