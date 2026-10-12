import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

function source(relativePath: string) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('Access renders a compact, tabbed zone view below desktop widths', () => {
  const page = source('src/pages/NetworkPage/NetworkPage.tsx');
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
  assert.match(page, /className="min-h-\[32rem\] xl:min-h-0 xl:flex-1"/);
  assert.doesNotMatch(page, /className="min-h-\[32rem\] lg:min-h-0 lg:flex-1"/);
});

test('reachability cards support keyboard details and non-drag access changes', () => {
  const matrix = source('src/pages/NetworkPage/ReachabilityMatrix.tsx');

  assert.match(matrix, /aria-label=\{`Review \$\{service\.label\}\. \$\{service\.statusLabel\}\.`}/);
  assert.match(matrix, /onClick=\{\(\) => onFocusService\(service\)\}/);
  assert.match(matrix, /focus-visible:ring-2 focus-visible:ring-cyan-200/);
  assert.doesNotMatch(matrix, /function handleCardKeyDown/);
  assert.match(matrix, /SecurityPostureToggleGroup/);
  assert.match(matrix, /dragEnabled/);
});

test('reachability pending follows jobs instead of a local completion timer', () => {
  const page = source('src/pages/NetworkPage/NetworkPage.tsx');
  assert.match(page, /useAutarkOsJobsQuery/);
  assert.match(page, /application.operation.kind/);
  assert.doesNotMatch(page, /processingServiceTokens|20000/);
});

test('Access no longer duplicates private-access setup guidance in the page body', () => {
  const page = source('src/pages/NetworkPage/NetworkPage.tsx');

  assert.doesNotMatch(page, /Use the Tailscale control in the app header/);
});
