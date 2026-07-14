#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

fake_bin="${tmp_dir}/bin"
sudo_log="${tmp_dir}/sudo.log"
mkdir -p "${fake_bin}"

cat >"${fake_bin}/id" <<'SH'
#!/usr/bin/env bash
if [[ "${1:-}" == "-u" && "${AUTARK_OS_ADMIN_PHASE:-0}" == "1" ]]; then
  printf '0\n'
  exit 0
fi
if [[ "${1:-}" == "-g" && "${AUTARK_OS_ADMIN_PHASE:-0}" == "1" ]]; then
  printf '0\n'
  exit 0
fi
exec /usr/bin/id "$@"
SH

cat >"${fake_bin}/sudo" <<'SH'
#!/usr/bin/env bash
printf 'sudo %s\n' "$*" >>"${AUTARK_OS_FAKE_SUDO_LOG}"
exec "$@"
SH

cat >"${fake_bin}/docker" <<'SH'
#!/usr/bin/env bash
if [[ "${1:-}" == "compose" && "${2:-}" == "version" ]]; then
  printf 'Docker Compose version v2.39.0\n'
  exit 0
fi
if [[ "${1:-}" == "info" ]]; then
  printf 'daemon unavailable for elevation test\n' >&2
  exit 1
fi
exit 1
SH
chmod +x "${fake_bin}/id" "${fake_bin}/sudo" "${fake_bin}/docker"

fake_jar="${tmp_dir}/autark-os-backend.jar"
printf 'fake jar\n' >"${fake_jar}"

set +e
AUTARK_OS_FAKE_SUDO_LOG="${sudo_log}" PATH="${fake_bin}:/usr/bin:/bin" \
  "${repo_root}/scripts/bootstrap-autark-os.sh" \
  --release-jar "${fake_jar}" \
  --runtime-dir "${tmp_dir}/runtime" \
  --install-dir "${tmp_dir}/install" \
  --config-dir "${tmp_dir}/config" \
  --log-dir "${tmp_dir}/logs" \
  --state-dir "${tmp_dir}/state" \
  --port 19095 >"${tmp_dir}/output.log" 2>&1
status=$?
set -e

[[ "${status}" -ne 0 ]]
[[ "$(wc -l <"${sudo_log}")" -eq 1 ]]
grep -q 'Requesting administrator approval once' "${tmp_dir}/output.log"
grep -q 'Autark-OS installation did not complete.' "${tmp_dir}/output.log"
grep -q 'Failed stage: preflight' "${tmp_dir}/output.log"
grep -q "Installer log: ${tmp_dir}/state/installer.log" "${tmp_dir}/output.log"

python3 - "${tmp_dir}/state/installer-state.json" <<'PY'
import json
import sys

state = json.load(open(sys.argv[1], encoding="utf-8"))
assert state["status"] == "failed"
assert state["currentStage"] == "preflight"
assert state["stateDir"].endswith("/state")
PY
