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

grep -E -q -- 'sudo apt install \./autark-os_<version>_amd64\.deb' docs/non-technical-install-guide.md
grep -E -q -- 'autark-os doctor' docs/troubleshooting.md
grep -E -q -- 'autark-os support-bundle --output ./autark-os-support\.tar\.gz' docs/non-technical-install-guide.md
grep -E -q -- '\*\*Discover\*\*' docs/first-run.md
grep -E -q -- '\*\*My Apps\*\*' docs/first-run.md
grep -E -q -- '\*\*Access\*\*' docs/non-technical-install-guide.md
grep -E -q -- '\*\*Backups\*\*' docs/backups-and-recovery.md
grep -E -q -- '\*\*Diagnostics\*\*' docs/troubleshooting.md
grep -E -q -- 'autark-os support-bundle' SUPPORT.md
grep -E -q -- 'private vulnerability reporting' SECURITY.md
grep -E -q -- 'autark-os update' docs/getting-started.md
grep -E -q -- 'autark-os uninstall --plan' docs/getting-started.md
grep -E -q -- 'currently applies image-only catalog releases' docs/getting-started.md
grep -E -q -- 'Update or roll back a managed app' docs/maintenance.md
grep -E -q -- 'creates and verifies a safety checkpoint' docs/maintenance.md
grep -E -q -- 'Managed app updates currently support image-only catalog releases' README.md
grep -E -q -- 'Managed app health verification is conservative during beta' README.md
grep -E -q -- 'Managed-app updates currently support image-only catalog releases' scripts/build-release-bundle.sh
grep -E -q -- 'Autark-OS does not claim that backups are encrypted' docs/getting-started.md
grep -E -q -- 'personal and non-commercial use' docs/getting-started.md
grep -E -q -- 'THIRD_PARTY_COMPONENTS.txt' docs/third-party-notices.md
! grep -R -n -E -- 'Managed application updates are currently unavailable|keeps managed app updates disabled until' README.md docs SUPPORT.md scripts/build-release-bundle.sh backend/src/main/java
! grep -R -n -E -- 'autarklabs\.local' README.md docs SUPPORT.md SECURITY.md scripts/build-release-artifacts.sh
! grep -R -n -E -- 'Marketplace|\*\*Applications\*\*|Generate support bundle|GUI and one-command installer flow' README.md docs/non-technical-install-guide.md docs/first-run.md docs/offline-install.md docs/backups-and-recovery.md docs/maintenance.md docs/technical-installation.md docs/troubleshooting.md
