#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
jar_dir="${repo_root}/backend/build/libs"
fake_jar="${jar_dir}/autark-os-backend-guided-installer-test.jar"
trap 'rm -rf "${tmp_dir}"; rm -f "${fake_jar}"' EXIT

python3 "${repo_root}/scripts/tests/create-release-test-jar.py" \
  --output "${fake_jar}" \
  --version 2.1.0 \
  --build-sha guided-installer-sha

bundle_dir="${tmp_dir}/autark-os-2.1.0"
AUTARK_OS_BACKEND_JAR="${fake_jar}" AUTARK_OS_BUILD_SHA=guided-installer-sha "${repo_root}/scripts/build-release-bundle.sh" \
  --skip-build \
  --version 2.1.0 \
  --channel stable \
  --release-notes-url https://example.invalid/autark-os/2.1.0 \
  --output-dir "${bundle_dir}" >/dev/null

output="$(printf '\n\n\n\n\n' | "${repo_root}/scripts/install-autark-os.sh" \
  --release-url "file://${bundle_dir}" \
  --dry-run)"

grep -q 'Guided setup' <<<"${output}"
grep -q 'Use recommended settings' <<<"${output}"
grep -q 'Runtime data:' <<<"${output}"
grep -q 'Private access: configure later' <<<"${output}"
grep -q 'Start after install: yes' <<<"${output}"
grep -q 'Autark-OS install plan' <<<"${output}"
