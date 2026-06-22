import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function source(fileName) {
  return readFileSync(resolve(here, fileName), 'utf8');
}

function projectSource(relativePath) {
  return readFileSync(resolve(here, '../../', relativePath), 'utf8');
}

test('marketplace detail and install wizard do not carry legacy install result props', () => {
  const detail = source('MarketplaceAppDetail.tsx');
  const wizard = source('MarketplaceInstallWizard.tsx');
  const marketplaceTypes = projectSource('types/marketplace.ts');

  assert.doesNotMatch(detail, /\bInstallResult\b|installResult/);
  assert.doesNotMatch(wizard, /\bInstallResult\b|installResult|InstallResultCard|PostInstallGuideCard/);
  assert.doesNotMatch(marketplaceTypes, /\bInstallResult\b|PostInstallGuide|ResolvedSetupField|ResolvedSetupIntegration/);
});
