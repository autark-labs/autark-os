#!/usr/bin/env python3
"""Compose and validate the public, multi-architecture Autark-OS release set."""

from __future__ import annotations

import argparse
import hashlib
import json
import shlex
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote


ARCHITECTURES = ("amd64", "arm64")
REQUIRED_TYPES = ("tarball", "debian-package", "guided-run-installer")
MEDIA_TYPES = {
    "tarball": "application/gzip",
    "debian-package": "application/vnd.debian.binary-package",
    "guided-run-installer": "application/octet-stream",
}


class ReleaseManifestError(RuntimeError):
    pass


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_json(path: Path) -> dict:
    try:
        with path.open(encoding="utf-8") as handle:
            value = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        raise ReleaseManifestError(f"Could not read JSON {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ReleaseManifestError(f"Expected a JSON object: {path}")
    return value


def parse_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise ReleaseManifestError(f"Could not read host policy {path}: {exc}") from exc
    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise ReleaseManifestError(f"Invalid host policy line: {raw_line}")
        key, raw_value = line.split("=", 1)
        parsed = shlex.split(raw_value, posix=True)
        if len(parsed) != 1:
            raise ReleaseManifestError(f"Invalid host policy value for {key}")
        values[key] = parsed[0]
    return values


def required_policy_value(policy: dict[str, str], name: str) -> str:
    value = policy.get(name, "")
    if not value:
        raise ReleaseManifestError(f"Host policy is missing {name}")
    return value


def list_value(policy: dict[str, str], name: str) -> list[str]:
    return required_policy_value(policy, name).split()


def supported_hosts(policy: dict[str, str]) -> dict:
    return {
        "debian": {
            "versions": list_value(policy, "AUTARK_OS_SUPPORTED_DEBIAN_VERSIONS"),
            "architectures": list_value(policy, "AUTARK_OS_SUPPORTED_DEBIAN_ARCHITECTURES"),
        },
        "ubuntu": {
            "versions": list_value(policy, "AUTARK_OS_SUPPORTED_UBUNTU_VERSIONS"),
            "architectures": list_value(policy, "AUTARK_OS_SUPPORTED_UBUNTU_ARCHITECTURES"),
        },
        "raspbian": {
            "versions": list_value(policy, "AUTARK_OS_SUPPORTED_RASPBIAN_VERSIONS"),
            "architectures": list_value(policy, "AUTARK_OS_SUPPORTED_RASPBIAN_ARCHITECTURES"),
        },
    }


def verify_source_manifest(manifest: dict, architecture: str, version: str, channel: str) -> tuple[str, str]:
    if manifest.get("schemaVersion") != 2:
        raise ReleaseManifestError(f"{architecture} artifact manifest must use schemaVersion 2")
    if manifest.get("version") != version:
        raise ReleaseManifestError(
            f"{architecture} artifact version {manifest.get('version')!r} does not match {version!r}"
        )
    if manifest.get("channel") != channel:
        raise ReleaseManifestError(
            f"{architecture} artifact channel {manifest.get('channel')!r} does not match {channel!r}"
        )
    if manifest.get("artifactArchitecture") != architecture:
        raise ReleaseManifestError(f"{architecture} artifact manifest declares the wrong architecture")
    if manifest.get("runtimeArchitecture") != architecture:
        raise ReleaseManifestError(f"{architecture} runtime manifest declares the wrong architecture")
    build_sha = str(manifest.get("buildSha", ""))
    build_date = str(manifest.get("buildDate", ""))
    if not build_sha or build_sha in {"development", "unknown"}:
        raise ReleaseManifestError(f"{architecture} artifact manifest has no verified buildSha")
    if not build_date or build_date == "development":
        raise ReleaseManifestError(f"{architecture} artifact manifest has no verified buildDate")
    return build_sha, build_date


def collect_architecture_assets(
    input_root: Path,
    output_dir: Path,
    architecture: str,
    version: str,
    channel: str,
    repository: str,
    tag: str,
) -> tuple[list[dict], str, str, str]:
    architecture_dir = input_root / architecture
    source_manifest_path = architecture_dir / "autark-os-artifacts.json"
    if not source_manifest_path.is_file():
        raise ReleaseManifestError(f"Missing {architecture} artifact manifest: {source_manifest_path}")
    source_manifest = load_json(source_manifest_path)
    build_sha, build_date = verify_source_manifest(source_manifest, architecture, version, channel)
    policy_version = str(source_manifest.get("supportedHostPolicyVersion", ""))
    if not policy_version:
        raise ReleaseManifestError(f"{architecture} artifact manifest has no supportedHostPolicyVersion")

    source_artifacts = source_manifest.get("artifacts")
    if not isinstance(source_artifacts, list):
        raise ReleaseManifestError(f"{architecture} artifact manifest has no artifact list")
    by_type = {item.get("type"): item for item in source_artifacts if isinstance(item, dict)}
    if set(by_type) != set(REQUIRED_TYPES):
        raise ReleaseManifestError(
            f"{architecture} artifact manifest must contain exactly: {', '.join(REQUIRED_TYPES)}"
        )

    public_assets: list[dict] = []
    for artifact_type in REQUIRED_TYPES:
        source_entry = by_type[artifact_type]
        filename = str(source_entry.get("fileName", ""))
        if not filename or Path(filename).name != filename:
            raise ReleaseManifestError(f"Unsafe or missing {architecture} artifact filename: {filename!r}")
        source_file = architecture_dir / filename
        if not source_file.is_file():
            raise ReleaseManifestError(f"Missing {architecture} artifact: {source_file}")
        detected_sha = sha256(source_file)
        if detected_sha != source_entry.get("sha256"):
            raise ReleaseManifestError(f"Checksum mismatch in source manifest for {filename}")
        destination = output_dir / filename
        if destination.exists():
            raise ReleaseManifestError(f"Duplicate public artifact filename: {filename}")
        shutil.copy2(source_file, destination)
        encoded_name = quote(filename)
        public_assets.append(
            {
                "type": artifact_type,
                "fileName": filename,
                "url": f"https://github.com/{repository}/releases/download/{quote(tag)}/{encoded_name}",
                "sizeBytes": destination.stat().st_size,
                "sha256": detected_sha,
                "architecture": architecture,
                "runtimeArchitecture": architecture,
                "builderArchitecture": architecture,
                "mediaType": MEDIA_TYPES[artifact_type],
            }
        )
    return public_assets, policy_version, build_sha, build_date


def write_release_notes(
    output_path: Path,
    version: str,
    channel: str,
    release_notes_url: str,
) -> None:
    prerelease_note = "Beta release; use on a test host first." if channel != "stable" else "Stable release."
    notes_link = release_notes_url or "Release notes are included with this GitHub Release."
    output_path.write_text(
        "\n".join(
            [
                f"# Autark-OS {version}",
                "",
                prerelease_note,
                "",
                "Supported hosts:",
                "",
                "- Ubuntu 24.04 and 26.04 LTS on amd64 or arm64",
                "- Debian 12 and 13 on amd64 or arm64",
                "- 64-bit Raspberry Pi OS 12 and 13 on arm64",
                "- 64-bit Raspberry Pi OS 11 on compatible older Raspberry Pi hardware",
                "",
                "Choose the `amd64` asset for Intel/AMD systems and `arm64` for a 64-bit Raspberry Pi or ARM server.",
                "",
                f"More information: {notes_link}",
                "",
            ]
        ),
        encoding="utf-8",
    )


def compose(args: argparse.Namespace) -> None:
    input_root = Path(args.input_root).resolve()
    output_dir = Path(args.output_dir).resolve()
    policy_path = Path(args.host_policy).resolve()
    if output_dir == Path("/"):
        raise ReleaseManifestError("Refusing to use / as a release output directory")
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True)

    policy = parse_env(policy_path)
    assets: list[dict] = []
    policy_versions: set[str] = set()
    artifact_build_shas: set[str] = set()
    artifact_build_dates: set[str] = set()
    for architecture in ARCHITECTURES:
        architecture_assets, policy_version, artifact_build_sha, artifact_build_date = collect_architecture_assets(
            input_root,
            output_dir,
            architecture,
            args.version,
            args.channel,
            args.repository,
            args.tag,
        )
        assets.extend(architecture_assets)
        policy_versions.add(policy_version)
        artifact_build_shas.add(artifact_build_sha)
        artifact_build_dates.add(artifact_build_date)

    expected_policy_version = required_policy_value(policy, "AUTARK_OS_SUPPORTED_HOST_POLICY_VERSION")
    if policy_versions != {expected_policy_version}:
        raise ReleaseManifestError(
            f"Artifact host policy versions {sorted(policy_versions)} do not match {expected_policy_version}"
        )
    if artifact_build_shas != {args.build_sha}:
        raise ReleaseManifestError(
            f"Artifact build SHAs {sorted(artifact_build_shas)} do not match workflow build SHA {args.build_sha!r}"
        )
    if len(artifact_build_dates) != 1:
        raise ReleaseManifestError(f"Artifact build dates do not agree: {sorted(artifact_build_dates)}")

    published_at = args.published_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    release_manifest = {
        "schemaVersion": 1,
        "name": "autark-os",
        "version": args.version,
        "tag": args.tag,
        "channel": args.channel,
        "prerelease": args.channel != "stable",
        "publishedAt": published_at,
        "releaseNotesUrl": args.release_notes_url,
        "minimumBootstrapSchemaVersion": 1,
        "supportedHostPolicyVersion": expected_policy_version,
        "source": {
            "repository": args.repository,
            "buildSha": args.build_sha,
            "buildDate": next(iter(artifact_build_dates)),
        },
        "requirements": {
            "minimumMemoryMb": int(required_policy_value(policy, "AUTARK_OS_MIN_MEMORY_MB")),
            "minimumDiskKb": int(required_policy_value(policy, "AUTARK_OS_MIN_DISK_KB")),
            "init": required_policy_value(policy, "AUTARK_OS_REQUIRED_INIT"),
        },
        "supportedHosts": supported_hosts(policy),
        "artifacts": sorted(assets, key=lambda item: (item["architecture"], item["type"])),
    }
    manifest_path = output_dir / "release-manifest.json"
    manifest_path.write_text(json.dumps(release_manifest, indent=2) + "\n", encoding="utf-8")
    notes_path = output_dir / "RELEASE_NOTES.md"
    write_release_notes(notes_path, args.version, args.channel, args.release_notes_url)

    checksum_targets = sorted(
        [path for path in output_dir.iterdir() if path.is_file() and path.name != "SHA256SUMS"],
        key=lambda path: path.name,
    )
    checksums = "".join(f"{sha256(path)}  {path.name}\n" for path in checksum_targets)
    (output_dir / "SHA256SUMS").write_text(checksums, encoding="utf-8")
    validate_release_dir(output_dir)


