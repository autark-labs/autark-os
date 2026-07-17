#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
workflow="${repo_root}/.github/workflows/release.yml"
[[ -r "${workflow}" ]]

grep -q '^  workflow_dispatch:' "${workflow}"
grep -q '^  push:' "${workflow}"
grep -q 'ubuntu-24.04-arm' "${workflow}"
grep -q 'architecture: amd64' "${workflow}"
grep -q 'architecture: arm64' "${workflow}"
grep -q 'actions/upload-artifact@v6' "${workflow}"
grep -q 'actions/download-artifact@v8' "${workflow}"
grep -q 'compose-release-manifest.py compose' "${workflow}"
grep -q 'compose-release-manifest.py validate' "${workflow}"
grep -q 'autark-os-cli-admin-session-test.sh' "${workflow}"
grep -q 'autark-os-admin-recovery-test.sh' "${workflow}"
grep -q 'autark-os-installer-support-bundle-test.sh' "${workflow}"
grep -q 'contents: write' "${workflow}"
grep -q "needs.prepare.outputs.mode == 'draft'" "${workflow}"
grep -q 'environment:.*installer-stable.*installer-beta' "${workflow}"
grep -q 'gh release view' "${workflow}"
grep -q 'gh release create' "${workflow}"
grep -q -- '--draft' "${workflow}"
grep -q 'Published versions are immutable' "${workflow}"
grep -q 'AUTARK_OS_BUILD_VERSION: \${{ needs.prepare.outputs.version }}' "${workflow}"
grep -q 'AUTARK_OS_BUILD_SHA: \${{ github.sha }}' "${workflow}"
grep -q 'AUTARK_OS_BUILD_DATE: \${{ needs.prepare.outputs.published_at }}' "${workflow}"
grep -q 'assert manifest\["buildSha"\] == "\${GITHUB_SHA}"' "${workflow}"

if grep -q -- '--clobber' "${workflow}"; then
  printf 'Release workflow must never overwrite existing release assets.\n' >&2
  exit 1
fi

python3 - "${workflow}" <<'PY'
import pathlib
import sys

workflow = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
assert workflow.count("contents: write") == 1
assert "mode:\n        description: Rehearse only or create a draft GitHub Release" in workflow
assert "- rehearsal\n          - draft" in workflow
assert "release-ready/*" in workflow
assert "SHA256SUMS" in workflow
PY
