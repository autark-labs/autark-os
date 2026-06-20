#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
onboarding_file="${repo_root}/frontend/src/pages/OnboardingPage/OnboardingWizard.tsx"
network_file="${repo_root}/frontend/src/pages/NetworkPage/NetworkPage.tsx"

grep -q "readiness.canCompleteOnboarding" "${onboarding_file}"
grep -q "Finish anyway" "${onboarding_file}"
grep -q "privateAccessChoice" "${onboarding_file}"
grep -q "Set up private access now" "${onboarding_file}"
grep -q "Use local-only for now" "${onboarding_file}"
grep -q "I already use Tailscale" "${onboarding_file}"
grep -q "tailscale up" "${onboarding_file}"
grep -q "PrivateAccessSetupPath" "${network_file}"
grep -q "Tailscale Serve permission" "${network_file}"
