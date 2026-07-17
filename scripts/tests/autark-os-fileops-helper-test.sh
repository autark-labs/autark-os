#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

runtime_root="${tmp_dir}/runtime"
backup_root="${runtime_root}/backups"
app_root="${runtime_root}/apps/home-assistant"
archive="${backup_root}/full/restore.zip"
safety="${backup_root}/pre-restore/home-assistant.zip"
full_archive="${backup_root}/full/new-full.zip"

mkdir -p "${app_root}/old" "${backup_root}/full" "${backup_root}/pre-restore"
printf 'old\n' >"${app_root}/old/file.txt"

python3 - "${archive}" <<'PY'
import sys
import zipfile

with zipfile.ZipFile(sys.argv[1], "w") as archive:
    archive.writestr("home-assistant/config/configuration.yaml", "default_config:\n")
    archive.writestr("grafana/config.ini", "ignored=true\n")
PY

"${repo_root}/scripts/autark-os-fileops" restore-app-data \
  --runtime-root "${runtime_root}" \
  --backup-root "${backup_root}" \
  --app home-assistant \
  --archive "${archive}" \
  --scope full >/dev/null

[[ ! -e "${app_root}/old/file.txt" ]]
grep -q 'default_config' "${app_root}/config/configuration.yaml"
[[ ! -e "${app_root}/grafana/config.ini" ]]

"${repo_root}/scripts/autark-os-fileops" create-safety-archive \
  --runtime-root "${runtime_root}" \
  --backup-root "${backup_root}" \
  --app home-assistant \
  --destination "${safety}" >/dev/null

unzip -l "${safety}" | grep -q 'config/configuration.yaml'

mkdir -p "${runtime_root}/apps/grafana"
printf 'grafana\n' >"${runtime_root}/apps/grafana/config.ini"
"${repo_root}/scripts/autark-os-fileops" create-full-archive \
  --runtime-root "${runtime_root}" \
  --backup-root "${backup_root}" \
  --apps home-assistant,grafana \
  --destination "${full_archive}" >/dev/null

unzip -l "${full_archive}" | grep -q 'home-assistant/config/configuration.yaml'
unzip -l "${full_archive}" | grep -q 'grafana/config.ini'

if "${repo_root}/scripts/autark-os-fileops" delete-backup \
  --runtime-root "${runtime_root}" \
  --backup-root "${backup_root}" \
  --path "${tmp_dir}/outside.zip" >/tmp/autark-os-fileops-out.txt 2>&1; then
  echo "expected outside backup deletion to fail" >&2
  exit 1
fi
grep -q 'must stay under' /tmp/autark-os-fileops-out.txt

"${repo_root}/scripts/autark-os-fileops" delete-backup \
  --runtime-root "${runtime_root}" \
  --backup-root "${backup_root}" \
  --path "${safety}" >/dev/null
[[ ! -e "${safety}" ]]

python3 - "${repo_root}/scripts/autark-os-fileops" "${tmp_dir}" <<'PY'
import argparse
import importlib.machinery
import importlib.util
from pathlib import Path
import subprocess
import sys
from unittest.mock import patch

sys.dont_write_bytecode = True
script_path = Path(sys.argv[1])
fake_tailscale = Path(sys.argv[2]) / "tailscale"
fake_tailscale.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
fake_tailscale.chmod(0o755)

loader = importlib.machinery.SourceFileLoader("autark_os_fileops", str(script_path))
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)

completed = subprocess.CompletedProcess([], 0, stdout="", stderr="")
with patch.object(module, "TRUSTED_TAILSCALE_PATHS", (fake_tailscale,)), patch.object(module.subprocess, "run", return_value=completed) as run:
    module.configure_tailscale_operator(argparse.Namespace())

run.assert_called_once_with(
    [str(fake_tailscale), "set", "--operator=autarkos"],
    check=False,
    capture_output=True,
    text=True,
    env={"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "HOME": "/root", "LANG": "C"},
)

runtime = Path(sys.argv[2]) / "runtime"
internal = runtime / "backups"
external = Path(sys.argv[2]) / "external-backups"
runtime.mkdir(parents=True, exist_ok=True)
external.mkdir(exist_ok=True)
module.DESTINATION_CONFIG = Path(sys.argv[2]) / "backup-destination.env"
module.RUNTIME_CONFIG = Path(sys.argv[2]) / "autark-os.env"
module.DESTINATION_CONFIG.write_text(
    f"BACKUP_DESTINATION_PATH={external}\nBACKUP_DESTINATION_MOUNT_IDENTITY=external-drive\n",
    encoding="utf-8",
)

approved_args = argparse.Namespace(runtime_root=runtime, backup_root=external)
with patch.object(module, "mount_identity", return_value="external-drive"):
    assert module.approved_backup_root(approved_args) == external.resolve()

with patch.object(module, "mount_identity", return_value="replacement-drive"):
    try:
        module.approved_backup_root(approved_args)
        raise AssertionError("expected a swapped external drive to be rejected")
    except SystemExit as error:
        assert error.code == 1

module.RUNTIME_CONFIG.write_text(
    f"AUTARK_OS_RUNTIME_ROOT={runtime}\n",
    encoding="utf-8",
)
assert module.require_configured_runtime_root(runtime.resolve()) == runtime.resolve()
try:
    module.require_configured_runtime_root(Path(sys.argv[2]) / "another-runtime")
    raise AssertionError("expected a non-installed runtime root to be rejected")
except SystemExit as error:
    assert error.code == 1

with patch.object(module, "mount_identity", return_value="external-drive"):
    try:
        module.approved_backup_root(argparse.Namespace(runtime_root=runtime, backup_root=Path(sys.argv[2]) / "arbitrary"))
        raise AssertionError("expected an arbitrary backup root to be rejected")
    except SystemExit as error:
        assert error.code == 1

module.configure_backup_destination(argparse.Namespace(runtime_root=runtime, destination=internal, history_root=[]))
saved = module.read_destination_config()
assert saved.get("BACKUP_DESTINATION_PATH", "") == ""
assert str(external.resolve()) in saved.get("BACKUP_DESTINATION_HISTORY", "")

# A root helper must not follow an app-folder symlink outside the runtime.
outside = Path(sys.argv[2]) / "outside-app"
outside.mkdir(exist_ok=True)
(runtime / "apps").mkdir(exist_ok=True)
link = runtime / "apps" / "escaped"
link.symlink_to(outside, target_is_directory=True)
try:
    module.app_root(argparse.Namespace(runtime_root=runtime, app="escaped"))
    raise AssertionError("expected a symlinked app folder to be rejected")
except SystemExit as error:
    assert error.code == 1

try:
    module.repair_runtime_ownership(argparse.Namespace(runtime_root=runtime, app="home-assistant", user="root", group="root"))
    raise AssertionError("expected arbitrary ownership repair to be rejected")
except SystemExit as error:
    assert error.code == 1
PY
