#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

fake_bin="${tmp_dir}/bin"
mkdir -p "${fake_bin}"

cat >"${fake_bin}/docker" <<'SH'
#!/usr/bin/env bash
if [[ "${1:-}" == "compose" && "${2:-}" == "version" ]]; then
  printf 'Docker Compose version v2.39.0\n'
  exit 0
fi
if [[ "${1:-}" == "info" ]]; then
  exit 0
fi
exit 0
SH

cat >"${fake_bin}/tailscale" <<'SH'
#!/usr/bin/env bash
if [[ "${1:-}" == "version" ]]; then
  printf '1.80.0\n'
  exit 0
fi
if [[ "${1:-}" == "status" ]]; then
  exit 1
fi
printf 'unexpected tailscale command: %s\n' "$*" >>"${AUTARK_OS_FAKE_TAILSCALE_LOG}"
exit 99
SH
chmod +x "${fake_bin}/docker" "${fake_bin}/tailscale"

fake_jar="${tmp_dir}/autark-os-backend.jar"
tailscale_log="${tmp_dir}/tailscale.log"
printf 'fake jar\n' >"${fake_jar}"

output="$(AUTARK_OS_FAKE_TAILSCALE_LOG="${tailscale_log}" PATH="${fake_bin}:/usr/bin:/bin" \
  "${repo_root}/scripts/bootstrap-autark-os.sh" \
  --release-jar "${fake_jar}" \
  --auto-install-deps \
  --dry-run \
  --runtime-dir "${tmp_dir}/runtime" \
  --install-dir "${tmp_dir}/install" \
  --config-dir "${tmp_dir}/config" \
  --log-dir "${tmp_dir}/logs" \
  --port 19094)"

grep -q 'Tailscale is optional and is not installed or signed in during base installation.' <<<"${output}"
grep -q 'Skipping Tailscale operator setup.' <<<"${output}"
! grep -q 'Private access setup with Tailscale' <<<"${output}"
! grep -q 'tailscale up' <<<"${output}"
[[ ! -e "${tailscale_log}" ]]
