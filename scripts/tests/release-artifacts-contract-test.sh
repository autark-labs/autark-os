#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
jar_dir="${repo_root}/backend/build/libs"
fake_jar="${jar_dir}/autark-os-backend-artifacts-test.jar"
trap 'rm -rf "${tmp_dir}"; rm -f "${fake_jar}"' EXIT

python3 "${repo_root}/scripts/tests/create-release-test-jar.py" \
  --output "${fake_jar}" \
  --version 3.4.5 \
  --build-sha artifacts-build-sha

artifacts_dir="${tmp_dir}/artifacts"
AUTARK_OS_BACKEND_JAR="${fake_jar}" AUTARK_OS_BUILD_SHA=artifacts-build-sha "${repo_root}/scripts/build-release-artifacts.sh" \
  --skip-build \
  --version 3.4.5 \
  --channel beta \
  --architecture amd64 \
  --release-notes-url https://example.invalid/autark-os/3.4.5 \
  --output-dir "${artifacts_dir}" >/dev/null

bundle_dir="${artifacts_dir}/autark-os-3.4.5-amd64"
tarball="${artifacts_dir}/autark-os-3.4.5-amd64.tar.gz"
deb="${artifacts_dir}/autark-os_3.4.5_amd64.deb"
run_installer="${artifacts_dir}/Autark-OS-Installer-3.4.5-amd64.run"
checksums="${artifacts_dir}/SHA256SUMS"
artifact_manifest="${artifacts_dir}/autark-os-artifacts.json"

[[ -d "${bundle_dir}" ]]
[[ -f "${tarball}" ]]
[[ -f "${deb}" ]]
[[ -x "${run_installer}" ]]
[[ -f "${checksums}" ]]
[[ -f "${artifact_manifest}" ]]
grep -q '^AUTARK_OS_VERSION=3.4.5$' "${bundle_dir}/autark-os-release.env"
grep -q '^AUTARK_OS_BUILD_SHA=artifacts-build-sha$' "${bundle_dir}/autark-os-release.env"
grep -q '^AUTARK_OS_BUILD_DATE=2026-01-01T00:00:00Z$' "${bundle_dir}/autark-os-release.env"

tar -tzf "${tarball}" >/tmp/autark-os-tarball-contents.txt
grep -q '^autark-os-3.4.5-amd64/scripts/autark-os$' /tmp/autark-os-tarball-contents.txt
grep -q '^autark-os-3.4.5-amd64/scripts/autark-os-fileops$' /tmp/autark-os-tarball-contents.txt
grep -q '^autark-os-3.4.5-amd64/backend/autark-os-backend.jar$' /tmp/autark-os-tarball-contents.txt

dpkg-deb --info "${deb}" >/tmp/autark-os-deb-info.txt
grep -q 'Package: autark-os' /tmp/autark-os-deb-info.txt
grep -q 'Version: 3.4.5' /tmp/autark-os-deb-info.txt
grep -q 'Architecture: amd64' /tmp/autark-os-deb-info.txt
grep -q 'Maintainer: Autark Labs <licensing@autarklabs.com>' /tmp/autark-os-deb-info.txt
grep -q 'Homepage: https://github.com/autark-labs/autark-os' /tmp/autark-os-deb-info.txt
grep -q 'License: Autark Community License (ACL) v1.0' /tmp/autark-os-deb-info.txt
dpkg-deb -c "${deb}" >/tmp/autark-os-deb-contents.txt
grep -q './usr/lib/autark-os/release/backend/autark-os-backend.jar' /tmp/autark-os-deb-contents.txt
grep -q './usr/lib/autark-os/release/scripts/autark-os' /tmp/autark-os-deb-contents.txt
grep -q './usr/lib/autark-os/release/scripts/autark-os-fileops' /tmp/autark-os-deb-contents.txt
grep -q './usr/share/doc/autark-os/GETTING_STARTED.md' /tmp/autark-os-deb-contents.txt
grep -q './usr/share/doc/autark-os/RELEASE_NOTES.md' /tmp/autark-os-deb-contents.txt
grep -q './usr/share/doc/autark-os/LICENSE.md' /tmp/autark-os-deb-contents.txt
deb_data_dir="${tmp_dir}/deb-data"
dpkg-deb -x "${deb}" "${deb_data_dir}"
grep -q '^AUTARK_OS_VERSION=3.4.5$' "${deb_data_dir}/usr/lib/autark-os/release/autark-os-release.env"
grep -q '^AUTARK_OS_BUILD_SHA=artifacts-build-sha$' "${deb_data_dir}/usr/lib/autark-os/release/autark-os-release.env"
grep -q '^# Autark-OS: Getting Started And Recovery$' "${deb_data_dir}/usr/share/doc/autark-os/GETTING_STARTED.md"
grep -q '^# Autark Community License' "${deb_data_dir}/usr/share/doc/autark-os/LICENSE.md"

