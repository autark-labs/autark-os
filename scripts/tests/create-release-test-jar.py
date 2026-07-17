#!/usr/bin/env python3
"""Create the smallest JAR that satisfies the release-identity contract."""

import argparse
import zipfile
from pathlib import Path


parser = argparse.ArgumentParser()
parser.add_argument("--output", required=True)
parser.add_argument("--version", required=True)
parser.add_argument("--build-sha", required=True)
parser.add_argument("--build-date", default="2026-01-01T00:00:00Z")
args = parser.parse_args()

manifest = "\r\n".join(
    [
        "Manifest-Version: 1.0",
        f"Implementation-Version: {args.version}",
        f"Autark-OS-Build-Sha: {args.build_sha}",
        f"Autark-OS-Build-Date: {args.build_date}",
        "",
        "",
    ]
)
output = Path(args.output)
output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as jar:
    jar.writestr("META-INF/MANIFEST.MF", manifest)
