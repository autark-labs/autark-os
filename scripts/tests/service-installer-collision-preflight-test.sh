#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

config_dir="${tmp_dir}/config"
mkdir -p "${config_dir}"
cat >"${config_dir}/project-os.env" <<'ENV'
PROJECT_OS_RUNTIME_ROOT=/tmp/project-os-existing-runtime
SERVER_PORT=8082
ENV

if "${repo_root}/scripts/install-project-os-service.sh" \
  --dry-run \
  --config-dir "${config_dir}" \
  --runtime-dir /tmp/project-os-new-runtime \
  --install-dir "${tmp_dir}/install" \
  --log-dir "${tmp_dir}/logs" \
  --port 8082 >"${tmp_dir}/collision.out" 2>&1; then
  echo "expected conflicting runtime root to fail" >&2
  exit 1
fi

grep -q "Existing Autark-OS config" "${tmp_dir}/collision.out"
grep -q "PROJECT_OS_ALLOW_INSTALL_COLLISION=1" "${tmp_dir}/collision.out"

PROJECT_OS_ALLOW_INSTALL_COLLISION=1 "${repo_root}/scripts/install-project-os-service.sh" \
  --dry-run \
  --config-dir "${config_dir}" \
  --runtime-dir /tmp/project-os-new-runtime \
  --install-dir "${tmp_dir}/install" \
  --log-dir "${tmp_dir}/logs" \
  --port 8082 >"${tmp_dir}/override.out"

grep -q "Collision preflight override enabled" "${tmp_dir}/override.out"

stale_config_dir="${tmp_dir}/stale-config"
stale_runtime_dir="${tmp_dir}/stale-runtime"
mkdir -p "${stale_config_dir}" "${stale_runtime_dir}/config" "${stale_runtime_dir}/apps/vaultwarden"
printf '{"instanceId":"old-instance"}\n' >"${stale_runtime_dir}/config/identity.json"

if "${repo_root}/scripts/install-project-os-service.sh" \
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
