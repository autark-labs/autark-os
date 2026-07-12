#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

for file in docs/non-technical-install-guide.md docs/first-run.md docs/offline-install.md docs/backups-and-recovery.md docs/maintenance.md docs/troubleshooting.md; do
  test -f "$file"
done

rg -q 'sudo apt install \./autark-os_<version>_amd64\.deb' docs/non-technical-install-guide.md
rg -q 'autark-os doctor' docs/troubleshooting.md
rg -q 'autark-os support-bundle --output ./autark-os-support\.tar\.gz' docs/non-technical-install-guide.md
rg -q '\*\*Discover\*\*' docs/first-run.md
rg -q '\*\*My Apps\*\*' docs/first-run.md
rg -q '\*\*Access\*\*' docs/non-technical-install-guide.md
rg -q '\*\*Backups\*\*' docs/backups-and-recovery.md
rg -q '\*\*Diagnostics\*\*' docs/troubleshooting.md
! rg -n 'Marketplace|\*\*Applications\*\*|Generate support bundle|GUI and one-command installer flow' README.md docs/non-technical-install-guide.md docs/first-run.md docs/offline-install.md docs/backups-and-recovery.md docs/maintenance.md docs/troubleshooting.md docs/beta-installation.md