control_dir="${tmp_dir}/deb-control"
mkdir -p "${control_dir}"
dpkg-deb -e "${deb}" "${control_dir}"
bash -n "${control_dir}/preinst" "${control_dir}/postinst" "${control_dir}/prerm" "${control_dir}/postrm"
grep -q '/usr/lib/autark-os/release/scripts/install-autark-os-service.sh' "${control_dir}/postinst"
grep -q 'AUTARK_OS_BACKEND_JAR=/usr/lib/autark-os/release/backend/autark-os-backend.jar' "${control_dir}/postinst"
grep -q 'open http://localhost:${server_port} to complete setup' "${control_dir}/postinst"
grep -q 'AUTARK_OS_INSTALL_METHOD=package' "${control_dir}/postinst"
grep -q 'failed health verification; restored the pre-upgrade service snapshot' "${control_dir}/postinst"
grep -q 'rm -rf "${install_dir}" "${config_dir}"' "${control_dir}/postinst"
grep -q 'Docker Engine and Docker Compose v2' "${control_dir}/postinst"
grep -q 'systemctl stop autark-os.service' "${control_dir}/prerm"
grep -q 'pre-upgrade-' "${control_dir}/preinst"
grep -q 'package-upgrades' "${control_dir}/preinst"
grep -q 'systemctl stop autark-os.service' "${control_dir}/preinst"
grep -q '/run/autark-os-package-upgrade-checkpoint' "${control_dir}/preinst"
grep -q '/run/autark-os-package-upgrade-checkpoint' "${control_dir}/postinst"
grep -q 'expected_architecture="amd64"' "${control_dir}/preinst"
grep -q 'this package is.*but this host is' "${control_dir}/preinst"
grep -q 'bundled amd64 Java runtime cannot execute' "${control_dir}/postinst"
grep -q 'preserved on remove and purge' "${control_dir}/postrm"
grep -q 'rm -f /etc/systemd/system/autark-os.service' "${control_dir}/postrm"

"${run_installer}" --help | grep -q 'Autark-OS Portable Installer'
grep -a -q 'existing Autark-OS installation was found' "${run_installer}"
grep -a -q 'shared update and rollback flow' "${run_installer}"
mismatch_installer="${tmp_dir}/Autark-OS-Installer-3.4.5-arm64.run"
cp "${run_installer}" "${mismatch_installer}"
sed -i 's/AUTARK_OS_INSTALLER_ARCHITECTURE="amd64"/AUTARK_OS_INSTALLER_ARCHITECTURE="arm64"/' "${mismatch_installer}"
if "${mismatch_installer}" --help >"${tmp_dir}/run-architecture-mismatch.out" 2>&1; then
  printf 'Expected mismatched portable installer to fail.\n' >&2
  exit 1
fi
grep -q 'this installer is arm64, but this host is amd64' "${tmp_dir}/run-architecture-mismatch.out"
extract_dir="${tmp_dir}/run-extract"
"${run_installer}" --extract-only "${extract_dir}" >/dev/null
[[ -x "${extract_dir}/scripts/autark-os" ]]
[[ -x "${extract_dir}/scripts/bootstrap-autark-os.sh" ]]
[[ -f "${extract_dir}/scripts/supported-host-matrix.env" ]]
[[ -f "${extract_dir}/backend/autark-os-backend.jar" ]]
[[ -f "${extract_dir}/docs/GETTING_STARTED.md" ]]
[[ -f "${extract_dir}/docs/RELEASE_NOTES.md" ]]
[[ -f "${extract_dir}/docs/LICENSE.md" ]]
grep -q 'install_release_docs' "${extract_dir}/scripts/install-autark-os-service.sh"
grep -q '/usr/share/doc/autark-os' "${extract_dir}/scripts/install-autark-os-service.sh"
grep -q '^AUTARK_OS_VERSION=3.4.5$' "${extract_dir}/autark-os-release.env"
grep -q '^AUTARK_OS_BUILD_SHA=artifacts-build-sha$' "${extract_dir}/autark-os-release.env"
grep -q '^AUTARK_OS_ARTIFACT_ARCHITECTURE=amd64$' "${extract_dir}/autark-os-release.env"
grep -q '^AUTARK_OS_RUNTIME_ARCHITECTURE=amd64$' "${extract_dir}/autark-os-release.env"
file -Lb "${extract_dir}/runtime/bin/java" | grep -qE 'x86-64|x86_64'
readelf -h "${extract_dir}/runtime/bin/java" | grep -q 'Advanced Micro Devices X86-64'

"${run_installer}" \
  --dry-run \
  --yes \
  --runtime-dir "${tmp_dir}/runtime" \
  --port 19082 >"${tmp_dir}/run-dry-run.out"
grep -q 'Autark-OS installation preview completed.' "${tmp_dir}/run-dry-run.out"
grep -q 'LAN URL:' "${tmp_dir}/run-dry-run.out"
grep -q 'Java: bundled with this Autark-OS release' "${tmp_dir}/run-dry-run.out"
! grep -q 'Java: missing' "${tmp_dir}/run-dry-run.out"

grep -q 'autark-os-3.4.5-amd64.tar.gz' "${checksums}"
grep -q 'autark-os_3.4.5_amd64.deb' "${checksums}"
grep -q 'Autark-OS-Installer-3.4.5-amd64.run' "${checksums}"
(cd "${artifacts_dir}" && sha256sum -c SHA256SUMS --ignore-missing >/dev/null)

python3 - "${artifact_manifest}" <<'PY'
import json
import sys

manifest = json.load(open(sys.argv[1], encoding="utf-8"))
assert manifest["schemaVersion"] == 2
assert manifest["version"] == "3.4.5"
assert manifest["channel"] == "beta"
assert manifest["buildSha"] == "artifacts-build-sha"
assert manifest["buildDate"] != "development"
assert manifest["artifactArchitecture"] == "amd64"
assert manifest["runtimeArchitecture"] == "amd64"
assert manifest["supportedHostPolicyVersion"] == "2"
assert manifest["releaseNotesUrl"] == "https://example.invalid/autark-os/3.4.5"
names = {artifact["fileName"] for artifact in manifest["artifacts"]}
assert "autark-os-3.4.5-amd64.tar.gz" in names
assert "autark-os_3.4.5_amd64.deb" in names
assert "Autark-OS-Installer-3.4.5-amd64.run" in names
PY
