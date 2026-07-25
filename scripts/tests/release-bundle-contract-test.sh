#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
jar_dir="${repo_root}/backend/build/libs"
fake_jar="${jar_dir}/autark-os-backend-contract-test.jar"
trap 'rm -rf "${tmp_dir}"; rm -f "${fake_jar}"' EXIT

python3 "${repo_root}/scripts/tests/create-release-test-jar.py" \
  --output "${fake_jar}" \
  --version 1.2.3 \
  --build-sha contract-build-sha

bundle_dir="${tmp_dir}/autark-os-1.2.3"
architecture="$(dpkg --print-architecture)"
AUTARK_OS_BACKEND_JAR="${fake_jar}" AUTARK_OS_BUILD_SHA=contract-build-sha "${repo_root}/scripts/build-release-bundle.sh" \
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
[[ -x "${bundle_dir}/scripts/autark-os-update-helper" ]]
[[ -x "${bundle_dir}/runtime/bin/java" ]]
[[ -x "${bundle_dir}/tools/cosign" ]]
[[ -f "${bundle_dir}/tools/cosign-LICENSE" ]]
[[ -f "${bundle_dir}/docs/GETTING_STARTED.md" ]]
[[ -f "${bundle_dir}/docs/RELEASE_NOTES.md" ]]
[[ -f "${bundle_dir}/docs/LICENSE.md" ]]
[[ -f "${bundle_dir}/docs/COMMERCIAL-LICENSE.md" ]]
[[ -f "${bundle_dir}/docs/THIRD_PARTY_NOTICES.md" ]]
[[ -f "${bundle_dir}/docs/THIRD_PARTY_COMPONENTS.txt" ]]
[[ -f "${bundle_dir}/docs/THIRD_PARTY_FRONTEND_LOCK.txt" ]]
[[ -f "${bundle_dir}/docs/SUPPORT.md" ]]
[[ -f "${bundle_dir}/docs/SECURITY.md" ]]
[[ -f "${bundle_dir}/docs/RELEASE_SIGNING.md" ]]
"${bundle_dir}/runtime/bin/java" --list-modules | grep -q '^java.compiler@'
"${bundle_dir}/runtime/bin/java" --list-modules | grep -q '^jdk.crypto.ec@'
"${bundle_dir}/runtime/bin/java" --list-modules | grep -q '^jdk.management@'

grep -q '^AUTARK_OS_VERSION=1.2.3$' "${bundle_dir}/autark-os-release.env"
grep -q '^AUTARK_OS_BUILD_SHA=contract-build-sha$' "${bundle_dir}/autark-os-release.env"
grep -q '^AUTARK_OS_BUILD_DATE=2026-01-01T00:00:00Z$' "${bundle_dir}/autark-os-release.env"
grep -q '^AUTARK_OS_UPDATE_CHANNEL=beta$' "${bundle_dir}/autark-os-release.env"
grep -q '^AUTARK_OS_RELEASE_NOTES_URL=https://example.invalid/autark-os/1.2.3$' "${bundle_dir}/autark-os-release.env"
grep -q "^AUTARK_OS_ARTIFACT_ARCHITECTURE=${architecture}$" "${bundle_dir}/autark-os-release.env"
grep -q "^AUTARK_OS_RUNTIME_ARCHITECTURE=${architecture}$" "${bundle_dir}/autark-os-release.env"
grep -q '^AUTARK_OS_COSIGN_VERSION=3.1.2$' "${bundle_dir}/autark-os-release.env"
grep -q '^AUTARK_OS_SUPPORTED_HOST_POLICY_VERSION=2$' "${bundle_dir}/autark-os-release.env"
grep -q 'autark-os-release.json' "${bundle_dir}/SHA256SUMS"
grep -q 'autark-os-provenance.json' "${bundle_dir}/SHA256SUMS"
grep -q 'scripts/install-autark-os.sh' "${bundle_dir}/SHA256SUMS"
grep -q 'scripts/autark-os-gui-installer.sh' "${bundle_dir}/SHA256SUMS"
grep -q 'scripts/autark-os-fileops' "${bundle_dir}/SHA256SUMS"
grep -q 'scripts/autark-os-update-helper' "${bundle_dir}/SHA256SUMS"
grep -q 'docs/GETTING_STARTED.md' "${bundle_dir}/SHA256SUMS"
grep -q 'docs/RELEASE_NOTES.md' "${bundle_dir}/SHA256SUMS"
grep -q 'docs/LICENSE.md' "${bundle_dir}/SHA256SUMS"
grep -q 'runtime/bin/java' "${bundle_dir}/SHA256SUMS"
grep -q 'tools/cosign' "${bundle_dir}/SHA256SUMS"
grep -q 'tools/cosign-LICENSE' "${bundle_dir}/SHA256SUMS"
grep -q '^SuccessExitStatus=143$' "${bundle_dir}/scripts/install-autark-os-service.sh"

