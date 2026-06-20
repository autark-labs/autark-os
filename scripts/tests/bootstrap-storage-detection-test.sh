#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

fake_jar="${tmp_dir}/project-os-backend.jar"
lsblk_fixture="${tmp_dir}/lsblk.txt"
printf 'fake jar for storage detection test\n' >"${fake_jar}"
cat >"${lsblk_fixture}" <<'LSBLK'
NAME="sda1" TYPE="part" RM="0" SIZE="125000000000" MOUNTPOINT="/" FSTYPE="ext4" TRAN="sata" UUID="ROOT-UUID"
NAME="sdb1" TYPE="part" RM="0" SIZE="1000000000000" MOUNTPOINT="/mnt/project-os-ssd" FSTYPE="ext4" TRAN="usb" UUID="SSD-UUID"
LSBLK

output="$(PROJECT_OS_LSBLK_FIXTURE="${lsblk_fixture}" "${repo_root}/scripts/bootstrap-project-os.sh" \
  --plan \
  --json \
  --release-jar "${fake_jar}")"

PLAN_JSON="${output}" python3 - <<'PY'
import json
import os

plan = json.loads(os.environ["PLAN_JSON"])
storage = plan["storage"]

assert storage["runtimePath"] == "/var/lib/project-os"
assert storage["recommendation"]["path"] == "/mnt/project-os-ssd/project-os"
assert storage["recommendation"]["classification"] == "usb-ssd"
assert storage["recommendation"]["risk"] == "low"
assert storage["recommendation"]["mountPoint"] == "/mnt/project-os-ssd"
assert any(candidate["mountPoint"] == "/mnt/project-os-ssd" for candidate in storage["candidates"])
PY
