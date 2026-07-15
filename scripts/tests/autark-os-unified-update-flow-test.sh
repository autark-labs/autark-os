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
sudoers_file="${tmp_dir}/autark-os-fileops.sudoers"
config_file="${config_dir}/autark-os.env"
service_state="${tmp_dir}/service-state"
health_expected="${tmp_dir}/health-expected"

mkdir -p \
  "${install_dir}/backend" "${install_dir}/runtime/bin" "${install_dir}/bin" \
  "${runtime_dir}" "${config_dir}" "${log_dir}" "${fake_bin}" \
  "${bundle_dir}/backend" "${bundle_dir}/runtime/bin" "${bundle_dir}/scripts"

printf 'old backend\n' >"${install_dir}/backend/autark-os-backend.jar"
printf 'old runtime\n' >"${install_dir}/runtime/bin/java"
printf 'old cli\n' >"${install_dir}/bin/autark-os"
printf 'old database\n' >"${runtime_dir}/autark-os.db"
printf 'old unit\n' >"${service_file}"
printf 'old sudoers\n' >"${sudoers_file}"
ln -s "${install_dir}/bin/autark-os" "${cli_link}"
printf 'active\n' >"${service_state}"
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
    exit 0
    ;;
  stop|disable)
    printf 'inactive\n' >"${TEST_SERVICE_STATE}"
    ;;
  start|restart|enable)
    printf 'active\n' >"${TEST_SERVICE_STATE}"
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
cmp -s "${TEST_HEALTH_EXPECTED}" "${TEST_INSTALL_DIR}/backend/autark-os-backend.jar" || exit 22
case "${url}" in
  */api/system/doctor) printf '{"status":"ready"}\n' ;;
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
printf 'new fileops\n' >"${bundle_dir}/scripts/autark-os-fileops"
printf 'new bootstrap\n' >"${bundle_dir}/scripts/bootstrap-autark-os.sh"
cat >"${bundle_dir}/scripts/install-autark-os-service.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
mkdir -p "${AUTARK_OS_INSTALL_DIR}/backend" "${AUTARK_OS_INSTALL_DIR}/runtime" "${AUTARK_OS_INSTALL_DIR}/bin"
cp "${AUTARK_OS_BACKEND_JAR}" "${AUTARK_OS_INSTALL_DIR}/backend/autark-os-backend.jar"
rm -rf "${AUTARK_OS_INSTALL_DIR}/runtime"
cp -a "${AUTARK_OS_RUNTIME_IMAGE}" "${AUTARK_OS_INSTALL_DIR}/runtime"
cp "$(dirname "${AUTARK_OS_BACKEND_JAR}")/../scripts/autark-os" "${AUTARK_OS_INSTALL_DIR}/bin/autark-os"
printf 'new unit\n' >"${AUTARK_OS_SERVICE_FILE}"
printf 'new sudoers\n' >"${AUTARK_OS_SUDOERS_FILE}"
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
  scripts/autark-os scripts/autark-os-fileops scripts/bootstrap-autark-os.sh scripts/install-autark-os-service.sh \
  autark-os-release.json >SHA256SUMS)

rollback_output="${tmp_dir}/rollback.out"
if PATH="${fake_bin}:/usr/bin:/bin" \
  TEST_INSTALL_DIR="${install_dir}" \
  TEST_HEALTH_EXPECTED="${health_expected}" \
  TEST_SERVICE_STATE="${service_state}" \
  AUTARK_OS_CONFIG_FILE="${config_file}" \
  AUTARK_OS_SERVICE_FILE="${service_file}" \
  AUTARK_OS_CLI_LINK="${cli_link}" \
  AUTARK_OS_SUDOERS_FILE="${sudoers_file}" \
  AUTARK_OS_UPDATE_HEALTH_TIMEOUT=1 \
  "${repo_root}/scripts/autark-os" update --release-bundle "${bundle_dir}" --yes >"${rollback_output}" 2>&1; then
  printf 'Expected the unhealthy update to fail after rolling back.\n' >&2
  exit 1
fi

grep -q '^old backend$' "${install_dir}/backend/autark-os-backend.jar"
grep -q '^old runtime$' "${install_dir}/runtime/bin/java"
grep -q '^old database$' "${runtime_dir}/autark-os.db"
grep -q '^old unit$' "${service_file}"
grep -q '^old sudoers$' "${sudoers_file}"
grep -q 'AUTARK_OS_VERSION=1.0.0' "${config_file}"
grep -q '"status":"rolled_back"' "${runtime_dir}/updates/update-state.json"
grep -q 'previous release was restored successfully' "${rollback_output}"

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

check_json="$(AUTARK_OS_CONFIG_FILE="${config_file}" "${repo_root}/scripts/autark-os" update check --channel stable --metadata-url "file://${manifest}" --json)"
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

beta_check="$(PATH="${github_bin}:/usr/bin:/bin" TEST_BETA_MANIFEST="${beta_manifest}" AUTARK_OS_CONFIG_FILE="${config_file}" AUTARK_OS_UPDATE_REPOSITORY=example/autark-os "${repo_root}/scripts/autark-os" update check --channel beta --json)"
BETA_CHECK_JSON="${beta_check}" python3 - <<'PY'
import json
import os

check = json.loads(os.environ["BETA_CHECK_JSON"])
assert check["availableVersion"] == "1.3.0-beta.1"
assert check["channel"] == "beta"
assert check["artifactSha256"] == "123456"
PY

printf 'new backend\n' >"${health_expected}"
success_output="${tmp_dir}/success.out"
PATH="${fake_bin}:/usr/bin:/bin" \
  TEST_INSTALL_DIR="${install_dir}" \
  TEST_HEALTH_EXPECTED="${health_expected}" \
  TEST_SERVICE_STATE="${service_state}" \
  AUTARK_OS_CONFIG_FILE="${config_file}" \
  AUTARK_OS_SERVICE_FILE="${service_file}" \
  AUTARK_OS_CLI_LINK="${cli_link}" \
  AUTARK_OS_SUDOERS_FILE="${sudoers_file}" \
  AUTARK_OS_UPDATE_HEALTH_TIMEOUT=1 \
  "${repo_root}/scripts/autark-os" update --release-bundle "${bundle_dir}" --yes >"${success_output}"

grep -q '^new backend$' "${install_dir}/backend/autark-os-backend.jar"
grep -q '^new runtime$' "${install_dir}/runtime/bin/java"
grep -q '^old database$' "${runtime_dir}/autark-os.db"
grep -q 'AUTARK_OS_VERSION=1.1.0' "${config_file}"
grep -q '"status":"completed"' "${runtime_dir}/updates/update-state.json"
grep -q 'is installed and healthy' "${success_output}"
grep -q '^active$' "${service_state}"
