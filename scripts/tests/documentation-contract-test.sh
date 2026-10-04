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
grep -E -q -- 'New managed-app updates are deferred for the controlled beta' docs/getting-started.md
grep -E -q -- 'Managed app changes during beta' docs/maintenance.md
grep -z -E -q -- 'Existing release snapshots and rollback records remain available as recovery[[:space:]]+evidence' docs/maintenance.md
grep -E -q -- 'New managed-app updates are deferred during beta' README.md
grep -E -q -- 'New managed-app updates are deferred during the controlled beta' scripts/build-release-bundle.sh
grep -E -q -- 'Autark-OS does not claim that backups are encrypted' docs/getting-started.md
grep -F -q -- 'Personal and internal business use' docs/getting-started.md
grep -F -q -- 'independent paid installation/support are permitted' docs/getting-started.md
grep -F -q -- 'not OSI-approved open source' docs/getting-started.md
grep -F -q -- '# Autark Community License (ACL) v2.0' LICENSE.md
grep -F -q -- '## Commons Clause License Condition v1.0' LICENSE.md
grep -F -q -- '## Apache License, Version 2.0' LICENSE.md
grep -F -q -- '### 2. Community distribution and independent services' LICENSE.md
grep -F -q -- '### 3. Reserved product-distribution and hosted-service rights' LICENSE.md
grep -F -q -- 'Third-party applications and dependencies keep their own licenses' COMMERCIAL-LICENSE.md
if grep -n -E -- 'personal and non-commercial use|ACL\) v1\.0|Commercial rights remain exclusively reserved' LICENSE.md COMMERCIAL-LICENSE.md README.md docs/getting-started.md scripts/build-release-artifacts.sh; then
  printf 'Obsolete CE licensing language remains.\n' >&2
  exit 1
fi
grep -E -q -- 'THIRD_PARTY_COMPONENTS.txt' docs/third-party-notices.md
! grep -R -n -E -- 'image-only catalog releases|eligible managed-app image updates|Review update' README.md docs SUPPORT.md scripts/build-release-bundle.sh backend/src/main/java
! grep -R -n -E -- 'autarklabs\.local' README.md docs SUPPORT.md SECURITY.md scripts/build-release-artifacts.sh
! grep -R -n -E -- 'Marketplace|\*\*Applications\*\*|Generate support bundle|GUI and one-command installer flow' README.md docs/non-technical-install-guide.md docs/first-run.md docs/offline-install.md docs/backups-and-recovery.md docs/maintenance.md docs/technical-installation.md docs/troubleshooting.md
