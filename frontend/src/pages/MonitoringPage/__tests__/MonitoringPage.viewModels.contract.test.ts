import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('Monitoring page delegates chart and resource view models to tested helpers', () => {
  assert.equal(existsSync(resolve(root, 'src/pages/MonitoringPage/extensions/MonitoringPage.viewModels.js')), true);
  assert.equal(existsSync(resolve(root, 'src/pages/MonitoringPage/extensions/__tests__/MonitoringPage.viewModels.test.ts')), true);

  const page = source('src/pages/MonitoringPage/MonitoringPage.tsx');
  const viewModels = source('src/pages/MonitoringPage/extensions/MonitoringPage.viewModels.js');

  assert.match(page, /from '.\/extensions\/MonitoringPage\.viewModels'/);
  assert.doesNotMatch(page, /function buildCategoryData|function buildLevelData|function buildResourceData|function buildHostTrendData|function buildAppTrendData/);
  assert.match(viewModels, /export function buildCategoryData/);
  assert.match(viewModels, /export function buildLevelData/);
  assert.match(viewModels, /export function buildResourceData/);
  assert.match(viewModels, /export function buildHostTrendData/);
  assert.match(viewModels, /export function buildAppTrendData/);
});
