#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
jar_dir="${repo_root}/backend/build/libs"
fake_jar="${jar_dir}/autark-os-backend-contract-test.jar"
trap 'rm -rf "${tmp_dir}"; rm -f "${fake_jar}"' EXIT

mkdir -p "${jar_dir}"
printf 'fake jar for release bundle contract test\n' >"${fake_jar}"

bundle_dir="${tmp_dir}/autark-os-1.2.3"
architecture="$(dpkg --print-architecture)"
"${repo_root}/scripts/build-release-bundle.sh" \
  --skip-build \
  --version 1.2.3 \
  --channel beta \
  --architecture "${architecture}" \
  --release-notes-url https://example.invalid/autark-os/1.2.3 \
  --output-dir "${bundle_dir}" >/dev/null

[[ -f "${bundle_dir}/autark-os-release.env" ]]
[[ -f "${bundle_dir}/autark-os-release.json" ]]
[[ -f "${bundle_dir}/autark-os-provenance.json" ]]
[[ -f "${bundle_dir}/SHA256SUMS" ]]
[[ -x "${bundle_dir}/scripts/install-autark-os.sh" ]]
[[ -x "${bundle_dir}/scripts/autark-os-gui-installer.sh" ]]
[[ -x "${bundle_dir}/scripts/autark-os-fileops" ]]
[[ -x "${bundle_dir}/runtime/bin/java" ]]

grep -q '^AUTARK_OS_VERSION=1.2.3$' "${bundle_dir}/autark-os-release.env"
grep -q '^AUTARK_OS_UPDATE_CHANNEL=beta$' "${bundle_dir}/autark-os-release.env"
grep -q '^AUTARK_OS_RELEASE_NOTES_URL=https://example.invalid/autark-os/1.2.3$' "${bundle_dir}/autark-os-release.env"
grep -q "^AUTARK_OS_ARTIFACT_ARCHITECTURE=${architecture}$" "${bundle_dir}/autark-os-release.env"
grep -q "^AUTARK_OS_RUNTIME_ARCHITECTURE=${architecture}$" "${bundle_dir}/autark-os-release.env"
grep -q '^AUTARK_OS_SUPPORTED_HOST_POLICY_VERSION=2$' "${bundle_dir}/autark-os-release.env"
grep -q 'autark-os-release.json' "${bundle_dir}/SHA256SUMS"
grep -q 'autark-os-provenance.json' "${bundle_dir}/SHA256SUMS"
grep -q 'scripts/install-autark-os.sh' "${bundle_dir}/SHA256SUMS"
grep -q 'scripts/autark-os-gui-installer.sh' "${bundle_dir}/SHA256SUMS"
grep -q 'scripts/autark-os-fileops' "${bundle_dir}/SHA256SUMS"
grep -q 'runtime/bin/java' "${bundle_dir}/SHA256SUMS"

python3 - "${bundle_dir}/autark-os-release.json" "${bundle_dir}/autark-os-provenance.json" <<'PY'
import json
import sys

release = json.load(open(sys.argv[1], encoding="utf-8"))
provenance = json.load(open(sys.argv[2], encoding="utf-8"))

assert release["schemaVersion"] == 2
assert release["version"] == "1.2.3"
assert release["channel"] == "beta"
assert release["releaseNotesUrl"] == "https://example.invalid/autark-os/1.2.3"
assert release["artifactArchitecture"] in {"amd64", "arm64"}
assert release["runtimeArchitecture"] == release["artifactArchitecture"]
assert release["supportedHostPolicyVersion"] == "2"
assert release["requirements"]["minimumMemoryMb"] == 2048
assert release["supportedHosts"]["ubuntu"]["versions"] == ["24.04", "26.04"]
assert release["supportedHosts"]["debian"]["versions"] == ["12", "13"]
assert release["supportedHosts"]["raspbian"]["versions"] == ["11", "12", "13"]
assert release["supportedHosts"]["raspbian"]["architectures"] == ["arm64"]
assert "backend/autark-os-backend.jar" in release["artifacts"]
assert "runtime/bin/java" in release["artifacts"]
assert "scripts/autark-os-gui-installer.sh" in release["artifacts"]
assert "scripts/autark-os-fileops" in release["artifacts"]
assert provenance["schemaVersion"] == 2
assert provenance["artifactArchitecture"] == release["artifactArchitecture"]
assert provenance["runtimeArchitecture"] == release["runtimeArchitecture"]
assert provenance["signatureStatus"] == "unsigned-reserved"
PY

(cd "${bundle_dir}" && sha256sum -c SHA256SUMS --ignore-missing >/dev/null)

plan_json="$("${bundle_dir}/scripts/bootstrap-autark-os.sh" --plan --json --release-bundle "${bundle_dir}")"
PLAN_JSON="${plan_json}" EXPECTED_ARCHITECTURE="${architecture}" python3 - <<'PY'
import json
import os

plan = json.loads(os.environ["PLAN_JSON"])
expected = os.environ["EXPECTED_ARCHITECTURE"]
assert plan["host"]["architecture"] == expected
assert plan["host"]["supportedHostPolicyVersion"] == "2"
assert plan["artifact"]["artifactArchitecture"] == expected
assert plan["artifact"]["runtimeArchitecture"] == expected
PY
