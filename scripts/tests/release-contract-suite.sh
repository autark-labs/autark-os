#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${repo_root}"

contracts=(
  scripts/tests/release-runner-portability-test.sh
  scripts/tests/release-workflow-contract-test.sh
  scripts/tests/release-source-map-contract-test.sh
  scripts/tests/release-architecture-integrity-test.sh
  scripts/tests/release-bundle-contract-test.sh
  scripts/tests/release-runtime-smoke-test.sh
  scripts/tests/release-artifacts-dry-run-test.sh
  scripts/tests/supported-host-matrix-contract-test.sh
  scripts/tests/autark-os-update-delivery-test.sh
  scripts/tests/autark-os-unified-update-flow-test.sh
  scripts/tests/autark-os-update-helper-test.sh
  scripts/tests/autark-os-safe-uninstall-flow-test.sh
  scripts/tests/autark-os-cli-admin-session-test.sh
  scripts/tests/autark-os-admin-recovery-test.sh
  scripts/tests/autark-os-pro-identity-recovery-test.sh
  scripts/tests/autark-os-installer-support-bundle-test.sh
  scripts/tests/service-hardening-contract-test.sh
  scripts/tests/service-hardening-drift-test.sh
)

for contract in "${contracts[@]}"; do
  printf '::group::Release contract: %s\n' "${contract}"
  if bash "${contract}"; then
    printf 'Release contract passed: %s\n' "${contract}"
    printf '::endgroup::\n'
  else
    status=$?
    printf '::error file=%s::Release contract failed with exit code %s: %s\n' \
      "${contract}" "${status}" "${contract}" >&2
    printf '::endgroup::\n'
    exit "${status}"
  fi
done

printf 'All release contracts passed.\n'
