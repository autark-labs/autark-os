#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
script="${repo_root}/scripts/bootstrap-autark-os.sh"

grep -q 'verify_service_health' "${script}"
grep -q '/api/health' "${script}"
grep -q 'write_installer_state "completed" "service-health"' "${script}"
grep -q 'write_installer_state "failed" "service-health"' "${script}"
grep -q 'open_browser_when_available' "${script}"
grep -q 'xdg-open' "${script}"
grep -q 'autark-os support-bundle' "${script}"
