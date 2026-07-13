#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

input_root="${tmp_dir}/input"
release_dir="${tmp_dir}/release"
version="7.8.9-beta.1"
channel="beta"

create_architecture_fixture() {
  local architecture="$1"
  local architecture_dir="${input_root}/${architecture}"
  local tar_name="autark-os-${version}-${architecture}.tar.gz"
  local deb_name="autark-os_${version}_${architecture}.deb"
  local run_name="Autark-OS-Installer-${version}-${architecture}.run"
  mkdir -p "${architecture_dir}"
  printf 'tar payload for %s\n' "${architecture}" >"${architecture_dir}/${tar_name}"
  printf 'deb payload for %s\n' "${architecture}" >"${architecture_dir}/${deb_name}"
  printf 'run payload for %s\n' "${architecture}" >"${architecture_dir}/${run_name}"
  python3 - "${architecture_dir}" "${version}" "${channel}" "${architecture}" "${tar_name}" "${deb_name}" "${run_name}" <<'PY'
import hashlib
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
version, channel, architecture = sys.argv[2:5]
names = sys.argv[5:8]
types = ("tarball", "debian-package", "guided-run-installer")

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

manifest = {
    "schemaVersion": 2,
    "name": "autark-os",
    "version": version,
    "channel": channel,
    "artifactArchitecture": architecture,
    "runtimeArchitecture": architecture,
    "supportedHostPolicyVersion": "2",
    "artifacts": [
        {"type": artifact_type, "fileName": name, "sha256": digest(root / name)}
        for artifact_type, name in zip(types, names)
    ],
}
(root / "autark-os-artifacts.json").write_text(json.dumps(manifest), encoding="utf-8")
PY
}

create_architecture_fixture amd64

missing_arm_output="${tmp_dir}/missing-arm.out"
if "${repo_root}/scripts/compose-release-manifest.py" compose \
  --input-root "${input_root}" \
  --output-dir "${release_dir}" \
  --host-policy "${repo_root}/scripts/supported-host-matrix.env" \
  --version "${version}" \
  --tag "v${version}" \
  --channel "${channel}" \
  --repository autark-labs/autark-os \
  --build-sha abc123 \
  --published-at 2026-07-13T12:00:00Z >"${missing_arm_output}" 2>&1; then
  printf 'Expected composition without ARM64 artifacts to fail.\n' >&2
  exit 1
fi
grep -q 'Missing arm64 artifact manifest' "${missing_arm_output}"

create_architecture_fixture arm64
"${repo_root}/scripts/compose-release-manifest.py" compose \
  --input-root "${input_root}" \
  --output-dir "${release_dir}" \
  --host-policy "${repo_root}/scripts/supported-host-matrix.env" \
  --version "${version}" \
  --tag "v${version}" \
  --channel "${channel}" \
  --repository autark-labs/autark-os \
  --build-sha abc123 \
  --release-notes-url "https://example.invalid/releases/${version}" \
  --published-at 2026-07-13T12:00:00Z

"${repo_root}/scripts/compose-release-manifest.py" validate --release-dir "${release_dir}"
(cd "${release_dir}" && sha256sum -c SHA256SUMS >/dev/null)

python3 - "${release_dir}/release-manifest.json" <<'PY'
import json
import sys

manifest = json.load(open(sys.argv[1], encoding="utf-8"))
assert manifest["schemaVersion"] == 1
assert manifest["version"] == "7.8.9-beta.1"
assert manifest["tag"] == "v7.8.9-beta.1"
assert manifest["channel"] == "beta"
assert manifest["prerelease"] is True
assert manifest["publishedAt"] == "2026-07-13T12:00:00Z"
assert manifest["minimumBootstrapSchemaVersion"] == 1
assert manifest["supportedHostPolicyVersion"] == "2"
assert manifest["source"] == {"repository": "autark-labs/autark-os", "buildSha": "abc123"}
assert manifest["supportedHosts"]["ubuntu"]["versions"] == ["24.04", "26.04"]
assert manifest["supportedHosts"]["debian"]["versions"] == ["12", "13"]
assert manifest["supportedHosts"]["raspbian"]["versions"] == ["11", "12", "13"]
assert len(manifest["artifacts"]) == 6
assert {(item["architecture"], item["type"]) for item in manifest["artifacts"]} == {
    (architecture, artifact_type)
    for architecture in ("amd64", "arm64")
    for artifact_type in ("tarball", "debian-package", "guided-run-installer")
}
assert all(item["builderArchitecture"] == item["architecture"] for item in manifest["artifacts"])
assert all(item["runtimeArchitecture"] == item["architecture"] for item in manifest["artifacts"])
assert all("/releases/download/v7.8.9-beta.1/" in item["url"] for item in manifest["artifacts"])
PY

corrupt_file="${release_dir}/autark-os_${version}_arm64.deb"
printf 'corruption\n' >>"${corrupt_file}"
corrupt_output="${tmp_dir}/corrupt.out"
if "${repo_root}/scripts/compose-release-manifest.py" validate --release-dir "${release_dir}" >"${corrupt_output}" 2>&1; then
  printf 'Expected corrupted public release artifact to fail validation.\n' >&2
  exit 1
fi
grep -q 'Public artifact checksum mismatch' "${corrupt_output}"

