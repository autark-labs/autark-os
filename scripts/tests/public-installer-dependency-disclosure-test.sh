#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
jar_dir="${repo_root}/backend/build/libs"
fake_jar="${jar_dir}/project-os-backend-dependency-disclosure-test.jar"
trap 'rm -rf "${tmp_dir}"; rm -f "${fake_jar}"' EXIT

mkdir -p "${jar_dir}"
printf 'fake jar for dependency disclosure test\n' >"${fake_jar}"

bundle_dir="${tmp_dir}/project-os-2.1.1"
"${repo_root}/scripts/build-release-bundle.sh" \
  --skip-build \
  --version 2.1.1 \
  --channel stable \
  --release-notes-url https://example.invalid/project-os/2.1.1 \
  --output-dir "${bundle_dir}" >/dev/null

output="$("${repo_root}/scripts/install-project-os.sh" \
  --release-url "file://${bundle_dir}" \
  --dry-run \
  --yes \
  --runtime-dir "${tmp_dir}/runtime" \
  --port 9292)"

grep -q 'Dependency and host-change disclosure' <<<"${output}"
grep -q 'Safe package-manager installs' <<<"${output}"
grep -q 'External installer scripts' <<<"${output}"
grep -q 'Docker convenience script' <<<"${output}"
grep -q 'Tailscale install script' <<<"${output}"
grep -q 'Services and permissions that may change' <<<"${output}"
grep -q 'Recovery and rollback notes' <<<"${output}"
grep -q 'Inspect service status: project-os status' <<<"${output}"