python3 - "${bundle_dir}/autark-os-release.json" "${bundle_dir}/autark-os-provenance.json" <<'PY'
import json
import sys

release = json.load(open(sys.argv[1], encoding="utf-8"))
provenance = json.load(open(sys.argv[2], encoding="utf-8"))

assert release["schemaVersion"] == 2
assert release["version"] == "1.2.3"
assert release["channel"] == "beta"
assert release["buildSha"] == "contract-build-sha"
assert release["buildDate"] == "2026-01-01T00:00:00Z"
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
assert "tools/cosign" in release["artifacts"]
assert "tools/cosign-LICENSE" in release["artifacts"]
assert "scripts/autark-os-gui-installer.sh" in release["artifacts"]
assert "scripts/autark-os-fileops" in release["artifacts"]
assert "scripts/autark-os-update-helper" in release["artifacts"]
assert "docs/GETTING_STARTED.md" in release["artifacts"]
assert "docs/RELEASE_NOTES.md" in release["artifacts"]
assert "docs/LICENSE.md" in release["artifacts"]
assert "docs/RELEASE_SIGNING.md" in release["artifacts"]
assert provenance["schemaVersion"] == 2
assert provenance["buildSha"] == release["buildSha"]
assert provenance["buildDate"] == release["buildDate"]
assert provenance["artifactArchitecture"] == release["artifactArchitecture"]
assert provenance["runtimeArchitecture"] == release["runtimeArchitecture"]
assert provenance["signatureStatus"] == "unsigned-reserved"
assert release["signatureKeyId"] is None
assert release["trustEnvironment"] == "local"
PY

grep -q '^# Autark-OS: Getting Started And Recovery$' "${bundle_dir}/docs/GETTING_STARTED.md"
grep -q 'currently applies image-only catalog releases' "${bundle_dir}/docs/GETTING_STARTED.md"
grep -q '^# Autark-OS 1.2.3$' "${bundle_dir}/docs/RELEASE_NOTES.md"
grep -q '^## Known Limitations$' "${bundle_dir}/docs/RELEASE_NOTES.md"
grep -q 'Managed-app updates currently support image-only catalog releases' "${bundle_dir}/docs/RELEASE_NOTES.md"
grep -q '^https://example.invalid/autark-os/1.2.3$' "${bundle_dir}/docs/RELEASE_NOTES.md"
grep -q '^# Autark Community License' "${bundle_dir}/docs/LICENSE.md"
grep -q '^# Third-Party Components$' "${bundle_dir}/docs/THIRD_PARTY_NOTICES.md"
grep -q '^# Autark-OS Support Policy$' "${bundle_dir}/docs/SUPPORT.md"
grep -q '^# Reporting A Security Issue$' "${bundle_dir}/docs/SECURITY.md"

mismatch_output="${tmp_dir}/identity-mismatch.out"
if AUTARK_OS_BACKEND_JAR="${fake_jar}" AUTARK_OS_BUILD_SHA=other-build-sha "${repo_root}/scripts/build-release-bundle.sh" \
  --skip-build \
  --version 1.2.3 \
  --channel beta \
  --architecture "${architecture}" \
  --output-dir "${tmp_dir}/identity-mismatch" >"${mismatch_output}" 2>&1; then
  printf 'Expected --skip-build to reject a backend jar from a different build SHA.\n' >&2
  exit 1
fi
grep -q "does not match requested release build SHA" "${mismatch_output}"

date_mismatch_output="${tmp_dir}/date-mismatch.out"
if AUTARK_OS_BACKEND_JAR="${fake_jar}" AUTARK_OS_BUILD_SHA=contract-build-sha AUTARK_OS_BUILD_DATE=2026-01-02T00:00:00Z "${repo_root}/scripts/build-release-bundle.sh" \
  --skip-build \
  --version 1.2.3 \
  --channel beta \
  --architecture "${architecture}" \
  --output-dir "${tmp_dir}/date-mismatch" >"${date_mismatch_output}" 2>&1; then
  printf 'Expected --skip-build to reject a backend jar from a different build date.\n' >&2
  exit 1
fi
grep -q "does not match requested release build date" "${date_mismatch_output}"

python3 - "${bundle_dir}" <<'PY'
from pathlib import Path
import sys

bundle = Path(sys.argv[1])
listed = {
    line.split(maxsplit=1)[1].removeprefix("*")
    for line in (bundle / "SHA256SUMS").read_text(encoding="utf-8").splitlines()
}
actual = {
    str(path.relative_to(bundle))
    for path in bundle.rglob("*")
    if (path.is_file() or path.is_symlink()) and path.name not in {"SHA256SUMS", "SHA256SUMS.sigstore.json"}
}
assert listed == actual, (sorted(listed - actual), sorted(actual - listed))
PY
(cd "${bundle_dir}" && sha256sum -c SHA256SUMS >/dev/null)

