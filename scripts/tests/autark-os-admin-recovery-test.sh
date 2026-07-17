#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

runtime_dir="${tmp_dir}/runtime"
fake_bin="${tmp_dir}/bin"
mkdir -p "${runtime_dir}/config" "${fake_bin}"
printf '%s\n' 'LOCAL-SETUP-PROOF' >"${runtime_dir}/config/admin-setup-code"
printf '%s\n' 'local-recovery-secret' >"${runtime_dir}/config/admin-local-secret"
chmod 600 "${runtime_dir}/config/admin-setup-code" "${runtime_dir}/config/admin-local-secret"
printf 'AUTARK_OS_RUNTIME_ROOT=%s\nSERVER_PORT=18082\n' "${runtime_dir}" >"${tmp_dir}/autark-os.env"

cat >"${fake_bin}/id" <<'FAKE_ID'
#!/usr/bin/env bash
if [[ "${1:-}" == "-u" ]]; then printf '0\n'; else /usr/bin/id "$@"; fi
FAKE_ID

cat >"${fake_bin}/curl" <<'FAKE_CURL'
#!/usr/bin/env bash
set -Eeuo pipefail
output=""
header_file=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o) output="$2"; shift 2 ;;
    -H)
      [[ "$2" != @* ]] || header_file="${2#@}"
      shift 2
      ;;
    -w) shift 2 ;;
    *) shift ;;
  esac
done
[[ -n "${output}" && -n "${header_file}" ]]
grep -qx 'X-Autark-OS-Local-Secret: local-recovery-secret' "${header_file}"
printf '{"ok":true,"message":"reset"}\n' >"${output}"
printf '200'
FAKE_CURL
chmod +x "${fake_bin}/id" "${fake_bin}/curl"

setup_code="$(
  PATH="${fake_bin}:${PATH}" \
  AUTARK_OS_CONFIG_FILE="${tmp_dir}/autark-os.env" \
  "${repo_root}/scripts/autark-os" admin setup-code
)"
[[ "${setup_code}" == 'LOCAL-SETUP-PROOF' ]]

reset_output="$(
  PATH="${fake_bin}:${PATH}" \
  AUTARK_OS_CONFIG_FILE="${tmp_dir}/autark-os.env" \
  AUTARK_OS_ADMIN_NEW_PASSWORD='a replacement admin password' \
  AUTARK_OS_ADMIN_NEW_PASSWORD_CONFIRMATION='a replacement admin password' \
  "${repo_root}/scripts/autark-os" admin reset-password
)"
grep -q 'Administrator password reset' <<<"${reset_output}"
grep -q 'Apps, settings, and backups were preserved' <<<"${reset_output}"
! grep -q 'a replacement admin password' <<<"${reset_output}"

if AUTARK_OS_CONFIG_FILE="${tmp_dir}/autark-os.env" "${repo_root}/scripts/autark-os" admin setup-code >"${tmp_dir}/non-root.out" 2>&1; then
  printf 'Expected the non-root setup-code command to fail.\n' >&2
  exit 1
fi
grep -q 'requires root approval' "${tmp_dir}/non-root.out"
