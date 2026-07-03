#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
jar_dir="${repo_root}/backend/build/libs"
fake_jar="${jar_dir}/project-os-backend-artifacts-test.jar"
trap 'rm -rf "${tmp_dir}"; rm -f "${fake_jar}"' EXIT

mkdir -p "${jar_dir}"
printf 'fake jar for release artifacts contract test\n' >"${fake_jar}"

artifacts_dir="${tmp_dir}/artifacts"
"${repo_root}/scripts/build-release-artifacts.sh" \
  --skip-build \
  --version 3.4.5 \
  --channel beta \
  --architecture amd64 \
  --release-notes-url https://example.invalid/project-os/3.4.5 \
  --output-dir "${artifacts_dir}" >/dev/null

bundle_dir="${artifacts_dir}/project-os-3.4.5"
tarball="${artifacts_dir}/project-os-3.4.5.tar.gz"
deb="${artifacts_dir}/project-os_3.4.5_amd64.deb"
run_installer="${artifacts_dir}/Autark-OS-Installer-3.4.5-amd64.run"
checksums="${artifacts_dir}/SHA256SUMS"
artifact_manifest="${artifacts_dir}/project-os-artifacts.json"

[[ -d "${bundle_dir}" ]]
[[ -f "${tarball}" ]]
[[ -f "${deb}" ]]
[[ -x "${run_installer}" ]]
[[ -f "${checksums}" ]]
[[ -f "${artifact_manifest}" ]]

tar -tzf "${tarball}" >/tmp/project-os-tarball-contents.txt
grep -q '^project-os-3.4.5/scripts/project-os$' /tmp/project-os-tarball-contents.txt
grep -q '^project-os-3.4.5/scripts/project-os-fileops$' /tmp/project-os-tarball-contents.txt
grep -q '^project-os-3.4.5/backend/project-os-backend.jar$' /tmp/project-os-tarball-contents.txt

dpkg-deb --info "${deb}" >/tmp/project-os-deb-info.txt
grep -q 'Package: project-os' /tmp/project-os-deb-info.txt
grep -q 'Version: 3.4.5' /tmp/project-os-deb-info.txt
grep -q 'Architecture: amd64' /tmp/project-os-deb-info.txt
dpkg-deb -c "${deb}" >/tmp/project-os-deb-contents.txt
grep -q './usr/lib/project-os/release/backend/project-os-backend.jar' /tmp/project-os-deb-contents.txt
grep -q './usr/lib/project-os/release/scripts/project-os' /tmp/project-os-deb-contents.txt
grep -q './usr/lib/project-os/release/scripts/project-os-fileops' /tmp/project-os-deb-contents.txt

control_dir="${tmp_dir}/deb-control"
mkdir -p "${control_dir}"
dpkg-deb -e "${deb}" "${control_dir}"
grep -q '/usr/lib/project-os/release/scripts/install-project-os-service.sh' "${control_dir}/postinst"
grep -q 'PROJECT_OS_BACKEND_JAR=/usr/lib/project-os/release/backend/project-os-backend.jar' "${control_dir}/postinst"
grep -q 'systemctl stop project-os.service' "${control_dir}/prerm"

"${run_installer}" --help | grep -q 'Autark-OS Installer'
extract_dir="${tmp_dir}/run-extract"
"${run_installer}" --extract-only "${extract_dir}" >/dev/null
[[ -x "${extract_dir}/scripts/project-os" ]]
[[ -x "${extract_dir}/scripts/bootstrap-project-os.sh" ]]
[[ -f "${extract_dir}/backend/project-os-backend.jar" ]]

grep -q 'project-os-3.4.5.tar.gz' "${checksums}"
grep -q 'project-os_3.4.5_amd64.deb' "${checksums}"
grep -q 'Autark-OS-Installer-3.4.5-amd64.run' "${checksums}"
(cd "${artifacts_dir}" && sha256sum -c SHA256SUMS --ignore-missing >/dev/null)

python3 - "${artifact_manifest}" <<'PY'
import json
import sys

manifest = json.load(open(sys.argv[1], encoding="utf-8"))
assert manifest["schemaVersion"] == 1
assert manifest["version"] == "3.4.5"
assert manifest["channel"] == "beta"
assert manifest["architecture"] == "amd64"
assert manifest["releaseNotesUrl"] == "https://example.invalid/project-os/3.4.5"
names = {artifact["fileName"] for artifact in manifest["artifacts"]}
assert "project-os-3.4.5.tar.gz" in names
assert "project-os_3.4.5_amd64.deb" in names
assert "Autark-OS-Installer-3.4.5-amd64.run" in names
PY
