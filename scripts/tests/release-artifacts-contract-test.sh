#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
jar_dir="${repo_root}/backend/build/libs"
fake_jar="${jar_dir}/autark-os-backend-artifacts-test.jar"
trap 'rm -rf "${tmp_dir}"; rm -f "${fake_jar}"' EXIT

mkdir -p "${jar_dir}"
printf 'fake jar for release artifacts contract test\n' >"${fake_jar}"

artifacts_dir="${tmp_dir}/artifacts"
"${repo_root}/scripts/build-release-artifacts.sh" \
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

tar -tzf "${tarball}" >/tmp/autark-os-tarball-contents.txt
grep -q '^autark-os-3.4.5-amd64/scripts/autark-os$' /tmp/autark-os-tarball-contents.txt
grep -q '^autark-os-3.4.5-amd64/scripts/autark-os-fileops$' /tmp/autark-os-tarball-contents.txt
grep -q '^autark-os-3.4.5-amd64/backend/autark-os-backend.jar$' /tmp/autark-os-tarball-contents.txt

dpkg-deb --info "${deb}" >/tmp/autark-os-deb-info.txt
grep -q 'Package: autark-os' /tmp/autark-os-deb-info.txt
grep -q 'Version: 3.4.5' /tmp/autark-os-deb-info.txt
grep -q 'Architecture: amd64' /tmp/autark-os-deb-info.txt
dpkg-deb -c "${deb}" >/tmp/autark-os-deb-contents.txt
grep -q './usr/lib/autark-os/release/backend/autark-os-backend.jar' /tmp/autark-os-deb-contents.txt
grep -q './usr/lib/autark-os/release/scripts/autark-os' /tmp/autark-os-deb-contents.txt
grep -q './usr/lib/autark-os/release/scripts/autark-os-fileops' /tmp/autark-os-deb-contents.txt

control_dir="${tmp_dir}/deb-control"
mkdir -p "${control_dir}"
dpkg-deb -e "${deb}" "${control_dir}"
grep -q '/usr/lib/autark-os/release/scripts/install-autark-os-service.sh' "${control_dir}/postinst"
grep -q 'AUTARK_OS_BACKEND_JAR=/usr/lib/autark-os/release/backend/autark-os-backend.jar' "${control_dir}/postinst"
grep -q 'open http://localhost:8082 to complete setup' "${control_dir}/postinst"
grep -q 'Docker Engine and Docker Compose v2' "${control_dir}/postinst"
grep -q 'systemctl stop autark-os.service' "${control_dir}/prerm"
grep -q 'pre-upgrade-' "${control_dir}/preinst"
grep -q 'package-upgrades' "${control_dir}/preinst"
grep -q 'expected_architecture="amd64"' "${control_dir}/preinst"
grep -q 'this package is.*but this host is' "${control_dir}/preinst"
grep -q 'bundled amd64 Java runtime cannot execute' "${control_dir}/postinst"
grep -q 'preserved on remove and purge' "${control_dir}/postrm"

"${run_installer}" --help | grep -q 'Autark-OS Portable Installer'
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
assert manifest["artifactArchitecture"] == "amd64"
assert manifest["runtimeArchitecture"] == "amd64"
assert manifest["supportedHostPolicyVersion"] == "2"
assert manifest["releaseNotesUrl"] == "https://example.invalid/autark-os/3.4.5"
names = {artifact["fileName"] for artifact in manifest["artifacts"]}
assert "autark-os-3.4.5-amd64.tar.gz" in names
assert "autark-os_3.4.5_amd64.deb" in names
assert "Autark-OS-Installer-3.4.5-amd64.run" in names
PY
