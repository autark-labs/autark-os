#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
matrix="${repo_root}/scripts/supported-host-matrix.env"
[[ -r "${matrix}" ]]
# shellcheck source=../supported-host-matrix.env
source "${matrix}"

[[ "${AUTARK_OS_SUPPORTED_HOST_POLICY_VERSION}" == "2" ]]
[[ "${AUTARK_OS_SUPPORTED_DEBIAN_VERSIONS}" == "12 13" ]]
[[ "${AUTARK_OS_SUPPORTED_UBUNTU_VERSIONS}" == "24.04 26.04" ]]
[[ "${AUTARK_OS_SUPPORTED_RASPBIAN_VERSIONS}" == "11 12 13" ]]
[[ "${AUTARK_OS_SUPPORTED_ARCHITECTURES}" == "amd64 arm64" ]]
[[ "${AUTARK_OS_SUPPORTED_RASPBIAN_ARCHITECTURES}" == "arm64" ]]
[[ "${AUTARK_OS_MIN_MEMORY_MB}" == "2048" ]]
[[ "${AUTARK_OS_MIN_DISK_KB}" == "10485760" ]]

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

assert_support_status() {
  local os_id="$1"
  local version="$2"
  local architecture="$3"
  local expected="$4"
  local fixture="${tmp_dir}/${os_id}-${version}-${architecture}"
  local output
  printf 'ID=%s\nVERSION_ID="%s"\nPRETTY_NAME="%s %s"\n' "${os_id}" "${version}" "${os_id}" "${version}" >"${fixture}"
  output="$(AUTARK_OS_OS_RELEASE_FIXTURE="${fixture}" AUTARK_OS_ARCHITECTURE_FIXTURE="${architecture}" "${repo_root}/scripts/bootstrap-autark-os.sh" --doctor --json)"
  DOCTOR_JSON="${output}" EXPECTED_STATUS="${expected}" python3 - <<'PY'
import json
import os

doctor = json.loads(os.environ["DOCTOR_JSON"])
expected = os.environ["EXPECTED_STATUS"]
assert doctor["host"]["supportStatus"] == expected, doctor["host"]
host_check = next(item for item in doctor["checks"] if item["id"] == "host-matrix")
expected_check = {"supported": "ok", "untested": "warning", "unsupported": "blocked"}[expected]
assert host_check["status"] == expected_check, host_check
PY
}

assert_support_status ubuntu 24.04 amd64 supported
assert_support_status ubuntu 26.04 arm64 supported
assert_support_status debian 12 amd64 supported
assert_support_status debian 13 arm64 supported
assert_support_status raspbian 11 arm64 supported
assert_support_status raspbian 12 arm64 supported
assert_support_status raspbian 13 arm64 supported

assert_support_status ubuntu 22.04 amd64 untested
assert_support_status ubuntu 25.10 amd64 untested
assert_support_status debian 14 arm64 untested
assert_support_status raspbian 14 arm64 untested

assert_support_status raspbian 13 amd64 unsupported
assert_support_status raspbian 13 armhf unsupported
assert_support_status ubuntu 26.04 armhf unsupported

fake_jar="${tmp_dir}/autark-os-backend.jar"
printf 'fake jar for Docker repository mapping\n' >"${fake_jar}"

assert_docker_repository() {
  local os_id="$1"
  local version="$2"
  local architecture="$3"
  local expected_family="$4"
  local expected_codename="$5"
  local fixture="${tmp_dir}/docker-${os_id}-${version}-${architecture}"
  local output
  printf 'ID=%s\nVERSION_ID="%s"\nPRETTY_NAME="%s %s"\n' "${os_id}" "${version}" "${os_id}" "${version}" >"${fixture}"
  output="$(AUTARK_OS_OS_RELEASE_FIXTURE="${fixture}" AUTARK_OS_ARCHITECTURE_FIXTURE="${architecture}" "${repo_root}/scripts/bootstrap-autark-os.sh" --plan --json --release-jar "${fake_jar}")"
  PLAN_JSON="${output}" EXPECTED_FAMILY="${expected_family}" EXPECTED_CODENAME="${expected_codename}" python3 - <<'PY'
import json
import os

policy = json.loads(os.environ["PLAN_JSON"])["dependencyPolicy"]["docker"]
assert policy["repositoryBaseUrl"] == "https://download.docker.com"
assert policy["repositoryFamily"] == os.environ["EXPECTED_FAMILY"], policy
assert policy["repositoryCodename"] == os.environ["EXPECTED_CODENAME"], policy
PY
}

assert_docker_repository debian 12 amd64 debian bookworm
assert_docker_repository debian 13 arm64 debian trixie
assert_docker_repository ubuntu 24.04 amd64 ubuntu noble
assert_docker_repository ubuntu 26.04 arm64 ubuntu resolute
assert_docker_repository raspbian 11 arm64 debian bullseye
assert_docker_repository raspbian 12 arm64 debian bookworm
assert_docker_repository raspbian 13 arm64 debian trixie
