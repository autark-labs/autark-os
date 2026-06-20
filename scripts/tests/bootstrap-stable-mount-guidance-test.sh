#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

fake_jar="${tmp_dir}/project-os-backend.jar"
lsblk_fixture="${tmp_dir}/lsblk.txt"
printf 'fake jar for stable mount guidance test\n' >"${fake_jar}"
cat >"${lsblk_fixture}" <<'LSBLK'
NAME="sda1" TYPE="part" RM="0" SIZE="125000000000" MOUNTPOINT="/" FSTYPE="ext4" TRAN="sata" UUID="ROOT-UUID"
NAME="sdc1" TYPE="part" RM="1" SIZE="500000000000" MOUNTPOINT="/media/jack/Backup Drive" FSTYPE="ext4" TRAN="usb" UUID="MEDIA-UUID"
LSBLK

output="$(PROJECT_OS_LSBLK_FIXTURE="${lsblk_fixture}" "${repo_root}/scripts/bootstrap-project-os.sh" \
  --plan \
  --json \
  --release-jar "${fake_jar}" \
  --runtime-dir "/media/jack/Backup Drive/project-os")"

PLAN_JSON="${output}" python3 - <<'PY'
import json
import os

plan = json.loads(os.environ["PLAN_JSON"])
storage = plan["storage"]

assert storage["runtimePath"] == "/media/jack/Backup Drive/project-os"
assert storage["runtimeMount"]["mountPoint"] == "/media/jack/Backup Drive"
assert storage["runtimeMount"]["stability"] == "unstable"
assert storage["runtimeMount"]["stableMountSuggestion"] == "/mnt/project-os-data"
assert "UUID=MEDIA-UUID" in storage["runtimeMount"]["fstabExample"]
assert any(warning["id"] == "unstable-runtime-mount" for warning in plan["warnings"])
PY
