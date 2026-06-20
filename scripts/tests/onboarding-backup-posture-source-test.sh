#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source_file="${repo_root}/frontend/src/pages/OnboardingPage/OnboardingWizard.tsx"

grep -q "backupPosture" "${source_file}"
grep -q "routine" "${source_file}"
grep -q "external" "${source_file}"
grep -q "later" "${source_file}"
grep -q "validateBackupDestination" "${source_file}"
grep -q "backupDestination:" "${source_file}"
grep -q "Same-device backups" "${source_file}"
grep -q "External backup location" "${source_file}"
grep -q "Configure backups later" "${source_file}"
