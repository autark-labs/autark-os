import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const page = readFileSync(resolve(process.cwd(), 'src/pages/MarketplacePage/MarketplacePage.tsx'), 'utf8');

test('Discover keeps only one dominant recommendation above the catalog', () => {
  assert.match(page, /\{!showStartHere && <CanonicalRecommendedAction className="mb-4" \/>\}/);
  assert.match(page, /\{showStartHere && \([\s\S]*<StarterAppHandoff/);
  assert.doesNotMatch(page, /Recommended path/);
});

test('Discover uses a compact header and compact first-run guidance before filters', () => {
  assert.match(page, /<header className="mb-4 rounded-2xl[^"]* p-4/);
  assert.match(page, /text-2xl font-bold[^"]*md:text-3xl/);
  assert.match(page, /className="mb-4"[\s\S]*filterAriaLabel="Discover filters"/);
  assert.match(page, /const recommendation = recommendations\.find\(\(item\) => !item\.installed\) \?\? recommendations\[0\]/);
  assert.match(page, /Start with \{recommendation\.app\.name\}/);
  assert.doesNotMatch(page, /recommendations\.map\(\(recommendation\) => \(/);
});

test('Discover preserves dismissal and explicit restoration of first-run guidance', () => {
  assert.match(page, /window\.localStorage\.setItem\(START_HERE_DISMISSAL_KEY, 'true'\)/);
  assert.match(page, /window\.localStorage\.removeItem\(START_HERE_DISMISSAL_KEY\)/);
  assert.match(page, /Show Start here/);
});
