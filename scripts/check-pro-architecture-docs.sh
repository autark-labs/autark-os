#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

required_files=(
  "docs/adr/ADR-001-autark-pro-module-model.md"
  "docs/adr/ADR-002-pro-privilege-boundary.md"
  "docs/adr/ADR-003-pro-service-and-repository-boundaries.md"
  "docs/pro/ce-invariants.md"
  "docs/pro/repository-inventory.md"
)

for relative_path in "${required_files[@]}"; do
  if [[ ! -s "$ROOT_DIR/$relative_path" ]]; then
    echo "missing required Pro architecture document: $relative_path" >&2
    exit 1
  fi
done

module_adr="$ROOT_DIR/docs/adr/ADR-001-autark-pro-module-model.md"
privilege_adr="$ROOT_DIR/docs/adr/ADR-002-pro-privilege-boundary.md"
invariants="$ROOT_DIR/docs/pro/ce-invariants.md"

grep -Fq "separately downloaded signed extension" "$module_adr"
grep -Fq "The private image also carries the Pro browser module" "$module_adr"
grep -Fq "no Docker socket" "$privilege_adr"
grep -Fq "cannot prevent CE process startup" "$invariants"

if rg -n 'https?://[^ )]*(github|gitlab|bitbucket)[^ )]*(pro-client|pro-agent)' \
  "$ROOT_DIR/docs/adr" "$ROOT_DIR/docs/pro"; then
  echo "private Pro repository URL found in public architecture docs" >&2
  exit 1
fi

echo "Autark Pro architecture documentation checks passed."
