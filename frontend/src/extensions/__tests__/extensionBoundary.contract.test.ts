import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../../..');

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('private extension browser boundary', () => {
  it('hosts the downloaded module on every initial product surface', () => {
    expect(source('src/pages/ProPage/ProPage.tsx'))
      .toContain('surface="pro.dashboard"');
    expect(source('src/pages/StoragePage/StoragePage.tsx'))
      .toContain('surface="storage.insights"');
    expect(source('src/pages/MarketplacePage/MarketplacePage.tsx'))
      .toContain('surface="discover.insights"');
  });

  it('loads only a same-origin backend-proxied module on demand', () => {
    const loader = source('src/extensions/extensionLoader.ts');
    expect(loader).toContain('/api/v1/extensions/');
    expect(loader).toContain('import(/* @vite-ignore */ entrypointUrl)');
    expect(loader).not.toMatch(/agent-api-token|Authorization|autark-pro-agent:8080/);
  });

  it('does not compile private feature presentation into the CE Pro page', () => {
    const page = source('src/pages/ProPage/ProPage.tsx');
    expect(page).toContain('<ExtensionSlot');
    expect(page).not.toContain('/guardian');
    expect(page).not.toContain('capabilities');
  });
});
