import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

function source(relativePath: string) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('Access renders a compact, tabbed zone view below desktop widths', () => {
  const matrix = source('src/pages/NetworkPage/ReachabilityMatrix.tsx');
  const mobileZone = matrix.slice(matrix.indexOf('function MobileReachabilityZone'));

  assert.match(matrix, /<Tabs className="grid gap-3 xl:hidden"/);
  assert.match(matrix, /<TabsList className="grid w-full grid-cols-2/);
  assert.match(matrix, /<MobileReachabilityZone/);
  assert.match(matrix, /title: 'Open Internet'/);
  assert.match(matrix, /title: 'Private \/ Tailscale'/);
  assert.match(matrix, /title: 'Home Network \/ LAN'/);
  assert.match(matrix, /title: 'This Server'/);
  assert.doesNotMatch(mobileZone, /min-h-\[22rem\]/);
});

test('reachability cards support keyboard details and non-drag access changes', () => {
  const matrix = source('src/pages/NetworkPage/ReachabilityMatrix.tsx');

  assert.match(matrix, /function handleCardKeyDown/);
  assert.match(matrix, /event\.key === 'Enter' \|\| event\.key === ' '/);
  assert.match(matrix, /tabIndex=\{0\}/);
  assert.match(matrix, /SecurityPostureToggleGroup/);
  assert.match(matrix, /dragEnabled/);
});

test('new reachability operations cannot be cleared by an older timeout', () => {
  const page = source('src/pages/NetworkPage/NetworkPage.tsx');

  assert.match(page, /processingServiceTokens/);
  assert.match(page, /setServiceProcessingToken\(service\.id, pendingToken/);
  assert.match(page, /removeServiceProcessingForToken\(current, service\.id, pendingToken\)/);
  assert.match(page, /if \(current\[serviceId\] !== token\) \{\s+return current;/);
  assert.match(page, /loadingServiceIds/);
});

test('private-access setup guidance directs users to the shared header Tailscale control', () => {
  const page = source('src/pages/NetworkPage/NetworkPage.tsx');

  assert.match(page, /Use the Tailscale control in the app header/);
});
