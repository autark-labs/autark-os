import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { AppStorageUsage } from '@/types/system';
import {
  parseStorageWorkspaceRoute,
  storageWorkspaceLink,
  storageWorkspaceSearchWithSelection,
} from '../StoragePage.detailRoute';

const apps = [{ appId: 'vaultwarden' }] as AppStorageUsage[];

test('a Storage app link opens the nested App data workspace', () => {
  assert.deepEqual(
    parseStorageWorkspaceRoute(new URLSearchParams('app=vaultwarden'), apps, false),
    { appId: 'vaultwarden', tab: 'apps' },
  );
});

test('Storage route ignores missing apps and unavailable advanced details', () => {
  assert.deepEqual(parseStorageWorkspaceRoute(new URLSearchParams('tab=apps&app=missing'), apps, false), { appId: null, tab: 'apps' });
  assert.deepEqual(parseStorageWorkspaceRoute(new URLSearchParams('tab=advanced'), apps, false), { appId: null, tab: 'overview' });
});

test('Storage route selection preserves unrelated page parameters', () => {
  const search = storageWorkspaceSearchWithSelection(new URLSearchParams('from=backups&tab=cleanup'), { appId: 'vaultwarden', tab: 'apps' });

  assert.equal(search.toString(), 'from=backups&tab=apps&app=vaultwarden');
  assert.equal(storageWorkspaceLink({ appId: 'vaultwarden', tab: 'apps' }), '/storage?tab=apps&app=vaultwarden');
});
