#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
jar_dir="${repo_root}/backend/build/libs"
fake_jar="${jar_dir}/project-os-backend-contract-test.jar"
trap 'rm -rf "${tmp_dir}"; rm -f "${fake_jar}"' EXIT

mkdir -p "${jar_dir}"
printf 'fake jar for release bundle contract test\n' >"${fake_jar}"

bundle_dir="${tmp_dir}/project-os-1.2.3"
"${repo_root}/scripts/build-release-bundle.sh" \
  --skip-build \
  --version 1.2.3 \
  --channel beta \
  --release-notes-url https://example.invalid/project-os/1.2.3 \
  --output-dir "${bundle_dir}" >/dev/null

[[ -f "${bundle_dir}/project-os-release.env" ]]
[[ -f "${bundle_dir}/project-os-release.json" ]]
[[ -f "${bundle_dir}/project-os-provenance.json" ]]
[[ -f "${bundle_dir}/SHA256SUMS" ]]
[[ -x "${bundle_dir}/scripts/install-project-os.sh" ]]
[[ -x "${bundle_dir}/scripts/project-os-gui-installer.sh" ]]
[[ -x "${bundle_dir}/scripts/project-os-fileops" ]]

grep -q '^PROJECT_OS_VERSION=1.2.3$' "${bundle_dir}/project-os-release.env"
grep -q '^PROJECT_OS_UPDATE_CHANNEL=beta$' "${bundle_dir}/project-os-release.env"
grep -q '^PROJECT_OS_RELEASE_NOTES_URL=https://example.invalid/project-os/1.2.3$' "${bundle_dir}/project-os-release.env"
grep -q '^PROJECT_OS_SUPPORTED_ARCHITECTURES=' "${bundle_dir}/project-os-release.env"
grep -q 'project-os-release.json' "${bundle_dir}/SHA256SUMS"
grep -q 'project-os-provenance.json' "${bundle_dir}/SHA256SUMS"
grep -q 'scripts/install-project-os.sh' "${bundle_dir}/SHA256SUMS"
grep -q 'scripts/project-os-gui-installer.sh' "${bundle_dir}/SHA256SUMS"
grep -q 'scripts/project-os-fileops' "${bundle_dir}/SHA256SUMS"

python3 - "${bundle_dir}/project-os-release.json" "${bundle_dir}/project-os-provenance.json" <<'PY'
import json
import sys

release = json.load(open(sys.argv[1], encoding="utf-8"))
provenance = json.load(open(sys.argv[2], encoding="utf-8"))

assert release["schemaVersion"] == 1
assert release["version"] == "1.2.3"
assert release["channel"] == "beta"
assert release["releaseNotesUrl"] == "https://example.invalid/project-os/1.2.3"
assert "x86_64" in release["supportedArchitectures"]
assert "backend/project-os-backend.jar" in release["artifacts"]
assert "scripts/project-os-gui-installer.sh" in release["artifacts"]
assert "scripts/project-os-fileops" in release["artifacts"]
assert provenance["schemaVersion"] == 1
assert provenance["signatureStatus"] == "unsigned-reserved"
PY

(cd "${bundle_dir}" && sha256sum -c SHA256SUMS --ignore-missing >/dev/null)
