#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
jar_dir="${repo_root}/backend/build/libs"
fake_jar="${jar_dir}/autark-os-backend-dependency-disclosure-test.jar"
trap 'rm -rf "${tmp_dir}"; rm -f "${fake_jar}"' EXIT

python3 "${repo_root}/scripts/tests/create-release-test-jar.py" \
  --output "${fake_jar}" \
  --version 2.1.1 \
  --build-sha dependency-disclosure-sha

bundle_dir="${tmp_dir}/autark-os-2.1.1"
AUTARK_OS_BACKEND_JAR="${fake_jar}" AUTARK_OS_BUILD_SHA=dependency-disclosure-sha "${repo_root}/scripts/build-release-bundle.sh" \
  --skip-build \
  --version 2.1.1 \
  --channel stable \
  --release-notes-url https://example.invalid/autark-os/2.1.1 \
  --output-dir "${bundle_dir}" >/dev/null

output="$("${repo_root}/scripts/install-autark-os.sh" \
  --release-url "file://${bundle_dir}" \
  --dry-run \
  --yes \
  --runtime-dir "${tmp_dir}/runtime" \
  --port 9292)"

grep -q 'Dependency and host-change disclosure' <<<"${output}"
grep -q 'Safe package-manager installs' <<<"${output}"
grep -q 'Trusted package source' <<<"${output}"
grep -q "Docker's official apt repository" <<<"${output}"
grep -q 'never removed or replaced automatically' <<<"${output}"
grep -q 'Tailscale is not installed, signed in, or reconfigured' <<<"${output}"
grep -q 'Services and permissions that may change' <<<"${output}"
grep -q 'Recovery and rollback notes' <<<"${output}"
grep -q 'Inspect service status: autark-os status' <<<"${output}"
