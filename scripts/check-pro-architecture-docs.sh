#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

required_files=(
  "docs/adr/ADR-001-autark-pro-module-model.md"
  "docs/adr/ADR-002-pro-privilege-boundary.md"
  "docs/adr/ADR-003-pro-service-and-repository-boundaries.md"
  "docs/pro/ce-invariants.md"
  "docs/pro/repository-inventory.md"
  "docs/pro/implementation-status.md"
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
tracker="$ROOT_DIR/docs/pro/implementation-status.md"

grep -Fq "No second React application" "$module_adr"
grep -Fq "retained use" "$module_adr"
grep -Fq "no Docker socket" "$privilege_adr"
grep -Fq "cannot prevent CE process startup" "$invariants"

for story in \
  PRO-000 PRO-001 PRO-002 \
  PRO-101 PRO-102 PRO-103 PRO-104 PRO-105 PRO-106 PRO-107 PRO-108 PRO-109 \
  PRO-110 PRO-111 PRO-112 PRO-113 PRO-114 PRO-115 PRO-116 \
  PRO-201 PRO-202 PRO-203 PRO-204 PRO-205 PRO-206 PRO-207 PRO-208 \
  PRO-301 PRO-302 PRO-303 PRO-304 PRO-305 \
  PRO-401 PRO-402 PRO-403 PRO-404 \
  PRO-501 PRO-502 PRO-503 PRO-504 PRO-505; do
  grep -Fq "$story" "$tracker" || {
    echo "implementation tracker is missing $story" >&2
    exit 1
  }
done

if rg -n 'https?://[^ )]*autark[^ )]*(pro-client|pro-agent)' \
  "$ROOT_DIR/docs/adr" "$ROOT_DIR/docs/pro"; then
  echo "private Pro repository URL found in public architecture docs" >&2
  exit 1
fi

echo "Autark Pro architecture documentation checks passed."
