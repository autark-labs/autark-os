#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

runtime_dir="${tmp_dir}/runtime"
fake_bin="${tmp_dir}/bin"
device_id="11111111-1111-4111-8111-111111111111"
installation_id="22222222-2222-4222-8222-222222222222"
rotated_installation_id="33333333-3333-4333-8333-333333333333"
fingerprint="sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

mkdir -p "${runtime_dir}/config/pro" "${fake_bin}"
cat >"${runtime_dir}/config/pro/device-identity.json" <<IDENTITY
{
  "schemaVersion": "1",
  "deviceId": "${device_id}",
  "installationId": "${installation_id}",
  "publicKeyFingerprint": "${fingerprint}",
  "privateKeyPkcs8": "must-never-be-printed"
}
IDENTITY
printf '%s\n' 'local-recovery-secret' >"${runtime_dir}/config/admin-local-secret"
chmod 600 \
  "${runtime_dir}/config/pro/device-identity.json" \
  "${runtime_dir}/config/admin-local-secret"
printf 'AUTARK_OS_RUNTIME_ROOT=%s\nSERVER_PORT=18082\n' "${runtime_dir}" >"${tmp_dir}/autark-os.env"

cat >"${fake_bin}/id" <<'FAKE_ID'
#!/usr/bin/env bash
if [[ "${1:-}" == "-u" ]]; then printf '0\n'; else /usr/bin/id "$@"; fi
FAKE_ID

cat >"${fake_bin}/curl" <<FAKE_CURL
#!/usr/bin/env bash
set -Eeuo pipefail
output=""
header_file=""
url=""
while [[ \$# -gt 0 ]]; do
  case "\$1" in
    -o) output="\$2"; shift 2 ;;
    -H)
      [[ "\$2" != @* ]] || header_file="\${2#@}"
      shift 2
      ;;
    http://*) url="\$1"; shift ;;
    *) shift ;;
  esac
done
[[ -n "\${output}" && -n "\${header_file}" ]]
[[ "\${url}" == "http://127.0.0.1:18082/api/v1/pro/identity/local/rotate-installation" ]]
grep -qx 'X-Autark-OS-Local-Secret: local-recovery-secret' "\${header_file}"
printf '{"ok":true,"deviceId":"${device_id}","installationId":"${rotated_installation_id}","publicKeyFingerprint":"${fingerprint}","message":"rotated"}\n' >"\${output}"
printf '200'
FAKE_CURL
chmod +x "${fake_bin}/id" "${fake_bin}/curl"

identity_output="$(
  PATH="${fake_bin}:${PATH}" \
  AUTARK_OS_CONFIG_FILE="${tmp_dir}/autark-os.env" \
  "${repo_root}/scripts/autark-os" pro identity
)"
grep -q "Device ID: ${device_id}" <<<"${identity_output}"
grep -q "Installation ID: ${installation_id}" <<<"${identity_output}"
grep -q "Public key fingerprint: ${fingerprint}" <<<"${identity_output}"
! grep -q 'must-never-be-printed' <<<"${identity_output}"

rotation_output="$(
  PATH="${fake_bin}:${PATH}" \
  AUTARK_OS_CONFIG_FILE="${tmp_dir}/autark-os.env" \
  "${repo_root}/scripts/autark-os" pro rotate-installation-id \
    --confirm ROTATE-INSTALLATION-IDENTITY
)"
grep -q 'device signing key was preserved' <<<"${rotation_output}"
grep -q "Device ID: ${device_id}" <<<"${rotation_output}"
grep -q "New installation ID: ${rotated_installation_id}" <<<"${rotation_output}"
! grep -q 'local-recovery-secret' <<<"${rotation_output}"

if PATH="${fake_bin}:${PATH}" \
  AUTARK_OS_CONFIG_FILE="${tmp_dir}/autark-os.env" \
  "${repo_root}/scripts/autark-os" pro rotate-installation-id \
  --confirm WRONG >"${tmp_dir}/wrong-confirmation.out" 2>&1; then
  printf 'Expected a wrong installation rotation confirmation to fail.\n' >&2
  exit 1
fi
grep -q 'No changes were made' "${tmp_dir}/wrong-confirmation.out"

chmod 640 "${runtime_dir}/config/pro/device-identity.json"
if PATH="${fake_bin}:${PATH}" \
  AUTARK_OS_CONFIG_FILE="${tmp_dir}/autark-os.env" \
  "${repo_root}/scripts/autark-os" pro identity >"${tmp_dir}/broad-mode.out" 2>&1; then
  printf 'Expected broad device identity permissions to fail.\n' >&2
  exit 1
fi
grep -q 'must have mode 0600' "${tmp_dir}/broad-mode.out"

if AUTARK_OS_CONFIG_FILE="${tmp_dir}/autark-os.env" \
  "${repo_root}/scripts/autark-os" pro identity >"${tmp_dir}/non-root.out" 2>&1; then
  printf 'Expected the non-root identity command to fail.\n' >&2
  exit 1
fi
grep -q 'requires root approval' "${tmp_dir}/non-root.out"