# A release intended for browser installation includes only a public trust root,
# signs the exact checksum manifest after it is complete, and remains verifiable
# with the pinned bundled verifier.
signing_prefix="${tmp_dir}/core-update-contract"
COSIGN_PASSWORD=contract-release-password "${bundle_dir}/tools/cosign" generate-key-pair --output-key-prefix "${signing_prefix}" >/dev/null
signed_bundle_dir="${tmp_dir}/autark-os-1.2.3-signed"
COSIGN_PASSWORD=contract-release-password \
  AUTARK_OS_BACKEND_JAR="${fake_jar}" \
  AUTARK_OS_BUILD_SHA=contract-build-sha \
  AUTARK_OS_COSIGN_BINARY="${bundle_dir}/tools/cosign" \
  AUTARK_OS_RELEASE_SIGNATURE_MODE=signed \
  AUTARK_OS_RELEASE_SIGNING_PRIVATE_KEY="${signing_prefix}.key" \
  AUTARK_OS_RELEASE_SIGNING_PUBLIC_KEY="${signing_prefix}.pub" \
  AUTARK_OS_RELEASE_SIGNING_KEY_ID=staging-core-update-2026-01 \
  AUTARK_OS_RELEASE_TRUST_ENVIRONMENT=staging \
  AUTARK_OS_RELEASE_TRUST_ROOT_SHA256="$(sha256sum "${signing_prefix}.pub" | awk '{print $1}')" \
  AUTARK_OS_RELEASE_ORIGIN=https://api.staging.autarklabs.com/v1 \
  "${repo_root}/scripts/build-release-bundle.sh" \
    --skip-build \
    --version 1.2.3 \
    --channel beta \
    --architecture "${architecture}" \
    --release-notes-url https://example.invalid/autark-os/1.2.3 \
    --output-dir "${signed_bundle_dir}" >/dev/null

[[ -f "${signed_bundle_dir}/keys/core-update-release.pub" ]]
[[ -s "${signed_bundle_dir}/SHA256SUMS.sigstore.json" ]]
cmp -s "${signing_prefix}.pub" "${signed_bundle_dir}/keys/core-update-release.pub"
"${signed_bundle_dir}/tools/cosign" verify-blob \
  --key "${signed_bundle_dir}/keys/core-update-release.pub" \
  --bundle "${signed_bundle_dir}/SHA256SUMS.sigstore.json" \
  "${signed_bundle_dir}/SHA256SUMS" >/dev/null
python3 - "${signed_bundle_dir}/autark-os-release.json" "${signed_bundle_dir}/autark-os-provenance.json" <<'PY'
import json
import sys

release = json.load(open(sys.argv[1], encoding="utf-8"))
provenance = json.load(open(sys.argv[2], encoding="utf-8"))
assert release["signatureStatus"] == "signed"
assert release["signatureKeyId"] == "staging-core-update-2026-01"
assert release["trustEnvironment"] == "staging"
assert "keys/core-update-release.pub" in release["artifacts"]
assert provenance["signatureStatus"] == "signed"
assert provenance["signatureKeyId"] == release["signatureKeyId"]
PY
python3 - "${signed_bundle_dir}" "${signing_prefix}.key" <<'PY'
from pathlib import Path
import sys

bundle = Path(sys.argv[1])
private_key = Path(sys.argv[2]).resolve()
assert str(private_key) not in (bundle / "SHA256SUMS").read_text(encoding="utf-8")
assert not any(path.name.endswith(".key") for path in bundle.rglob("*"))
PY
(cd "${signed_bundle_dir}" && sha256sum -c SHA256SUMS >/dev/null)

production_policy_output="${tmp_dir}/production-policy.out"
if AUTARK_OS_RELEASE_SIGNATURE_MODE=signed \
  AUTARK_OS_RELEASE_SIGNING_PRIVATE_KEY="${signing_prefix}.key" \
  AUTARK_OS_RELEASE_SIGNING_PUBLIC_KEY="${signing_prefix}.pub" \
  AUTARK_OS_RELEASE_SIGNING_KEY_ID=staging-core-update-2026-01 \
  AUTARK_OS_RELEASE_TRUST_ENVIRONMENT=production \
  AUTARK_OS_RELEASE_TRUST_ROOT_SHA256="$(sha256sum "${signing_prefix}.pub" | awk '{print $1}')" \
  AUTARK_OS_RELEASE_ORIGIN=https://api.staging.autarklabs.com/v1 \
  "${repo_root}/scripts/build-release-bundle.sh" \
    --dry-run \
    --version 1.2.3 \
    --channel stable \
    --architecture "${architecture}" \
    --build-sha contract-build-sha >"${production_policy_output}" 2>&1; then
  printf 'Expected production release policy to reject a staging signing identity.\n' >&2
  exit 1
fi
grep -q 'must use a production-\* signing key identifier' "${production_policy_output}"

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
