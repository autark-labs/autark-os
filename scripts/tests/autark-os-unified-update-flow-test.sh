#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

install_dir="${tmp_dir}/install"
runtime_dir="${tmp_dir}/runtime"
config_dir="${tmp_dir}/config"
log_dir="${tmp_dir}/logs"
bundle_dir="${tmp_dir}/bundle"
fake_bin="${tmp_dir}/bin"
service_file="${tmp_dir}/autark-os.service"
cli_link="${tmp_dir}/autark-os"
config_file="${config_dir}/autark-os.env"
service_state="${tmp_dir}/service-state"
service_enabled_state="${tmp_dir}/service-enabled-state"
health_expected="${tmp_dir}/health-expected"
curl_calls="${tmp_dir}/curl-calls"
inventory_regressed_backend="${tmp_dir}/inventory-regressed-backend"
legacy_inventory="${tmp_dir}/legacy-inventory"

mkdir -p \
  "${install_dir}/backend" "${install_dir}/runtime/bin" "${install_dir}/bin" \
  "${runtime_dir}" "${config_dir}" "${log_dir}" "${fake_bin}" \
  "${bundle_dir}/backend" "${bundle_dir}/runtime/bin" "${bundle_dir}/scripts"
mkdir -p "${runtime_dir}/config" "${runtime_dir}/apps/vaultwarden/data"

printf 'old backend\n' >"${install_dir}/backend/autark-os-backend.jar"
printf 'old runtime\n' >"${install_dir}/runtime/bin/java"
printf 'old cli\n' >"${install_dir}/bin/autark-os"
chmod +x "${install_dir}/bin/autark-os"
printf 'old database\n' >"${runtime_dir}/autark-os.db"
printf 'local-update-secret\n' >"${runtime_dir}/config/admin-local-secret"
printf 'stable installation identity\n' >"${runtime_dir}/config/identity.json"
printf 'managed app data\n' >"${runtime_dir}/apps/vaultwarden/data/preserved.txt"
printf 'old unit\n' >"${service_file}"
printf 'active\n' >"${service_state}"
printf 'disabled\n' >"${service_enabled_state}"
printf 'old backend\n' >"${health_expected}"

cat >"${config_file}" <<ENV
AUTARK_OS_INSTALL_DIR=${install_dir}
AUTARK_OS_RUNTIME_ROOT=${runtime_dir}
AUTARK_OS_CONFIG_DIR=${config_dir}
AUTARK_OS_LOG_DIR=${log_dir}
AUTARK_OS_BACKEND_JAR=${install_dir}/backend/autark-os-backend.jar
AUTARK_OS_VERSION=1.0.0
AUTARK_OS_BUILD_SHA=old-sha
AUTARK_OS_BUILD_DATE=2026-01-01T00:00:00Z
AUTARK_OS_UPDATE_CHANNEL=stable
AUTARK_OS_INSTALL_METHOD=portable
SERVER_PORT=18082
ENV

cat >"${fake_bin}/id" <<'SH'
#!/usr/bin/env bash
if [[ "${1:-}" == "-u" ]]; then
  printf '0\n'
else
  /usr/bin/id "$@"
fi
SH

cat >"${fake_bin}/systemctl" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
case "${1:-}" in
  is-active)
    [[ "$(cat "${TEST_SERVICE_STATE}")" == "active" ]]
    ;;
  is-enabled)
    [[ "$(cat "${TEST_SERVICE_ENABLED_STATE}")" == "enabled" ]]
    ;;
  stop)
    printf 'inactive\n' >"${TEST_SERVICE_STATE}"
    ;;
  start|restart)
    printf 'active\n' >"${TEST_SERVICE_STATE}"
    ;;
  enable)
    printf 'enabled\n' >"${TEST_SERVICE_ENABLED_STATE}"
    ;;
  disable)
    printf 'disabled\n' >"${TEST_SERVICE_ENABLED_STATE}"
    ;;
  daemon-reload|status)
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
SH

