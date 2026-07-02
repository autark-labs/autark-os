#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source_file="${repo_root}/frontend/src/pages/MarketplacePage/MarketplacePage.tsx"
repository_file="${repo_root}/frontend/src/repositories/discoverRepository.ts"
logic_file="${repo_root}/frontend/src/pages/MarketplacePage/extensions/MarketplacePage.logic.js"

grep -q "Start with these apps" "${source_file}"
grep -q "starterRecommendations" "${source_file}"
grep -q "useDiscoverReadinessQuery" "${source_file}"
grep -q "selectRecommendedApp" "${source_file}"
grep -q "SystemAPIClient.onboarding" "${repository_file}"
grep -q "useSystemDoctorQuery" "${repository_file}"
grep -q "recommendedApps" "${logic_file}"
grep -q "Docker setup is needed first" "${logic_file}"
grep -q "Private access can wait" "${logic_file}"
grep -q "lightweight" "${logic_file}"
