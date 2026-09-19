#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
installer="${repo_root}/scripts/install-autark-os-service.sh"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

runtime_dir="${tmp_dir}/runtime"
config_dir="${tmp_dir}/config"
install_dir="${tmp_dir}/install"
log_dir="${tmp_dir}/logs"
service_file="${tmp_dir}/autark-os.service"
fake_bin="${tmp_dir}/bin"

mkdir -p "${runtime_dir}" "${config_dir}" "${install_dir}/backend" "${install_dir}/bin" "${log_dir}" "${fake_bin}"
printf '#!/usr/bin/env bash\nexit 0\n' >"${install_dir}/bin/autark-os"
printf '#!/usr/bin/env bash\nexit 0\n' >"${install_dir}/bin/bootstrap-autark-os.sh"
printf 'host matrix\n' >"${install_dir}/bin/supported-host-matrix.env"
python3 "${repo_root}/scripts/tests/create-release-test-jar.py" \
  --output "${install_dir}/backend/autark-os-backend.jar" \
  --version 0.0.1-SNAPSHOT \
  --build-sha development \
  --build-date unknown
chmod 0755 "${install_dir}/bin/autark-os" "${install_dir}/bin/bootstrap-autark-os.sh"
chmod 0644 "${install_dir}/bin/supported-host-matrix.env" "${install_dir}/backend/autark-os-backend.jar"

cat >"${config_dir}/autark-os.env" <<ENV
AUTARK_OS_VERSION=0.0.1-SNAPSHOT
AUTARK_OS_BUILD_SHA=development
AUTARK_OS_BUILD_DATE=unknown
ENV
cat >"${service_file}" <<ENV
[Unit]
RequiresMountsFor=${runtime_dir}
[Service]
User=root
Group=root
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ProtectControlGroups=true
ProtectKernelTunables=true
ProtectKernelModules=true
UMask=0022
ReadWritePaths=${config_dir}
ENV
chmod 0755 "${install_dir}"
chmod 0640 "${config_dir}/autark-os.env"
chmod 0644 "${service_file}"

cat >"${fake_bin}/stat" <<'SH'
#!/usr/bin/env bash
if [[ "${1:-}" == "-c" && "${2:-}" == "%U" ]]; then
  printf 'root\n'
  exit 0
fi
exec /usr/bin/stat "$@"
SH
cat >"${fake_bin}/systemctl" <<'SH'
#!/usr/bin/env bash
printf 'inactive\n'
SH
chmod 0755 "${fake_bin}"/*

check_service() {
  PATH="${fake_bin}:/usr/bin:/bin" \
    AUTARK_OS_ENFORCE_SERVICE_HARDENING_CHECK=1 \
    AUTARK_OS_RUNTIME_DIR="${runtime_dir}" \
    AUTARK_OS_CONFIG_DIR="${config_dir}" \
    AUTARK_OS_INSTALL_DIR="${install_dir}" \
    AUTARK_OS_LOG_DIR="${log_dir}" \
    AUTARK_OS_SERVICE_FILE="${service_file}" \
    "${installer}" --check
}

check_service >"${tmp_dir}/clean.out"
grep -q 'Service hardening.*protected' "${tmp_dir}/clean.out"

chmod g+w "${install_dir}/bin/autark-os"
if check_service >"${tmp_dir}/writable-command.out" 2>&1; then
  echo "expected a group-writable command to fail the service check" >&2
  exit 1
fi
grep -q 'Autark-OS command.*needs repair' "${tmp_dir}/writable-command.out"
chmod 0755 "${install_dir}/bin/autark-os"

sed -i '/PrivateTmp=true/d' "${service_file}"
if check_service >"${tmp_dir}/unit-drift.out" 2>&1; then
  echo "expected unit hardening drift to fail the service check" >&2
  exit 1
fi
grep -q 'missing PrivateTmp=true' "${tmp_dir}/unit-drift.out"
sed -i '/\[Service\]/a PrivateTmp=true' "${service_file}"

sed -i '/RequiresMountsFor=/d' "${service_file}"
if check_service >"${tmp_dir}/mount-dependency-drift.out" 2>&1; then
  echo "expected a missing runtime mount dependency to fail the service check" >&2
  exit 1
fi
grep -q 'missing RequiresMountsFor=' "${tmp_dir}/mount-dependency-drift.out"
sed -i '/\[Unit\]/a RequiresMountsFor='"${runtime_dir}" "${service_file}"