cat >"${fake_bin}/curl" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
url="${!#}"
printf '%s\n' "${url}" >>"${TEST_CURL_CALLS}"
case "${url}" in
  */api/system/update-inventory)
    if [[ -n "${TEST_LEGACY_INVENTORY:-}" && -s "${TEST_LEGACY_INVENTORY}" ]]; then
      printf '{"schemaVersion":1,"ownerInstanceId":"pos_current","runtimeRoot":"%s","runtimeRootHash":"sha256:runtime","managedApps":[{"catalogAppId":"vaultwarden","appInstanceId":"appinst_vault","ownerInstanceId":"pos_current","runtimePath":"%s/apps/vaultwarden","composeProject":"autarkos_current_vaultwarden","ownershipState":"owned","relationship":"managed"},{"catalogAppId":"homepage","appInstanceId":"appinst_home","ownerInstanceId":"pos_current","runtimePath":"%s/apps/homepage","composeProject":"autarkos_current_homepage","ownershipState":"owned","relationship":"managed"}]}\n' "${TEST_RUNTIME_DIR}" "${TEST_RUNTIME_DIR}" "${TEST_RUNTIME_DIR}"
    else
      printf '{"schemaVersion":2,"ownerInstanceId":"pos_current","runtimeRoot":"%s","runtimeRootHash":"sha256:runtime","identityFileSha256":"sha256:identity","managedApps":[{"catalogAppId":"vaultwarden","appInstanceId":"appinst_vault","ownerInstanceId":"pos_current","runtimePath":"%s/apps/vaultwarden","composeProject":"autarkos_current_vaultwarden","registrationInstalledAt":"2026-01-01T00:00:00Z","ownershipCreatedAt":"2026-01-01T00:00:00Z","runtimeMetadataCreatedAt":"2026-01-01T00:00:00Z","manifestVersion":"1.0.0","savedManifestSha256":"sha256:manifest-vault","composeSha256":"sha256:compose-vault","containers":[]},{"catalogAppId":"homepage","appInstanceId":"appinst_home","ownerInstanceId":"pos_current","runtimePath":"%s/apps/homepage","composeProject":"autarkos_current_homepage","registrationInstalledAt":"2026-01-01T00:00:00Z","ownershipCreatedAt":"2026-01-01T00:00:00Z","runtimeMetadataCreatedAt":"2026-01-01T00:00:00Z","manifestVersion":"1.0.0","savedManifestSha256":"sha256:manifest-home","composeSha256":"sha256:compose-home","containers":[]}]}\n' "${TEST_RUNTIME_DIR}" "${TEST_RUNTIME_DIR}" "${TEST_RUNTIME_DIR}"
    fi
    ;;
  */api/system/update-inventory/verify)
    if [[ -s "${TEST_INVENTORY_REGRESSED_BACKEND}" ]] && cmp -s "${TEST_INVENTORY_REGRESSED_BACKEND}" "${TEST_INSTALL_DIR}/backend/autark-os-backend.jar"; then
      printf '{"schemaVersion":2,"safe":false,"summary":"Update continuity verification found 1 managed-app identity violation(s).","violations":[{"catalogAppId":"vaultwarden","code":"registration_missing","expected":"managed","actual":"registration_missing"}]}\n'
    else
      printf '{"schemaVersion":2,"safe":true,"summary":"Verified that 2 managed app(s) retained their complete identity after the update.","violations":[]}\n'
    fi
    ;;
  */api/system/doctor) printf '{"status":"ready"}\n' ;;
  */api/health)
    if [[ ! -s "${TEST_INVENTORY_REGRESSED_BACKEND}" ]]; then
      cmp -s "${TEST_HEALTH_EXPECTED}" "${TEST_INSTALL_DIR}/backend/autark-os-backend.jar" || exit 22
    fi
    printf '{}\n'
    ;;
  */api/marketplace/apps) exit 22 ;;
  */api/discover/apps) printf '[]\n' ;;
  *) printf '{}\n' ;;
