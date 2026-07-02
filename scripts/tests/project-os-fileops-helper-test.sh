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

"${repo_root}/scripts/project-os-fileops" restore-app-data \
  --runtime-root "${runtime_root}" \
  --backup-root "${backup_root}" \
  --app home-assistant \
  --archive "${archive}" \
  --scope full >/dev/null

[[ ! -e "${app_root}/old/file.txt" ]]
grep -q 'default_config' "${app_root}/config/configuration.yaml"
[[ ! -e "${app_root}/grafana/config.ini" ]]

"${repo_root}/scripts/project-os-fileops" create-safety-archive \
  --runtime-root "${runtime_root}" \
  --backup-root "${backup_root}" \
  --app home-assistant \
  --destination "${safety}" >/dev/null

unzip -l "${safety}" | grep -q 'config/configuration.yaml'

mkdir -p "${runtime_root}/apps/grafana"
printf 'grafana\n' >"${runtime_root}/apps/grafana/config.ini"
"${repo_root}/scripts/project-os-fileops" create-full-archive \
  --runtime-root "${runtime_root}" \
  --backup-root "${backup_root}" \
  --apps home-assistant,grafana \
  --destination "${full_archive}" >/dev/null

unzip -l "${full_archive}" | grep -q 'home-assistant/config/configuration.yaml'
unzip -l "${full_archive}" | grep -q 'grafana/config.ini'

if "${repo_root}/scripts/project-os-fileops" delete-backup \
  --runtime-root "${runtime_root}" \
  --backup-root "${backup_root}" \
  --path "${tmp_dir}/outside.zip" >/tmp/project-os-fileops-out.txt 2>&1; then
  echo "expected outside backup deletion to fail" >&2
  exit 1
fi
grep -q 'must stay under' /tmp/project-os-fileops-out.txt

"${repo_root}/scripts/project-os-fileops" delete-backup \
  --runtime-root "${runtime_root}" \
  --backup-root "${backup_root}" \
  --path "${safety}" >/dev/null
[[ ! -e "${safety}" ]]
