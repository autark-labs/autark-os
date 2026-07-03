#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

fake_bin="${tmp_dir}/bin"
mkdir -p "${fake_bin}"

cat >"${fake_bin}/java" <<'SH'
#!/usr/bin/env bash
printf 'openjdk version "21.0.11" 2026-04-15\n' >&2
SH
chmod +x "${fake_bin}/java"

cat >"${fake_bin}/sudo" <<'SH'
#!/usr/bin/env bash
"$@"
SH
chmod +x "${fake_bin}/sudo"

cat >"${fake_bin}/tailscale" <<'SH'
#!/usr/bin/env bash
log_file="${AUTARK_OS_FAKE_TAILSCALE_LOG}"
case "${1:-}" in
  version)
    printf '1.98.4\n'
    ;;
  status)
    if [[ -f "${AUTARK_OS_FAKE_TAILSCALE_CONNECTED}" ]]; then
      exit 0
    fi
    exit 1
    ;;
  up)
    printf 'tailscale %s\n' "$*" >>"${log_file}"
    printf 'Scan this QR code or open this link to sign in:\n'
    printf 'https://login.tailscale.com/a/fake-autark-os-login\n'
    printf '[fake qr code]\n'
    touch "${AUTARK_OS_FAKE_TAILSCALE_CONNECTED}"
    ;;
  set)
    printf 'tailscale %s\n' "$*" >>"${log_file}"
    ;;
  *)
    printf 'unexpected tailscale command: %s\n' "$*" >&2
    exit 1
    ;;
esac
SH
chmod +x "${fake_bin}/tailscale"

for command_name in docker findmnt df id getent install usermod groupadd useradd systemctl ln chown chmod; do
  cat >"${fake_bin}/${command_name}" <<'SH'
#!/usr/bin/env bash
case "$(basename "$0")" in
  docker)
    if [[ "${1:-}" == "compose" && "${2:-}" == "version" ]]; then exit 0; fi
    if [[ "${1:-}" == "version" ]]; then exit 0; fi
    exit 0
    ;;
  findmnt) exit 0 ;;
  df) printf 'Filesystem 1K-blocks Used Available Use%% Mounted on\n/dev/vda2 40960000 10000000 25000000 30%% /\n'; exit 0 ;;
  id)
    if [[ "${1:-}" == "-u" ]]; then
      printf '0\n'
      exit 0
    fi
    exit 1
    ;;
  getent) exit 1 ;;
  *) exit 0 ;;
esac
SH
  chmod +x "${fake_bin}/${command_name}"
done

fake_jar="${tmp_dir}/autark-os-backend.jar"
printf 'fake jar\n' >"${fake_jar}"

tailscale_log="${tmp_dir}/tailscale.log"
tailscale_connected="${tmp_dir}/tailscale-connected"

connect_output="$(printf '1\n' | env AUTARK_OS_TAILSCALE_ONBOARDING=1 AUTARK_OS_TAILSCALE_ONBOARDING_ALLOW_NON_TTY=1 AUTARK_OS_TAILSCALE_ONBOARDING_ONLY=1 AUTARK_OS_ASSUME_DEPENDENCIES_INSTALLED=1 AUTARK_OS_FAKE_TAILSCALE_LOG="${tailscale_log}" AUTARK_OS_FAKE_TAILSCALE_CONNECTED="${tailscale_connected}" AUTARK_OS_SERVICE_FILE="${tmp_dir}/connect.service" AUTARK_OS_CLI_LINK="${tmp_dir}/autark-os-connect" PATH="${fake_bin}:/usr/bin:/bin" "${repo_root}/scripts/bootstrap-autark-os.sh" \
  --release-jar "${fake_jar}" \
  --runtime-dir "${tmp_dir}/connect-runtime" \
  --install-dir "${tmp_dir}/connect-install" \
  --config-dir "${tmp_dir}/connect-config" \
  --log-dir "${tmp_dir}/connect-logs" \
  --port 19101 \
  --dry-run)"

grep -q 'Private access setup with Tailscale' <<<"${connect_output}"
grep -q 'Create an account or sign in with Tailscale' <<<"${connect_output}"
grep -q 'https://login.tailscale.com/a/fake-autark-os-login' <<<"${connect_output}"
grep -q 'Tailscale sign-in detected.' <<<"${connect_output}"
grep -q -- 'tailscale up --qr --qr-format=small' "${tailscale_log}"

rm -f "${tailscale_log}" "${tailscale_connected}"
skip_output="$(printf '2\n' | env AUTARK_OS_TAILSCALE_ONBOARDING=1 AUTARK_OS_TAILSCALE_ONBOARDING_ALLOW_NON_TTY=1 AUTARK_OS_TAILSCALE_ONBOARDING_ONLY=1 AUTARK_OS_ASSUME_DEPENDENCIES_INSTALLED=1 AUTARK_OS_FAKE_TAILSCALE_LOG="${tailscale_log}" AUTARK_OS_FAKE_TAILSCALE_CONNECTED="${tailscale_connected}" AUTARK_OS_SERVICE_FILE="${tmp_dir}/skip.service" AUTARK_OS_CLI_LINK="${tmp_dir}/autark-os-skip" PATH="${fake_bin}:/usr/bin:/bin" "${repo_root}/scripts/bootstrap-autark-os.sh" \
  --release-jar "${fake_jar}" \
  --runtime-dir "${tmp_dir}/skip-runtime" \
  --install-dir "${tmp_dir}/skip-install" \
  --config-dir "${tmp_dir}/skip-config" \
  --log-dir "${tmp_dir}/skip-logs" \
  --port 19102 \
  --dry-run)"

grep -q 'Tailscale setup skipped. You can finish private access later' <<<"${skip_output}"
if [[ -f "${tailscale_log}" ]] && grep -q -- 'tailscale up' "${tailscale_log}"; then
  printf 'Skip path should not call tailscale up.\n' >&2
  exit 1
fi
