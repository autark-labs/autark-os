#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
jar_dir="${repo_root}/backend/build/libs"
fake_jar="${jar_dir}/autark-os-backend-public-installer-test.jar"
trap 'rm -rf "${tmp_dir}"; rm -f "${fake_jar}"' EXIT

mkdir -p "${jar_dir}"
printf 'fake jar for public installer test\n' >"${fake_jar}"

bundle_dir="${tmp_dir}/autark-os-2.0.0"
"${repo_root}/scripts/build-release-bundle.sh" \
  --skip-build \
  --version 2.0.0 \
  --channel stable \
  --release-notes-url https://example.invalid/autark-os/2.0.0 \
  --output-dir "${bundle_dir}" >/dev/null

output="$("${repo_root}/scripts/install-autark-os.sh" \
  --release-url "file://${bundle_dir}" \
  --dry-run \
  --yes \
  --runtime-dir "${tmp_dir}/runtime" \
  --port 9191)"

grep -q 'Autark-OS public installer' <<<"${output}"
grep -q 'Release version: 2.0.0' <<<"${output}"
grep -q 'Release channel: stable' <<<"${output}"
grep -q 'Verifying release checksums' <<<"${output}"
grep -q 'Autark-OS install plan' <<<"${output}"
grep -q "Runtime data: ${tmp_dir}/runtime" <<<"${output}"
grep -q 'Port: 9191' <<<"${output}"
