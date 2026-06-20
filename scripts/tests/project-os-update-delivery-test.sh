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
config_file="${config_dir}/project-os.env"
current_jar="${install_dir}/backend/project-os-backend.jar"

mkdir -p "${install_dir}/backend" "${install_dir}/bin" "${runtime_dir}" "${config_dir}" "${log_dir}" "${bundle_dir}/backend" "${bundle_dir}/scripts"
printf 'old backend jar\n' >"${current_jar}"
printf 'old project-os helper\n' >"${install_dir}/bin/project-os"
printf 'old bootstrap\n' >"${install_dir}/bin/bootstrap-project-os.sh"
cat >"${config_file}" <<ENV
PROJECT_OS_INSTALL_DIR=${install_dir}
PROJECT_OS_RUNTIME_ROOT=${runtime_dir}
PROJECT_OS_CONFIG_DIR=${config_dir}
PROJECT_OS_LOG_DIR=${log_dir}
PROJECT_OS_BACKEND_JAR=${current_jar}
PROJECT_OS_VERSION=1.0.0
PROJECT_OS_BUILD_SHA=old-sha
PROJECT_OS_BUILD_DATE=2026-01-01T00:00:00Z
PROJECT_OS_UPDATE_CHANNEL=stable
ENV

printf 'new backend jar\n' >"${bundle_dir}/backend/project-os-backend.jar"
printf 'new project-os helper\n' >"${bundle_dir}/scripts/project-os"
printf 'new bootstrap\n' >"${bundle_dir}/scripts/bootstrap-project-os.sh"
printf 'new service installer\n' >"${bundle_dir}/scripts/install-project-os-service.sh"
cat >"${bundle_dir}/project-os-release.json" <<JSON
{
  "schemaVersion": 1,
  "name": "project-os",
  "version": "1.1.0",
  "channel": "stable",
  "buildSha": "new-sha",
  "buildDate": "2026-06-19T12:00:00Z",
  "releaseNotesUrl": "https://example.invalid/project-os/1.1.0",
  "bundleUrl": "file://${bundle_dir}"
}
JSON
(cd "${bundle_dir}" && sha256sum backend/project-os-backend.jar scripts/project-os scripts/bootstrap-project-os.sh scripts/install-project-os-service.sh project-os-release.json > SHA256SUMS)

check_json="$(PROJECT_OS_CONFIG_FILE="${config_file}" "${repo_root}/scripts/project-os" update --check --metadata-url "file://${bundle_dir}/project-os-release.json" --json)"
PROJECT_OS_UPDATE_JSON="${check_json}" BUNDLE_DIR="${bundle_dir}" python3 - <<'PY'
import json
import os

check = json.loads(os.environ["PROJECT_OS_UPDATE_JSON"])
assert check["schemaVersion"] == 1
assert check["currentVersion"] == "1.0.0"
assert check["availableVersion"] == "1.1.0"
assert check["updateAvailable"] is True
assert check["releaseBundleUrl"] == f"file://{os.environ['BUNDLE_DIR']}"
assert check["requiresSourceCheckout"] is False
assert check["requiresNodeYarnOrGit"] is False
PY

PROJECT_OS_CONFIG_FILE="${config_file}" "${repo_root}/scripts/project-os" update \
  --release-bundle "${bundle_dir}" \
  --yes \
  --skip-service-restart >/tmp/project-os-update-output.txt

grep -q 'new backend jar' "${current_jar}"
grep -q 'new project-os helper' "${install_dir}/bin/project-os"
grep -q 'new bootstrap' "${install_dir}/bin/bootstrap-project-os.sh"
grep -q 'PROJECT_OS_VERSION=1.1.0' "${config_file}"
grep -q 'PROJECT_OS_BUILD_SHA=new-sha' "${config_file}"
grep -q 'PROJECT_OS_PREVIOUS_VERSION=1.0.0' "${config_file}"
grep -q 'PROJECT_OS_PREVIOUS_BUILD_SHA=old-sha' "${config_file}"

previous_jar="$(awk -F= '$1 == "PROJECT_OS_PREVIOUS_BACKEND_JAR" {print $2; exit}' "${config_file}")"
[[ -n "${previous_jar}" && -f "${previous_jar}" ]]
grep -q 'old backend jar' "${previous_jar}"

snapshot_dir="$(awk -F= '$1 == "PROJECT_OS_PRE_UPDATE_SNAPSHOT_DIR" {print $2; exit}' "${config_file}")"
[[ -n "${snapshot_dir}" && -f "${snapshot_dir}/project-os.env" && -f "${snapshot_dir}/project-os-release.json" ]]

version_output="$(PROJECT_OS_CONFIG_FILE="${config_file}" PROJECT_OS_BASE_URL="http://127.0.0.1:1" "${repo_root}/scripts/project-os" version)"
grep -q 'Version:         1.1.0' <<<"${version_output}"
grep -q 'Previous version: 1.0.0' <<<"${version_output}"
grep -q "Previous jar:    ${previous_jar}" <<<"${version_output}"
