#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

artifacts_dir="${tmp_dir}/artifacts"
output="$("${repo_root}/scripts/build-release-artifacts.sh" \
  --dry-run \
  --skip-build \
  --version 9.8.7 \
  --channel beta \
  --architecture amd64 \
  --release-notes-url https://example.invalid/autark-os/9.8.7 \
  --output-dir "${artifacts_dir}")"

grep -q 'Would build release artifacts' <<<"${output}"
grep -q 'build-release-bundle.sh' <<<"${output}"
grep -q -- '--architecture amd64' <<<"${output}"
grep -q 'autark-os-9.8.7-amd64.tar.gz' <<<"${output}"
grep -q 'autark-os_9.8.7_amd64.deb' <<<"${output}"
grep -q 'Autark-OS-Installer-9.8.7-amd64.run' <<<"${output}"
grep -q 'SHA256SUMS' <<<"${output}"

[[ ! -e "${artifacts_dir}" ]]