esac
SH

cat >"${fake_bin}/sleep" <<'SH'
#!/usr/bin/env bash
exit 0
SH
chmod +x "${fake_bin}"/*

printf 'new backend\n' >"${bundle_dir}/backend/autark-os-backend.jar"
printf 'new runtime\n' >"${bundle_dir}/runtime/bin/java"
printf 'new cli\n' >"${bundle_dir}/scripts/autark-os"
printf 'new bootstrap\n' >"${bundle_dir}/scripts/bootstrap-autark-os.sh"
cat >"${bundle_dir}/scripts/install-autark-os-service.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
mkdir -p "${AUTARK_OS_INSTALL_DIR}/backend" "${AUTARK_OS_INSTALL_DIR}/runtime" "${AUTARK_OS_INSTALL_DIR}/bin"
cp "${AUTARK_OS_BACKEND_JAR}" "${AUTARK_OS_INSTALL_DIR}/backend/autark-os-backend.jar"
printf 'database migrated by candidate\n' >"${AUTARK_OS_RUNTIME_DIR}/autark-os.db"
if grep -q '^regressed backend$' "${AUTARK_OS_BACKEND_JAR}"; then
  printf 'candidate replaced identity\n' >"${AUTARK_OS_RUNTIME_DIR}/config/identity.json"
fi
rm -rf "${AUTARK_OS_INSTALL_DIR}/runtime"
cp -a "${AUTARK_OS_RUNTIME_IMAGE}" "${AUTARK_OS_INSTALL_DIR}/runtime"
cp "$(dirname "${AUTARK_OS_BACKEND_JAR}")/../scripts/autark-os" "${AUTARK_OS_INSTALL_DIR}/bin/autark-os"
chmod +x "${AUTARK_OS_INSTALL_DIR}/bin/autark-os"
printf 'new unit\n' >"${AUTARK_OS_SERVICE_FILE}"
SH
chmod +x "${bundle_dir}/scripts/install-autark-os-service.sh"

architecture="$(dpkg --print-architecture 2>/dev/null || uname -m)"
[[ "${architecture}" != "x86_64" ]] || architecture=amd64
[[ "${architecture}" != "aarch64" ]] || architecture=arm64
cat >"${bundle_dir}/autark-os-release.json" <<JSON
{
  "schemaVersion": 2,
  "name": "autark-os",
  "version": "1.1.0",
  "channel": "stable",
  "buildSha": "new-sha",
  "buildDate": "2026-07-14T12:00:00Z",
  "artifactArchitecture": "${architecture}",
  "releaseNotesUrl": "https://example.invalid/releases/1.1.0"
}
JSON
(cd "${bundle_dir}" && sha256sum \
  backend/autark-os-backend.jar runtime/bin/java \
  scripts/autark-os scripts/bootstrap-autark-os.sh scripts/install-autark-os-service.sh \
  autark-os-release.json >SHA256SUMS)

rollback_output="${tmp_dir}/rollback.out"
if PATH="${fake_bin}:/usr/bin:/bin" \
  TEST_INSTALL_DIR="${install_dir}" \
  TEST_HEALTH_EXPECTED="${health_expected}" \
  TEST_CURL_CALLS="${curl_calls}" \
  TEST_SERVICE_STATE="${service_state}" \
  TEST_SERVICE_ENABLED_STATE="${service_enabled_state}" \
  TEST_RUNTIME_DIR="${runtime_dir}" \
  TEST_INVENTORY_REGRESSED_BACKEND="${inventory_regressed_backend}" \
  AUTARK_OS_CONFIG_FILE="${config_file}" \
  AUTARK_OS_SERVICE_FILE="${service_file}" \
  AUTARK_OS_CLI_LINK="${cli_link}" \
  AUTARK_OS_UPDATE_HEALTH_TIMEOUT=1 \
  "${repo_root}/scripts/autark-os" update --release-bundle "${bundle_dir}" --yes >"${rollback_output}" 2>&1; then
  printf 'Expected the unhealthy update to fail after rolling back.\n' >&2
  exit 1
fi

grep -q '^old backend$' "${install_dir}/backend/autark-os-backend.jar"
grep -q '^old runtime$' "${install_dir}/runtime/bin/java"
grep -q '^old database$' "${runtime_dir}/autark-os.db"
grep -q '^stable installation identity$' "${runtime_dir}/config/identity.json"
grep -q '^managed app data$' "${runtime_dir}/apps/vaultwarden/data/preserved.txt"
grep -q '^old unit$' "${service_file}"
grep -q 'AUTARK_OS_VERSION=1.0.0' "${config_file}"
grep -q '"status":"rolled_back"' "${runtime_dir}/updates/update-state.json"
grep -q 'previous release and its managed apps were restored successfully' "${rollback_output}"
[[ -x "${cli_link}" ]]

: >"${curl_calls}"
PATH="${fake_bin}:/usr/bin:/bin" \
  TEST_INSTALL_DIR="${install_dir}" \
  TEST_HEALTH_EXPECTED="${health_expected}" \
  TEST_CURL_CALLS="${curl_calls}" \
  TEST_SERVICE_STATE="${service_state}" \
  TEST_SERVICE_ENABLED_STATE="${service_enabled_state}" \
  TEST_RUNTIME_DIR="${runtime_dir}" \
  TEST_INVENTORY_REGRESSED_BACKEND="${inventory_regressed_backend}" \
  AUTARK_OS_CONFIG_FILE="${config_file}" \
  AUTARK_OS_SERVICE_FILE="${service_file}" \
  AUTARK_OS_CLI_LINK="${cli_link}" \
  "${repo_root}/scripts/autark-os" doctor >/dev/null
grep -q '/api/discover/apps' "${curl_calls}"
! grep -q '/api/marketplace/apps' "${curl_calls}"

printf 'not covered by the release manifest\n' >"${bundle_dir}/scripts/unlisted-file"
checksum_failure_output="${tmp_dir}/checksum-failure.out"
if AUTARK_OS_CONFIG_FILE="${config_file}" \
  "${repo_root}/scripts/autark-os" update --release-bundle "${bundle_dir}" --yes >"${checksum_failure_output}" 2>&1; then
  printf 'Expected an update with an unlisted bundle file to be rejected.\n' >&2
  exit 1
fi
grep -q 'checksums do not cover exactly the shipped files' "${checksum_failure_output}"
rm -f "${bundle_dir}/scripts/unlisted-file"

manifest="${tmp_dir}/release-manifest.json"
tar_name="autark-os-1.2.0-${architecture}.tar.gz"
cat >"${manifest}" <<JSON
{
  "schemaVersion": 1,
  "name": "autark-os",
  "version": "1.2.0",
  "tag": "v1.2.0",
  "channel": "stable",
  "releaseNotesUrl": "https://example.invalid/releases/1.2.0",
  "artifacts": [
    {
      "type": "tarball",
      "fileName": "${tar_name}",
      "url": "https://example.invalid/${tar_name}",
      "sizeBytes": 123,
      "sha256": "abcdef",
      "architecture": "${architecture}"
    }
  ]
}
JSON

check_stderr="${tmp_dir}/stable-update-check.stderr"
check_json="$(AUTARK_OS_CONFIG_FILE="${config_file}" "${repo_root}/scripts/autark-os" update check --channel stable --metadata-url "file://${manifest}" --json 2>"${check_stderr}")"
if [[ -s "${check_stderr}" ]]; then
  cat "${check_stderr}" >&2
  printf 'Stable update manifest parsing emitted unexpected diagnostics.\n' >&2
  exit 1
fi
UPDATE_CHECK_JSON="${check_json}" python3 - <<'PY'
import json
import os

check = json.loads(os.environ["UPDATE_CHECK_JSON"])
assert check["schemaVersion"] == 1
assert check["currentVersion"] == "1.0.0"
assert check["availableVersion"] == "1.2.0"
assert check["updateAvailable"] is True
assert check["artifactUrl"].startswith("https://example.invalid/autark-os-1.2.0-")
assert check["artifactSha256"] == "abcdef"
PY

beta_manifest="${tmp_dir}/beta-release-manifest.json"
beta_tar_name="autark-os-1.3.0-beta.1-${architecture}.tar.gz"
cat >"${beta_manifest}" <<JSON
{
  "schemaVersion": 1,
  "version": "1.3.0-beta.1",
  "channel": "beta",
  "releaseNotesUrl": "https://example.invalid/releases/1.3.0-beta.1",
  "artifacts": [
    {
      "type": "tarball",
      "fileName": "${beta_tar_name}",
      "url": "https://example.invalid/${beta_tar_name}",
      "sha256": "123456",
      "architecture": "${architecture}"
    }
  ]
}
JSON

github_bin="${tmp_dir}/github-bin"
mkdir -p "${github_bin}"
cat >"${github_bin}/curl" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
target=""
url=""
previous=""
for argument in "$@"; do
  if [[ "${previous}" == "--output" ]]; then
    target="${argument}"
  fi
  [[ "${argument}" != http* ]] || url="${argument}"
  previous="${argument}"
done
[[ -n "${target}" && -n "${url}" ]]
if [[ "${url}" == *'/releases?per_page=30' ]]; then
  cat >"${target}" <<'JSON'
[
  {
    "tag_name": "v1.3.0-beta.1",
    "draft": false,
    "prerelease": true
  }
]
JSON
else
  cp "${TEST_BETA_MANIFEST}" "${target}"
fi
SH
chmod +x "${github_bin}/curl"

beta_check_stderr="${tmp_dir}/beta-update-check.stderr"
beta_check="$(PATH="${github_bin}:/usr/bin:/bin" TEST_BETA_MANIFEST="${beta_manifest}" AUTARK_OS_CONFIG_FILE="${config_file}" AUTARK_OS_UPDATE_REPOSITORY=example/autark-os "${repo_root}/scripts/autark-os" update check --channel beta --json 2>"${beta_check_stderr}")"
if [[ -s "${beta_check_stderr}" ]]; then
  cat "${beta_check_stderr}" >&2
  printf 'Beta update manifest parsing emitted unexpected diagnostics.\n' >&2
  exit 1
fi
BETA_CHECK_JSON="${beta_check}" python3 - <<'PY'
import json
import os

check = json.loads(os.environ["BETA_CHECK_JSON"])
assert check["availableVersion"] == "1.3.0-beta.1"
assert check["channel"] == "beta"
assert check["artifactSha256"] == "123456"
PY

printf 'new backend\n' >"${health_expected}"
printf 'legacy\n' >"${legacy_inventory}"
success_output="${tmp_dir}/success.out"
PATH="${fake_bin}:/usr/bin:/bin" \
  TEST_INSTALL_DIR="${install_dir}" \
  TEST_HEALTH_EXPECTED="${health_expected}" \
  TEST_CURL_CALLS="${curl_calls}" \
  TEST_SERVICE_STATE="${service_state}" \
  TEST_SERVICE_ENABLED_STATE="${service_enabled_state}" \
  TEST_RUNTIME_DIR="${runtime_dir}" \
  TEST_LEGACY_INVENTORY="${legacy_inventory}" \
  TEST_INVENTORY_REGRESSED_BACKEND="${inventory_regressed_backend}" \
  AUTARK_OS_CONFIG_FILE="${config_file}" \
  AUTARK_OS_SERVICE_FILE="${service_file}" \
  AUTARK_OS_CLI_LINK="${cli_link}" \
  AUTARK_OS_UPDATE_HEALTH_TIMEOUT=1 \
  "${repo_root}/scripts/autark-os" update --release-bundle "${bundle_dir}" --yes >"${success_output}"

grep -q '^new backend$' "${install_dir}/backend/autark-os-backend.jar"
grep -q '^new runtime$' "${install_dir}/runtime/bin/java"
grep -q '^database migrated by candidate$' "${runtime_dir}/autark-os.db"
grep -q '^stable installation identity$' "${runtime_dir}/config/identity.json"
grep -q '^managed app data$' "${runtime_dir}/apps/vaultwarden/data/preserved.txt"
grep -q 'AUTARK_OS_VERSION=1.1.0' "${config_file}"
grep -q '"status":"completed"' "${runtime_dir}/updates/update-state.json"
grep -q 'is installed, healthy, and retained its managed-app inventory' "${success_output}"
grep -q 'establish the complete managed-app continuity baseline' "${success_output}"
grep -q 'Verified that 2 managed app(s)' "${success_output}"
grep -q '^active$' "${service_state}"
grep -q '^disabled$' "${service_enabled_state}"

snapshot_dir="$(awk -F= '$1 == "AUTARK_OS_PRE_UPDATE_SNAPSHOT_DIR" {print $2; exit}' "${config_file}")"
[[ -r "${snapshot_dir}/managed-app-inventory.json" ]]
[[ -r "${snapshot_dir}/identity.json" ]]
grep -q '"catalogAppId":"vaultwarden"' "${snapshot_dir}/managed-app-inventory.json"
grep -q '"safe":true' "${runtime_dir}/updates/latest-inventory-report.json"
rm -f "${legacy_inventory}"

printf 'database before inventory regression\n' >"${runtime_dir}/autark-os.db"
printf 'regressed backend\n' >"${bundle_dir}/backend/autark-os-backend.jar"
printf 'regressed backend\n' >"${health_expected}"
printf 'regressed backend\n' >"${inventory_regressed_backend}"
(cd "${bundle_dir}" && sha256sum \
  backend/autark-os-backend.jar runtime/bin/java \
  scripts/autark-os scripts/bootstrap-autark-os.sh scripts/install-autark-os-service.sh \
  autark-os-release.json >SHA256SUMS)
inventory_failure_output="${tmp_dir}/inventory-failure.out"
if PATH="${fake_bin}:/usr/bin:/bin" \
  TEST_INSTALL_DIR="${install_dir}" \
  TEST_HEALTH_EXPECTED="${health_expected}" \
  TEST_CURL_CALLS="${curl_calls}" \
  TEST_SERVICE_STATE="${service_state}" \
  TEST_SERVICE_ENABLED_STATE="${service_enabled_state}" \
  TEST_RUNTIME_DIR="${runtime_dir}" \
  TEST_INVENTORY_REGRESSED_BACKEND="${inventory_regressed_backend}" \
  AUTARK_OS_CONFIG_FILE="${config_file}" \
  AUTARK_OS_SERVICE_FILE="${service_file}" \
  AUTARK_OS_CLI_LINK="${cli_link}" \
  AUTARK_OS_UPDATE_HEALTH_TIMEOUT=1 \
  "${repo_root}/scripts/autark-os" update --release-bundle "${bundle_dir}" --yes --force >"${inventory_failure_output}" 2>&1; then
  printf 'Expected a managed-app inventory regression to fail and roll back.\n' >&2
  exit 1
fi

grep -q '^new backend$' "${install_dir}/backend/autark-os-backend.jar"
grep -q '^database before inventory regression$' "${runtime_dir}/autark-os.db"
grep -q '^stable installation identity$' "${runtime_dir}/config/identity.json"
grep -q '^managed app data$' "${runtime_dir}/apps/vaultwarden/data/preserved.txt"
grep -q '"status":"rolled_back"' "${runtime_dir}/updates/update-state.json"
grep -q 'did not preserve the managed-app inventory' "${inventory_failure_output}"
grep -q '"safe":false' "${runtime_dir}/updates/latest-inventory-report.json"
grep -q '^active$' "${service_state}"
grep -q '^disabled$' "${service_enabled_state}"
