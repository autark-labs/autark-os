#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

python3 - "${repo_root}/scripts/autark-os-update-helper" "${tmp_dir}" <<'PY'
import datetime as dt
import hashlib
import importlib.machinery
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
from unittest.mock import patch

sys.dont_write_bytecode = True
script_path = Path(sys.argv[1])
root = Path(sys.argv[2])
loader = importlib.machinery.SourceFileLoader("autark_os_update_helper", str(script_path))
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)


def expect(code, operation):
    try:
        operation()
        raise AssertionError(f"expected {code}")
    except module.HelperError as error:
        assert error.code == code, error.code


def add_file(archive, name, content):
    entry = tarfile.TarInfo(name)
    entry.size = len(content)
    archive.addfile(entry, io.BytesIO(content))


# The staged archive extractor accepts a normal bundle and rejects both path
# traversal and link entries before any file escapes its protected directory.
valid_archive = root / "valid.tar.gz"
with tarfile.open(valid_archive, "w:gz") as archive:
    add_file(archive, "release/autark-os-release.json", b"{}")
    add_file(archive, "release/payload.txt", b"payload")
bundle = module.safe_extract(valid_archive, root / "valid-extract")
assert bundle == root / "valid-extract" / "release"

traversal_archive = root / "traversal.tar.gz"
with tarfile.open(traversal_archive, "w:gz") as archive:
    add_file(archive, "../escaped", b"no")
expect("invalid_archive", lambda: module.safe_extract(traversal_archive, root / "traversal-extract"))

link_archive = root / "link.tar.gz"
with tarfile.open(link_archive, "w:gz") as archive:
    entry = tarfile.TarInfo("release-link")
    entry.type = tarfile.SYMTYPE
    entry.linkname = "/etc/passwd"
    archive.addfile(entry)
expect("invalid_archive", lambda: module.safe_extract(link_archive, root / "link-extract"))

unsafe_runtime = root / "unsafe-runtime"
unsafe_runtime.mkdir()
unsafe_state = unsafe_runtime / "core-update"
unsafe_state.mkdir(mode=0o755)
expect("unsafe_state_path", lambda: module.state_paths(unsafe_runtime))


# Build a signed-shape release bundle. The Sigstore signature bundle is deliberately
# excluded from SHA256SUMS and verified against it separately.
release = root / "release"
release.mkdir()
release_json = {
    "schemaVersion": 2,
    "version": "1.2.3",
    "artifactArchitecture": "arm64",
    "signatureStatus": "signed",
}
(release / "autark-os-release.json").write_text(json.dumps(release_json), encoding="utf-8")
(release / "payload.txt").write_text("payload", encoding="utf-8")
(release / "SHA256SUMS.sigstore.json").write_text("signed bundle", encoding="utf-8")
checksums = []
for path in (release / "autark-os-release.json", release / "payload.txt"):
    checksums.append(f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}")
(release / "SHA256SUMS").write_text("\n".join(checksums) + "\n", encoding="utf-8")
identity = module.verify_checksums(release)
assert identity == hashlib.sha256((release / "SHA256SUMS").read_bytes()).hexdigest()

(release / "unlisted.txt").write_text("unexpected", encoding="utf-8")
expect("invalid_checksums", lambda: module.verify_checksums(release))
(release / "unlisted.txt").unlink()
(release / "payload.txt").write_text("tampered", encoding="utf-8")
expect("checksum_mismatch", lambda: module.verify_checksums(release))
(release / "payload.txt").write_text("payload", encoding="utf-8")

with patch.object(module, "host_architecture", return_value="amd64"):
    expect("architecture_mismatch", lambda: module.candidate(release, "a" * 32, module.verify_checksums(release)))


# An approval binds a single bundle/identity pair and cannot be replayed once
# the root worker records it as used.
approvals = root / "approvals"
approvals.mkdir()
fixed_now = dt.datetime(2026, 1, 1, tzinfo=dt.timezone.utc)
with patch.object(module, "now", return_value=fixed_now):
    approval = module.write_approval(approvals, "a" * 32, "sha256:test", "job-123")
    approval_path, approval_data = module.load_approval(approvals, approval, "a" * 32, "sha256:test")
    approval_data["used"] = True
    module.replace_approval(approval_path, approval_data)
    expect("approval_invalid", lambda: module.load_approval(approvals, approval, "a" * 32, "sha256:test"))


# A worker crash or failed health-gated updater produces durable failed state
# rather than leaving an approval or an "applying" state stranded.
runtime = root / "runtime"
runtime.mkdir()
_state_root, staged, protected_approvals, state_file = module.state_paths(runtime)
identifier = "b" * 32
protected_bundle = staged / identifier / "bundle"
protected_bundle.parent.mkdir()
import shutil
shutil.copytree(release, protected_bundle)
checksum_identity = module.verify_checksums(protected_bundle)
with patch.object(module, "host_architecture", return_value="arm64"):
    protected_release = module.candidate(protected_bundle, identifier, checksum_identity)
with patch.object(module, "host_architecture", return_value="arm64"):
    approval = module.write_approval(protected_approvals, identifier, protected_release["identity"], "job-health")
    with patch.object(module, "verify_signature"), patch.object(module, "update_cli", return_value=Path("/fixed/autark-os")), patch.object(module.subprocess, "run", return_value=subprocess.CompletedProcess([], 17)):
        module.run_update(runtime, root / "install", root / "key", root / "verifier", identifier, approval)
assert module.load_state(state_file)["status"] == "failed"
expect("approval_invalid", lambda: module.load_approval(protected_approvals, approval, identifier, protected_release["identity"]))

with patch.object(module, "host_architecture", return_value="arm64"):
    start_failure_approval = module.write_approval(protected_approvals, identifier, protected_release["identity"], "job-start")
    with patch.object(module, "verify_signature"), patch.object(module, "update_cli", side_effect=module.HelperError("updater_missing", "missing")):
        module.run_update(runtime, root / "install", root / "key", root / "verifier", identifier, start_failure_approval)
assert module.load_state(state_file)["status"] == "failed"


# The verifier is invoked with fixed arguments, never browser supplied command
# text, and only after the signed bundle is present.
key = root / "release.pub"
verifier = root / "cosign"
key.write_text("public key", encoding="utf-8")
verifier.write_text("verifier", encoding="utf-8")
completed = subprocess.CompletedProcess([], 0, stdout="", stderr="")
with patch.object(module, "require_regular_root_owned"), patch.object(module.subprocess, "run", return_value=completed) as run:
    module.verify_signature(release, key, verifier)
run.assert_called_once_with(
    [str(verifier), "verify-blob", "--key", str(key), "--bundle", str(release / "SHA256SUMS.sigstore.json"), str(release / "SHA256SUMS")],
    capture_output=True,
    text=True,
    timeout=45,
    check=False,
)

source = script_path.read_text(encoding="utf-8")
assert '"--url"' not in source
assert '"--command"' not in source
assert 'choices=["status", "stage", "inspect", "verify", "approve", "apply", "run", "run-rollback", "health", "rollback"]' in source
PY
