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
sudoers_file="${tmp_dir}/autark-os-fileops"
fake_bin="${tmp_dir}/bin"
service_user="autarkos-test"
helper="${install_dir}/bin/autark-os-fileops"

mkdir -p "${runtime_dir}" "${config_dir}" "${install_dir}/backend" "${install_dir}/bin" "${log_dir}" "${fake_bin}"
printf '#!/usr/bin/env bash\nexit 0\n' >"${helper}"
printf '#!/usr/bin/env bash\nexit 0\n' >"${install_dir}/bin/autark-os"
printf '#!/usr/bin/env bash\nexit 0\n' >"${install_dir}/bin/bootstrap-autark-os.sh"
printf 'host matrix\n' >"${install_dir}/bin/supported-host-matrix.env"
python3 "${repo_root}/scripts/tests/create-release-test-jar.py" \
  --output "${install_dir}/backend/autark-os-backend.jar" \
  --version 0.0.1-SNAPSHOT \
  --build-sha development \
  --build-date unknown
chmod 0755 "${helper}" "${install_dir}/bin/autark-os" "${install_dir}/bin/bootstrap-autark-os.sh"
chmod 0644 "${install_dir}/bin/supported-host-matrix.env" "${install_dir}/backend/autark-os-backend.jar"

helper_sha="$(sha256sum "${helper}" | awk '{print $1}')"
cat >"${config_dir}/autark-os.env" <<ENV
AUTARK_OS_VERSION=0.0.1-SNAPSHOT
AUTARK_OS_BUILD_SHA=development
AUTARK_OS_BUILD_DATE=unknown
AUTARK_OS_FILEOPS_HELPER_SHA256=${helper_sha}
ENV
cat >"${sudoers_file}" <<ENV
${service_user} ALL=(root) NOPASSWD: ${helper} *
ENV
cat >"${service_file}" <<ENV
[Service]
NoNewPrivileges=false
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
ProtectClock=true
ProtectKernelLogs=true
PrivateDevices=true
LockPersonality=true
RestrictRealtime=true
SystemCallArchitectures=native
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
CapabilityBoundingSet=
AmbientCapabilities=
ReadWritePaths=${runtime_dir} ${log_dir} ${config_dir}
ENV

cat >"${fake_bin}/id" <<'SH'
#!/usr/bin/env bash
if [[ "${1:-}" == "-nG" ]]; then
  printf '%s\n' "${AUTARK_OS_TEST_GROUPS:-autarkos-test docker}"
  exit 0
fi
exit 0
SH
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
    AUTARK_OS_USER="${service_user}" \
    AUTARK_OS_GROUP="${service_user}" \
    AUTARK_OS_RUNTIME_DIR="${runtime_dir}" \
    AUTARK_OS_CONFIG_DIR="${config_dir}" \
    AUTARK_OS_INSTALL_DIR="${install_dir}" \
    AUTARK_OS_LOG_DIR="${log_dir}" \
    AUTARK_OS_SERVICE_FILE="${service_file}" \
    AUTARK_OS_SUDOERS_FILE="${sudoers_file}" \
    "${installer}" --check
}

check_service >"${tmp_dir}/clean.out"
grep -q 'Service hardening.*protected' "${tmp_dir}/clean.out"

chmod g+w "${helper}"
if check_service >"${tmp_dir}/writable-helper.out" 2>&1; then
  echo "expected a group-writable helper to fail the service check" >&2
  exit 1
fi
grep -q 'Installed helper.*needs repair' "${tmp_dir}/writable-helper.out"
chmod 0755 "${helper}"

sed -i '/PrivateTmp=true/d' "${service_file}"
if check_service >"${tmp_dir}/unit-drift.out" 2>&1; then
  echo "expected unit hardening drift to fail the service check" >&2
  exit 1
fi
grep -q 'missing PrivateTmp=true' "${tmp_dir}/unit-drift.out"
sed -i '/\[Service\]/a PrivateTmp=true' "${service_file}"

printf '%s\n' "${service_user} ALL=(root) NOPASSWD: /usr/bin/false" >"${sudoers_file}"
if check_service >"${tmp_dir}/sudoers-drift.out" 2>&1; then
  echo "expected sudoers drift to fail the service check" >&2
  exit 1
fi
grep -q 'helper allow-list differs' "${tmp_dir}/sudoers-drift.out"
printf '%s\n' "${service_user} ALL=(root) NOPASSWD: ${helper} *" >"${sudoers_file}"

if AUTARK_OS_TEST_GROUPS="${service_user} docker wheel" check_service >"${tmp_dir}/group-drift.out" 2>&1; then
  echo "expected an unexpected service-user group to fail the service check" >&2
  exit 1
fi
grep -q 'Service user groups.*unexpected wheel' "${tmp_dir}/group-drift.out"

printf '# tampered\n' >>"${helper}"
if check_service >"${tmp_dir}/checksum-drift.out" 2>&1; then
  echo "expected privileged helper checksum drift to fail the service check" >&2
  exit 1
fi
grep -q 'checksum differs' "${tmp_dir}/checksum-drift.out"
