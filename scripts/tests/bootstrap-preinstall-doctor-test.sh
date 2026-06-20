#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

fake_jar="${tmp_dir}/project-os-backend.jar"
printf 'fake jar for doctor test\n' >"${fake_jar}"

output="$("${repo_root}/scripts/bootstrap-project-os.sh" \
  --doctor \
  --json \
  --release-jar "${fake_jar}" \
  --runtime-dir "${tmp_dir}/runtime" \
  --port 9091)"

DOCTOR_JSON="${output}" python3 - <<'PY'
import json
import os

doctor = json.loads(os.environ["DOCTOR_JSON"])

assert doctor["schemaVersion"] == 1
assert doctor["status"] in {"ready", "ready_with_notes", "blocked"}
assert doctor["host"]["architecture"]
assert doctor["runtime"]["path"].endswith("/runtime")
assert doctor["service"]["port"] == 9091
assert any(check["id"] == "os" for check in doctor["checks"])
assert any(check["id"] == "systemd" for check in doctor["checks"])
assert any(check["id"] == "sudo" for check in doctor["checks"])
assert any(check["id"] == "internet" for check in doctor["checks"])
assert any(check["id"] == "runtime-storage" for check in doctor["checks"])
assert any(check["id"] == "port" for check in doctor["checks"])
assert "recommendedNextAction" in doctor
PY
