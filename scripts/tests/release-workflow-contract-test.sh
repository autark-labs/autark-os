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
grep -q 'release-workflow-contract-test.sh' "${workflow}"
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
grep -q 'expected_build_sha = sys.argv\[3\]' "${workflow}"
grep -q 'expected_build_date = sys.argv\[4\]' "${workflow}"
grep -q 'docs/GETTING_STARTED.md' "${workflow}"
grep -q '/usr/share/doc/autark-os/GETTING_STARTED.md' "${workflow}"
grep -Fq 'dpkg-deb -c "${artifact_dir}/autark-os_${VERSION}_${ARCHITECTURE}.deb" >"${deb_contents}"' "${workflow}"
grep -Fq "grep -Fq './usr/share/doc/autark-os/GETTING_STARTED.md' \"\${deb_contents}\"" "${workflow}"

if grep -q -- '--clobber' "${workflow}"; then
  printf 'Release workflow must never overwrite existing release assets.\n' >&2
  exit 1
fi

if grep -Eq 'dpkg-deb[[:space:]]+-c.*[|][[:space:]]*grep[[:space:]]+-[^[:space:]]*q' "${workflow}"; then
  printf 'Release workflow must not stop dpkg-deb early with grep -q under pipefail.\n' >&2
  exit 1
fi

python3 - "${workflow}" <<'PY'
import json
import pathlib
import subprocess
import sys
import tempfile
import textwrap

workflow_text = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
assert workflow_text.count("contents: write") == 1
assert "mode:\n        description: Rehearse only or create a draft GitHub Release" in workflow_text
assert "- rehearsal\n          - draft" in workflow_text
assert "release-ready/*" in workflow_text
assert "SHA256SUMS" in workflow_text
assert '"${GITHUB_SHA}" \\\n            "${{ needs.prepare.outputs.published_at }}"' in workflow_text

verification_marker = '"${{ needs.prepare.outputs.published_at }}" <<\'PY\'\n'
verification_start = workflow_text.index(verification_marker) + len(verification_marker)
verification_end = workflow_text.index("\n          PY", verification_start)
verification_script = textwrap.dedent(workflow_text[verification_start:verification_end])

with tempfile.TemporaryDirectory() as temporary_directory:
    manifest_path = pathlib.Path(temporary_directory) / "autark-os-artifacts.json"
    manifest_path.write_text(json.dumps({
        "schemaVersion": 2,
        "artifactArchitecture": "amd64",
        "runtimeArchitecture": "amd64",
        "buildSha": "contract-build-sha",
        "buildDate": "2026-07-19T18:00:00Z",
    }), encoding="utf-8")
    command = [
        sys.executable,
        "-",
        str(manifest_path),
        "amd64",
        "contract-build-sha",
        "2026-07-19T18:00:00Z",
    ]
    verified = subprocess.run(command, input=verification_script, text=True, capture_output=True)
    assert verified.returncode == 0, verified.stderr

    wrong_sha = command.copy()
    wrong_sha[4] = "different-build-sha"
    rejected = subprocess.run(wrong_sha, input=verification_script, text=True, capture_output=True)
    assert rejected.returncode != 0
PY
