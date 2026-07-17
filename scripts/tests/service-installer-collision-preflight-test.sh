#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

config_dir="${tmp_dir}/config"
mkdir -p "${config_dir}"
cat >"${config_dir}/autark-os.env" <<'ENV'
AUTARK_OS_RUNTIME_ROOT=/tmp/autark-os-existing-runtime
SERVER_PORT=8082
ENV

if "${repo_root}/scripts/install-autark-os-service.sh" \
  --dry-run \
  --config-dir "${config_dir}" \
  --runtime-dir /tmp/autark-os-new-runtime \
  --install-dir "${tmp_dir}/install" \
  --log-dir "${tmp_dir}/logs" \
  --port 8082 >"${tmp_dir}/collision.out" 2>&1; then
  echo "expected conflicting runtime root to fail" >&2
  exit 1
fi

grep -q "Existing Autark-OS config" "${tmp_dir}/collision.out"
grep -q "AUTARK_OS_ALLOW_INSTALL_COLLISION=1" "${tmp_dir}/collision.out"

AUTARK_OS_ALLOW_INSTALL_COLLISION=1 "${repo_root}/scripts/install-autark-os-service.sh" \
  --dry-run \
  --config-dir "${config_dir}" \
  --runtime-dir /tmp/autark-os-new-runtime \
  --install-dir "${tmp_dir}/install" \
  --log-dir "${tmp_dir}/logs" \
  --port 8082 >"${tmp_dir}/override.out"

grep -q "Collision preflight override enabled" "${tmp_dir}/override.out"
grep -Fq "+ install -d -o root -g autarkos -m 0755 ${tmp_dir}/install/bin" "${tmp_dir}/override.out"

stale_config_dir="${tmp_dir}/stale-config"
stale_runtime_dir="${tmp_dir}/stale-runtime"
mkdir -p "${stale_config_dir}" "${stale_runtime_dir}/config" "${stale_runtime_dir}/apps/vaultwarden"
printf '{"instanceId":"old-instance"}\n' >"${stale_runtime_dir}/config/identity.json"

if "${repo_root}/scripts/install-autark-os-service.sh" \
  --dry-run \
  --config-dir "${stale_config_dir}" \
  --runtime-dir "${stale_runtime_dir}" \
  --install-dir "${tmp_dir}/stale-install" \
  --log-dir "${tmp_dir}/stale-logs" \
  --port 8082 >"${tmp_dir}/stale-runtime.out" 2>&1; then
  echo "expected stale runtime data to fail without an existing config" >&2
  exit 1
fi

grep -q "Existing Autark-OS runtime data was found" "${tmp_dir}/stale-runtime.out"
grep -q "Recover existing apps" "${tmp_dir}/stale-runtime.out"

check_runtime="${tmp_dir}/check-runtime"
check_config="${tmp_dir}/check-config"
check_install="${tmp_dir}/check-install"
check_logs="${tmp_dir}/check-logs"
check_bin="${tmp_dir}/check-bin"
mkdir -p "${check_runtime}" "${check_config}" "${check_install}/backend" "${check_logs}" "${check_bin}"
cat >"${check_config}/autark-os.env" <<'ENV'
AUTARK_OS_VERSION=9.8.7-beta.6
AUTARK_OS_BUILD_SHA=installed-build-sha
AUTARK_OS_BUILD_DATE=2026-07-15T03:00:00Z
ENV
python3 "${repo_root}/scripts/tests/create-release-test-jar.py" \
  --output "${check_install}/backend/autark-os-backend.jar" \
  --version 9.8.7-beta.6 \
  --build-sha installed-build-sha \
  --build-date 2026-07-15T03:00:00Z
cat >"${check_bin}/id" <<'SH'
#!/usr/bin/env bash
if [[ "${1:-}" == "-u" ]]; then
  printf '0\n'
  exit 0
fi
exit 1
SH
cat >"${check_bin}/systemctl" <<'SH'
#!/usr/bin/env bash
printf 'inactive\n'
SH
chmod +x "${check_bin}"/*

PATH="${check_bin}:/usr/bin:/bin" \
AUTARK_OS_RUNTIME_DIR="${check_runtime}" \
AUTARK_OS_CONFIG_DIR="${check_config}" \
AUTARK_OS_INSTALL_DIR="${check_install}" \
AUTARK_OS_LOG_DIR="${check_logs}" \
AUTARK_OS_SERVICE_FILE="${tmp_dir}/check-autark-os.service" \
  "${repo_root}/scripts/install-autark-os-service.sh" --check >"${tmp_dir}/check.out"

grep -q 'Autark-OS version:.*9.8.7-beta.6' "${tmp_dir}/check.out"
grep -q 'Build SHA:.*installed-build-sha' "${tmp_dir}/check.out"
grep -q 'Build date:.*2026-07-15T03:00:00Z' "${tmp_dir}/check.out"
grep -q 'Backend jar version:.*9.8.7-beta.6' "${tmp_dir}/check.out"

python3 "${repo_root}/scripts/tests/create-release-test-jar.py" \
  --output "${check_install}/backend/autark-os-backend.jar" \
  --version 9.8.7-beta.5 \
  --build-sha installed-build-sha \
  --build-date 2026-07-15T03:00:00Z
if PATH="${check_bin}:/usr/bin:/bin" \
  AUTARK_OS_RUNTIME_DIR="${check_runtime}" \
  AUTARK_OS_CONFIG_DIR="${check_config}" \
  AUTARK_OS_INSTALL_DIR="${check_install}" \
  AUTARK_OS_LOG_DIR="${check_logs}" \
  AUTARK_OS_SERVICE_FILE="${tmp_dir}/check-autark-os.service" \
  "${repo_root}/scripts/install-autark-os-service.sh" --check >"${tmp_dir}/mismatched-check.out" 2>&1; then
  printf 'Expected an installed release identity mismatch to fail service verification.\n' >&2
  exit 1
fi
grep -q 'Installed release identity does not match the backend jar' "${tmp_dir}/mismatched-check.out"
