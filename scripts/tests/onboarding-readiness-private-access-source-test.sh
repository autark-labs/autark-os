#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
onboarding_file="${repo_root}/frontend/src/pages/OnboardingPage/OnboardingWizard.tsx"
network_file="${repo_root}/frontend/src/pages/NetworkPage/NetworkPage.tsx"
tailscale_setup_file="${repo_root}/frontend/src/pages/NetworkPage/extensions/NetworkPage.tailscaleSetup.ts"
setup_service_file="${repo_root}/backend/src/main/java/com/autarkos/system/SystemSetupService.java"

grep -q "readiness.canCompleteOnboarding" "${onboarding_file}"
grep -q "Finish anyway" "${onboarding_file}"
grep -q "privateAccessChoice" "${onboarding_file}"
grep -q "Set up private access now" "${onboarding_file}"
grep -q "Use local-only for now" "${onboarding_file}"
grep -q "I already use Tailscale" "${onboarding_file}"
grep -q "accessGroup?.message" "${onboarding_file}"
grep -q "tailscale up" "${setup_service_file}"
grep -q "PrivateAccessSetupPath" "${network_file}"
grep -q "Tailscale Serve permission" "${tailscale_setup_file}"
