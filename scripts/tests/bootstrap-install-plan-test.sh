#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

fake_jar="${tmp_dir}/autark-os-backend.jar"
printf 'fake jar for install plan test\n' >"${fake_jar}"

output="$("${repo_root}/scripts/bootstrap-autark-os.sh" \
  --plan \
  --json \
  --release-jar "${fake_jar}" \
  --runtime-dir /tmp/autark-os-runtime \
  --install-dir /tmp/autark-os-install \
  --config-dir /tmp/autark-os-config \
  --log-dir /tmp/autark-os-logs \
  --port 9090)"

PLAN_JSON="${output}" python3 - "${fake_jar}" <<'PY'
import json
import os
import sys

fake_jar = sys.argv[1]
plan = json.loads(os.environ["PLAN_JSON"])

assert plan["schemaVersion"] == 1
assert plan["mode"] == "release-jar"
assert plan["audience"] == "advanced-cli"
assert plan["service"]["port"] == 9090
assert plan["paths"]["runtimeDir"] == "/tmp/autark-os-runtime"
assert plan["paths"]["installDir"] == "/tmp/autark-os-install"
assert plan["paths"]["configDir"] == "/tmp/autark-os-config"
assert plan["paths"]["logDir"] == "/tmp/autark-os-logs"
assert plan["artifact"]["backendJar"] == fake_jar
assert "install Autark-OS system service" in plan["actions"]
assert any(dep["name"] == "Java" for dep in plan["dependencies"])
assert any(warning["id"] == "confirm-host-mutation" for warning in plan["warnings"])
assert plan["blockers"] == []
PY
