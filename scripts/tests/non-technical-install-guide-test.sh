#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
guide="${repo_root}/docs/non-technical-install-guide.md"
readme="${repo_root}/README.md"
docs_index="${repo_root}/docs/README.md"

[[ -f "${guide}" ]]

python3 - "${guide}" "${readme}" "${docs_index}" <<'PY'
from pathlib import Path
import re
import sys

guide = Path(sys.argv[1]).read_text()
readme = Path(sys.argv[2]).read_text()
docs_index = Path(sys.argv[3]).read_text()

required_headings = [
    "# Install Project OS",
    "## Choose Your Install Option",
    "## Prepare The Device",
    "## Run The Installer",
    "## Choose Storage",
    "## Choose Private Access",
    "## Open Project OS",
    "## Install Your First App",
    "## If Setup Needs Attention",
    "## Advanced Install Docs",
]

for heading in required_headings:
    assert heading in guide, f"missing heading: {heading}"

assert "Recommended path" in guide
assert "GUI installer" in guide
assert "One-command installer" in guide
assert "Advanced CLI" in guide
assert "curl -fsSL https://install.project-os.dev | bash" in guide
assert "project-os support-bundle --output" in guide
assert "[Beta installation guide](./beta-installation.md)" in guide
assert "[Street-to-seat installation](./street-to-seat-installation.md)" not in guide
assert "[Installer Technical Implementation](./installer-technical-implementation.md)" not in guide

first_code = re.search(r"```(?:bash|text)?\n(.*?)\n```", guide, re.S)
assert first_code, "guide should include at least one command block"
assert "git clone" not in first_code.group(1), "normal-user guide must not lead with git clone"

first_install_section = guide.split("## Run The Installer", 1)[1].split("## Choose Storage", 1)[0]
assert "git clone" not in first_install_section, "normal-user run path should avoid source checkout"

attention_section = guide.split("## If Setup Needs Attention", 1)[1].split("## Advanced Install Docs", 1)[0]
assert attention_section.count("```") <= 4, "recovery should be visible but not overwhelming"
assert "Save support report" in attention_section

assert "docs/non-technical-install-guide.md" in readme
assert "./non-technical-install-guide.md" in docs_index
assert "./beta-installation.md" in docs_index
PY
