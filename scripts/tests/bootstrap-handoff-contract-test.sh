#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
script="${repo_root}/scripts/bootstrap-autark-os.sh"

grep -q 'verify_service_health' "${script}"
grep -q '/api/health' "${script}"
grep -q 'begin_install_stage "service-health"' "${script}"
grep -q 'complete_install_stage "service-health"' "${script}"
grep -Fq 'write_installer_state "completed" "${LAST_COMPLETED_STAGE}"' "${script}"
grep -q 'report_install_failure' "${script}"
grep -q 'open_browser_when_available' "${script}"
grep -q 'xdg-open' "${script}"
grep -q 'autark-os support-bundle' "${script}"
