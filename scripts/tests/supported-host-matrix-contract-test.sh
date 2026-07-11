#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
matrix="${repo_root}/scripts/supported-host-matrix.env"
[[ -r "${matrix}" ]]
source "${matrix}"
[[ "${AUTARK_OS_SUPPORTED_DEBIAN_VERSIONS}" == *"12"* ]]
[[ "${AUTARK_OS_SUPPORTED_UBUNTU_VERSIONS}" == *"24.04"* ]]
[[ "${AUTARK_OS_MIN_MEMORY_MB}" == "2048" ]]
[[ "${AUTARK_OS_MIN_DISK_KB}" == "10485760" ]]

fixture="$(mktemp)"
trap 'rm -f "${fixture}"' EXIT
printf 'ID=ubuntu\nVERSION_ID="20.04"\nPRETTY_NAME="Ubuntu 20.04"\n' >"${fixture}"
output="$(AUTARK_OS_OS_RELEASE_FIXTURE="${fixture}" "${repo_root}/scripts/bootstrap-autark-os.sh" --doctor --json)"
DOCTOR_JSON="${output}" python3 - <<'PY'
import json, os
doctor = json.loads(os.environ['DOCTOR_JSON'])
assert doctor['host']['supportStatus'] == 'untested'
assert any(item['id'] == 'host-matrix' and item['status'] == 'warning' for item in doctor['checks'])
PY
