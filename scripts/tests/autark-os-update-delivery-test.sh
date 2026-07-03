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
config_file="${config_dir}/autark-os.env"
current_jar="${install_dir}/backend/autark-os-backend.jar"

mkdir -p "${install_dir}/backend" "${install_dir}/bin" "${runtime_dir}" "${config_dir}" "${log_dir}" "${bundle_dir}/backend" "${bundle_dir}/scripts"
printf 'old backend jar\n' >"${current_jar}"
printf 'old autark-os helper\n' >"${install_dir}/bin/autark-os"
printf 'old fileops helper\n' >"${install_dir}/bin/autark-os-fileops"
printf 'old bootstrap\n' >"${install_dir}/bin/bootstrap-autark-os.sh"
cat >"${config_file}" <<ENV
AUTARK_OS_INSTALL_DIR=${install_dir}
AUTARK_OS_RUNTIME_ROOT=${runtime_dir}
AUTARK_OS_CONFIG_DIR=${config_dir}
AUTARK_OS_LOG_DIR=${log_dir}
AUTARK_OS_BACKEND_JAR=${current_jar}
AUTARK_OS_VERSION=1.0.0
AUTARK_OS_BUILD_SHA=old-sha
AUTARK_OS_BUILD_DATE=2026-01-01T00:00:00Z
AUTARK_OS_UPDATE_CHANNEL=stable
ENV

printf 'new backend jar\n' >"${bundle_dir}/backend/autark-os-backend.jar"
printf 'new autark-os helper\n' >"${bundle_dir}/scripts/autark-os"
printf 'new fileops helper\n' >"${bundle_dir}/scripts/autark-os-fileops"
printf 'new bootstrap\n' >"${bundle_dir}/scripts/bootstrap-autark-os.sh"
printf 'new service installer\n' >"${bundle_dir}/scripts/install-autark-os-service.sh"
cat >"${bundle_dir}/autark-os-release.json" <<JSON
{
  "schemaVersion": 1,
  "name": "autark-os",
  "version": "1.1.0",
  "channel": "stable",
  "buildSha": "new-sha",
  "buildDate": "2026-06-19T12:00:00Z",
  "releaseNotesUrl": "https://example.invalid/autark-os/1.1.0",
  "bundleUrl": "file://${bundle_dir}"
}
JSON
(cd "${bundle_dir}" && sha256sum backend/autark-os-backend.jar scripts/autark-os scripts/autark-os-fileops scripts/bootstrap-autark-os.sh scripts/install-autark-os-service.sh autark-os-release.json > SHA256SUMS)

check_json="$(AUTARK_OS_CONFIG_FILE="${config_file}" "${repo_root}/scripts/autark-os" update --check --metadata-url "file://${bundle_dir}/autark-os-release.json" --json)"
AUTARK_OS_UPDATE_JSON="${check_json}" BUNDLE_DIR="${bundle_dir}" python3 - <<'PY'
import json
import os

check = json.loads(os.environ["AUTARK_OS_UPDATE_JSON"])
assert check["schemaVersion"] == 1
assert check["currentVersion"] == "1.0.0"
assert check["availableVersion"] == "1.1.0"
assert check["updateAvailable"] is True
assert check["releaseBundleUrl"] == f"file://{os.environ['BUNDLE_DIR']}"
assert check["requiresSourceCheckout"] is False
assert check["requiresNodeYarnOrGit"] is False
PY

AUTARK_OS_CONFIG_FILE="${config_file}" "${repo_root}/scripts/autark-os" update \
  --release-bundle "${bundle_dir}" \
  --yes \
  --skip-service-restart >/tmp/autark-os-update-output.txt

grep -q 'new backend jar' "${current_jar}"
grep -q 'new autark-os helper' "${install_dir}/bin/autark-os"
grep -q 'new fileops helper' "${install_dir}/bin/autark-os-fileops"
grep -q 'new bootstrap' "${install_dir}/bin/bootstrap-autark-os.sh"
grep -q 'AUTARK_OS_VERSION=1.1.0' "${config_file}"
grep -q 'AUTARK_OS_BUILD_SHA=new-sha' "${config_file}"
grep -q 'AUTARK_OS_PREVIOUS_VERSION=1.0.0' "${config_file}"
grep -q 'AUTARK_OS_PREVIOUS_BUILD_SHA=old-sha' "${config_file}"

previous_jar="$(awk -F= '$1 == "AUTARK_OS_PREVIOUS_BACKEND_JAR" {print $2; exit}' "${config_file}")"
[[ -n "${previous_jar}" && -f "${previous_jar}" ]]
grep -q 'old backend jar' "${previous_jar}"

snapshot_dir="$(awk -F= '$1 == "AUTARK_OS_PRE_UPDATE_SNAPSHOT_DIR" {print $2; exit}' "${config_file}")"
[[ -n "${snapshot_dir}" && -f "${snapshot_dir}/autark-os.env" && -f "${snapshot_dir}/autark-os-release.json" ]]

version_output="$(AUTARK_OS_CONFIG_FILE="${config_file}" AUTARK_OS_BASE_URL="http://127.0.0.1:1" "${repo_root}/scripts/autark-os" version)"
grep -q 'Version:         1.1.0' <<<"${version_output}"
grep -q 'Previous version: 1.0.0' <<<"${version_output}"
grep -q "Previous jar:    ${previous_jar}" <<<"${version_output}"
