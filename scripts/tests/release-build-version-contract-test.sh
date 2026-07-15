#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

reported_version="$(
  AUTARK_OS_BUILD_VERSION=9.8.7-beta.6 \
    "${repo_root}/backend/gradlew" -q -p "${repo_root}/backend" properties \
    | awk -F': ' '$1 == "version" {print $2; exit}'
)"

[[ "${reported_version}" == "9.8.7-beta.6" ]] || {
  printf 'Expected Gradle release version 9.8.7-beta.6, got %s.\n' "${reported_version}" >&2
  exit 1
}

dry_run_output="$(
  "${repo_root}/scripts/build-release-bundle.sh" \
    --dry-run \
    --version 9.8.7-beta.6 \
    --architecture "$(dpkg --print-architecture)" \
    --output-dir "${repo_root}/release/version-contract-test"
)"

grep -q 'AUTARK_OS_BUILD_VERSION=9.8.7-beta.6' <<<"${dry_run_output}"
grep -q 'clean bootJar' <<<"${dry_run_output}"
