#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

fail() {
  printf 'public extension boundary violation: %s\n' "$1" >&2
  exit 1
}

forbidden_paths=(
  "backend/src/main/java/com/autarkos/pro/analysis"
  "backend/src/main/java/com/autarkos/pro/capability"
  "backend/src/main/java/com/autarkos/pro/guardian"
  "backend/src/main/java/com/autarkos/pro/model/AgentCapability.java"
  "backend/src/main/java/com/autarkos/pro/model/GuardianAnalysis.java"
  "backend/src/main/java/com/autarkos/pro/model/ProFeatureId.java"
  "backend/src/main/java/com/autarkos/pro/model/ProInsight.java"
  "backend/src/main/java/com/autarkos/pro/model/ProPresentation.java"
  "frontend/src/pages/ProPage/Guardian"
  "frontend/src/pages/ProPage/components/CapabilityRenderer.tsx"
  "docs/pro/capability-rendering.md"
  "docs/pro/guardian-refresh-strategy.md"
  "docs/pro/contracts/agent-analysis-request-v1.schema.json"
  "docs/pro/contracts/agent-capability-v1.schema.json"
  "docs/pro/contracts/guardian-analysis-v1.schema.json"
  "docs/pro/contracts/pro-insight-v1.schema.json"
  "docs/pro/contracts/pro-presentation-v1.schema.json"
)

for path in "${forbidden_paths[@]}"; do
  if [[ -f "$path" ]]; then
    fail "private feature material is tracked at $path"
  fi
  if [[ -d "$path" ]] && [[ -n "$(find "$path" -type f -print -quit)" ]]; then
    fail "private feature material is tracked at $path"
  fi
done

if rg -n \
  --glob '!**/__tests__/**' \
  'pro\.(guardian|change-intelligence|capacity-forecast|backup-confidence|safe-operations|update-safety|connect|managed-support)|ProGuardian|GuardianAnalysis|ProInsight|ProPresentation|CapacityForecast|BackupConfidence' \
  backend/src/main/java \
  frontend/src \
  docs/pro/contracts \
  docs/pro/openapi \
  tools/pro-simulator; then
  fail "feature-specific Pro contracts or implementation remain in CE"
fi

if rg -n \
  --glob '!**/__tests__/**' \
  'function (assess|score|forecast|correlate)|sevenDayGrowthBytes|relatedChanges|recentChanges' \
  backend/src/main/java/com/autarkos/pro \
  frontend/src/pages/ProPage \
  tools/pro-simulator; then
  fail "private analysis or derived feature state remains in CE"
fi

required_paths=(
  "backend/src/main/java/com/autarkos/extensions/ExtensionHostController.java"
  "backend/src/main/java/com/autarkos/extensions/ExtensionHostService.java"
  "backend/src/main/java/com/autarkos/extensions/ExtensionStateStore.java"
  "frontend/src/extensions/ExtensionSlot.tsx"
  "frontend/src/extensions/extensionLoader.ts"
  "docs/pro/contracts/extension-ui-manifest-v1.schema.json"
  "docs/pro/contracts/extension-surface-request-v1.schema.json"
  "docs/pro/contracts/extension-surface-response-v1.schema.json"
)

for path in "${required_paths[@]}"; do
  [[ -f "$path" ]] || fail "required generic extension host file is missing: $path"
done

grep -Fq 'import(/* @vite-ignore */ entrypointUrl)' \
  frontend/src/extensions/extensionLoader.ts ||
  fail "extension entrypoint is not loaded on demand"

grep -Fq 'surface="pro.dashboard"' \
  frontend/src/pages/ProPage/ProPage.tsx ||
  fail "Pro dashboard extension slot is missing"
grep -Fq 'surface="storage.insights"' \
  frontend/src/pages/StoragePage/StoragePage.tsx ||
  fail "Storage extension slot is missing"
grep -Fq 'surface="discover.insights"' \
  frontend/src/pages/MarketplacePage/MarketplacePage.tsx ||
  fail "Discover extension slot is missing"

if rg -n \
  --glob '!**/__tests__/**' \
  'AUTARK_PRO_API_TOKEN|agent-api-token|Authorization.*Bearer|http://autark-pro-agent' \
  frontend/src; then
  fail "browser code can reach or authenticate to the private service directly"
fi

if rg -ni \
  'MiB per day|percent pressure threshold|stale after [0-9]+|requires at least [0-9]+ (observations|retained)' \
  docs/adr docs/pro docs/security; then
  fail "public documentation contains private policy or threshold detail"
fi

if rg -n \
  'https?://[^ )]*(github|gitlab|bitbucket)[^ )]*(pro-client|pro-agent)' \
  docs/adr docs/pro docs/security; then
  fail "public documentation contains a private repository URL"
fi

printf 'Autark-OS generic private-extension boundary checks passed.\n'
