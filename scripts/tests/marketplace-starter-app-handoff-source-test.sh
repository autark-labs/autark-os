#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source_file="${repo_root}/frontend/src/pages/MarketplacePage/MarketplacePage.tsx"

grep -q "Start with these apps" "${source_file}"
grep -q "recommendedApps" "${source_file}"
grep -q "SystemAPIClient.onboarding" "${source_file}"
grep -q "SystemAPIClient.doctor" "${source_file}"
grep -q "selectRecommendedApp" "${source_file}"
grep -q "Docker setup is needed first" "${source_file}"
grep -q "Private access can wait" "${source_file}"
grep -q "lightweight" "${source_file}"
