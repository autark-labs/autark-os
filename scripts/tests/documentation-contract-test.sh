#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

for file in docs/non-technical-install-guide.md docs/first-run.md docs/offline-install.md docs/backups-and-recovery.md docs/maintenance.md docs/technical-installation.md docs/troubleshooting.md; do
  test -f "$file"
done
for file in SUPPORT.md SECURITY.md docs/getting-started.md docs/third-party-notices.md; do
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
rg -q 'autark-os support-bundle' SUPPORT.md
rg -q 'private vulnerability reporting' SECURITY.md
rg -q 'autark-os update' docs/getting-started.md
rg -q 'autark-os uninstall --plan' docs/getting-started.md
rg -q 'currently applies image-only catalog releases' docs/getting-started.md
rg -q 'Update or roll back a managed app' docs/maintenance.md
rg -q 'creates and verifies a safety checkpoint' docs/maintenance.md
rg -q 'Managed app updates currently support image-only catalog releases' README.md
rg -q 'Managed app health verification is conservative during beta' README.md
rg -q 'Managed-app updates currently support image-only catalog releases' scripts/build-release-bundle.sh
rg -q 'Autark-OS does not claim that backups are encrypted' docs/getting-started.md
rg -q 'personal and non-commercial use' docs/getting-started.md
rg -q 'THIRD_PARTY_COMPONENTS.txt' docs/third-party-notices.md
! rg -n 'Managed application updates are currently unavailable|keeps managed app updates disabled until' README.md docs SUPPORT.md scripts/build-release-bundle.sh backend/src/main/java
! rg -n 'autarklabs\.local' README.md docs SUPPORT.md SECURITY.md scripts/build-release-artifacts.sh
! rg -n 'Marketplace|\*\*Applications\*\*|Generate support bundle|GUI and one-command installer flow' README.md docs/non-technical-install-guide.md docs/first-run.md docs/offline-install.md docs/backups-and-recovery.md docs/maintenance.md docs/technical-installation.md docs/troubleshooting.md
