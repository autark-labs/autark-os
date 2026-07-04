import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

function source(relativePath: string) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('Access page avoids duplicate Tailscale status and progressively discloses private link details', () => {
  const page = source('src/pages/NetworkPage/NetworkPage.tsx');
  const matrix = source('src/pages/NetworkPage/ReachabilityMatrix.tsx');
  const deepLinks = source('src/pages/NetworkPage/extensions/NetworkPage.deepLinks.ts');
  const issues = source('src/pages/NetworkPage/NetworkIssuesPanel.tsx');
  const shell = source('src/layout/AppShell.tsx');
  const header = source('src/layout/SystemStatusHeader.tsx');

  assert.doesNotMatch(page, /TailscaleAccessCard/);
  assert.match(page, /ReachabilityMatrix/);
  assert.match(page, /moveReachabilityService/);
  assert.match(page, /ServiceTypeFilterDropdown/);
  assert.match(page, /MultiSelect/);
  assert.match(page, /parseAccessDeepLink\(location\.search\)/);
  assert.match(page, /navigate\(accessDeepLinkForService\(service, \{ tab: 'matrix' \}\), \{ replace: true \}\)/);
  assert.match(page, /deepLinkTarget\.tab \?\? 'matrix'/);
  assert.match(page, /ReachabilityTypeFilter/);
  assert.match(page, /InstalledAppsAPIClient\.updateSettings/);
  assert.match(page, /pendingReachabilityByServiceId/);
  assert.match(page, /applyPendingReachability\(reachabilityServices, pendingReachabilityByServiceId\)/);
  assert.match(page, /pendingReachabilityTokenRef/);
  assert.match(page, /setPendingReachabilityByServiceId\(\(current\) => \(\{ \.\.\.current, \[service\.id\]: \{ acknowledged: false, token: pendingToken, zone: targetZone \} \}\)\)/);
  assert.match(page, /setRuntimeAppInApplicationStateCache\(queryClient, appWithReachabilityZone\(appForSettings, targetZone\)\)/);
  assert.match(page, /syncCanonicalAppMutationResult\(queryClient, \{ app: appWithReachabilityZone\(updated, targetZone\) \}\)/);
  assert.match(page, /removePendingReachabilityForToken\(current, service\.id, pendingToken\)/);
  assert.match(page, /pending\.acknowledged && reachabilityServices\.find\(\(service\) => service\.id === serviceId\)\?\.zone === pending\.zone/);
  assert.match(page, /removePendingReachabilityIds\(current, settledServiceIds\)/);
  assert.match(page, /void invalidateNetworkQueries\(queryClient\)/);
  assert.match(deepLinks, /tab.*matrix/);
  assert.match(deepLinks, /focus/);
  assert.match(matrix, /onDrop/);
  assert.match(matrix, /GhostReachabilityCard/);
  assert.match(matrix, /activeDropZone/);
  assert.match(matrix, /ServiceIcon/);
  assert.match(matrix, /service\.iconUrl/);
  assert.match(matrix, /bg-cyan-950\/80/);
  assert.match(matrix, /xl:max-h-\[calc\(100vh-17rem\)\]/);
  assert.match(matrix, /label\.toLowerCase\(\)/);
  assert.match(matrix, /copiedLinkKey/);
  assert.match(matrix, /onCopyLink\(service\.id, 'local', service\.localUrl\)/);
  assert.match(matrix, /onCopyLink\(service\.id, 'private', service\.privateUrl\)/);
  assert.match(matrix, /TooltipContent/);
  assert.match(matrix, /arrowClassName="bg-slate-800 fill-slate-800"/);
  assert.match(matrix, /privateLinkStatus/);
  assert.match(matrix, /onClick=\{handleCardClick\}/);
  assert.match(matrix, /SecurityPostureToggleGroup/);
  assert.match(matrix, /ToggleGroup/);
  assert.match(matrix, /data-\[state=on\]:bg-cyan-300\/20/);
  assert.match(matrix, /loadingServiceIds/);
  assert.match(matrix, /Processing/);
  assert.doesNotMatch(matrix, /Private links are checked automatically/);
  assert.doesNotMatch(matrix, /Check private link/);
  assert.match(matrix, /draggable/);
  assert.match(matrix, /Reachability matrix/);
  assert.match(matrix, /Details and actions/);
  assert.doesNotMatch(matrix, /grid-cols-\[minmax\(150px,1fr\)_minmax\(180px,1\.2fr\)_minmax\(180px,1\.2fr\)_120px_190px\]/);

  assert.match(issues, /onReviewPrivateLinks/);
  assert.match(issues, /Review services/);
  assert.match(issues, /to="\/diagnostics"/);

  assert.match(shell, /sticky top-0 z-40/);
  assert.doesNotMatch(header, /sticky top-0/);
});