def parse_checksums(path: Path) -> dict[str, str]:
    checksums: dict[str, str] = {}
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise ReleaseManifestError(f"Could not read {path}: {exc}") from exc
    for line in lines:
        if not line.strip():
            continue
        parts = line.split(maxsplit=1)
        if len(parts) != 2:
            raise ReleaseManifestError(f"Invalid checksum line: {line}")
        digest, filename = parts
        filename = filename.lstrip("* ")
        if filename in checksums:
            raise ReleaseManifestError(f"Duplicate checksum entry: {filename}")
        checksums[filename] = digest
    return checksums


def validate_release_dir(release_dir: Path) -> None:
    manifest_path = release_dir / "release-manifest.json"
    manifest = load_json(manifest_path)
    if manifest.get("schemaVersion") != 1:
        raise ReleaseManifestError("Public release manifest must use schemaVersion 1")
    if manifest.get("channel") not in {"beta", "stable"}:
        raise ReleaseManifestError("Public release channel must be beta or stable")
    if manifest.get("prerelease") != (manifest.get("channel") != "stable"):
        raise ReleaseManifestError("Prerelease state does not agree with the release channel")
    source = manifest.get("source")
    if not isinstance(source, dict) or not source.get("repository"):
        raise ReleaseManifestError("Public release manifest has no source repository")
    if not source.get("buildSha") or source.get("buildSha") in {"development", "unknown"}:
        raise ReleaseManifestError("Public release manifest has no verified source build SHA")
    if not source.get("buildDate") or source.get("buildDate") == "development":
        raise ReleaseManifestError("Public release manifest has no verified source build date")
    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, list) or len(artifacts) != 6:
        raise ReleaseManifestError("Public release manifest must contain six architecture-specific artifacts")

    observed_pairs: set[tuple[str, str]] = set()
    expected_checksum_files = {"release-manifest.json", "RELEASE_NOTES.md"}
    for artifact in artifacts:
        if not isinstance(artifact, dict):
            raise ReleaseManifestError("Invalid public artifact entry")
        architecture = artifact.get("architecture")
        artifact_type = artifact.get("type")
        pair = (str(architecture), str(artifact_type))
        if architecture not in ARCHITECTURES or artifact_type not in REQUIRED_TYPES:
            raise ReleaseManifestError(f"Unexpected public artifact: {pair}")
        if pair in observed_pairs:
            raise ReleaseManifestError(f"Duplicate public artifact: {pair}")
        observed_pairs.add(pair)
        filename = str(artifact.get("fileName", ""))
        if not filename or Path(filename).name != filename:
            raise ReleaseManifestError(f"Invalid public artifact filename: {filename!r}")
        artifact_path = release_dir / filename
        if not artifact_path.is_file():
            raise ReleaseManifestError(f"Public artifact is missing: {filename}")
        detected_sha = sha256(artifact_path)
        if artifact.get("sha256") != detected_sha:
            raise ReleaseManifestError(f"Public artifact checksum mismatch: {filename}")
        if artifact.get("sizeBytes") != artifact_path.stat().st_size:
            raise ReleaseManifestError(f"Public artifact size mismatch: {filename}")
        if artifact.get("runtimeArchitecture") != architecture or artifact.get("builderArchitecture") != architecture:
            raise ReleaseManifestError(f"Architecture provenance mismatch: {filename}")
        if artifact.get("mediaType") != MEDIA_TYPES[artifact_type]:
            raise ReleaseManifestError(f"Media type mismatch: {filename}")
        if not str(artifact.get("url", "")).endswith("/" + quote(filename)):
            raise ReleaseManifestError(f"Immutable asset URL mismatch: {filename}")
        expected_checksum_files.add(filename)
    if observed_pairs != {(arch, artifact_type) for arch in ARCHITECTURES for artifact_type in REQUIRED_TYPES}:
        raise ReleaseManifestError("Public release is missing a required architecture/type pair")

    checksums = parse_checksums(release_dir / "SHA256SUMS")
    if set(checksums) != expected_checksum_files:
        raise ReleaseManifestError(
            f"SHA256SUMS entries do not match release files: expected {sorted(expected_checksum_files)}, got {sorted(checksums)}"
        )
    for filename, expected_sha in checksums.items():
        if sha256(release_dir / filename) != expected_sha:
            raise ReleaseManifestError(f"SHA256SUMS verification failed: {filename}")


def validate(args: argparse.Namespace) -> None:
    validate_release_dir(Path(args.release_dir).resolve())


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    compose_parser = subparsers.add_parser("compose", help="Join amd64 and arm64 CI artifacts")
    compose_parser.add_argument("--input-root", required=True)
    compose_parser.add_argument("--output-dir", required=True)
    compose_parser.add_argument("--host-policy", required=True)
    compose_parser.add_argument("--version", required=True)
    compose_parser.add_argument("--tag", required=True)
    compose_parser.add_argument("--channel", choices=("beta", "stable"), required=True)
    compose_parser.add_argument("--repository", required=True)
    compose_parser.add_argument("--build-sha", required=True)
    compose_parser.add_argument("--release-notes-url", default="")
    compose_parser.add_argument("--published-at", default="")
    compose_parser.set_defaults(handler=compose)

    validate_parser = subparsers.add_parser("validate", help="Validate a joined public release directory")
    validate_parser.add_argument("--release-dir", required=True)
    validate_parser.set_defaults(handler=validate)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        args.handler(args)
    except ReleaseManifestError as exc:
        print(f"[autark-os release manifest] error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
