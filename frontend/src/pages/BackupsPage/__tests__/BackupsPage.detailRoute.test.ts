import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { AppBackupStatus, RestorePoint } from '@/types/backup';
import {
  backupNavigatorLink,
  backupNavigatorSearchWithSelection,
  parseBackupNavigatorRoute,
} from '../BackupsPage.detailRoute';

const apps = [{ appId: 'vaultwarden' }] as AppBackupStatus[];
const appRestorePoint = { appId: 'vaultwarden', id: 101, scope: 'app' } as RestorePoint;
const fullRestorePoint = { appId: '__full__', id: 202, scope: 'full' } as RestorePoint;

test('backup route selects a specific app folder and restore point', () => {
  const route = parseBackupNavigatorRoute(new URLSearchParams('app=vaultwarden&backup=101'), apps, [appRestorePoint, fullRestorePoint]);

  assert.deepEqual(route, { directory: 'app:vaultwarden', restorePointId: 101 });
});

test('a direct restore point link resolves the matching folder', () => {
  const route = parseBackupNavigatorRoute(new URLSearchParams('backup=202'), apps, [appRestorePoint, fullRestorePoint]);

  assert.deepEqual(route, { directory: 'full', restorePointId: 202 });
});

test('backup route ignores a restore point outside the requested app folder', () => {
  const route = parseBackupNavigatorRoute(new URLSearchParams('app=vaultwarden&backup=202'), apps, [appRestorePoint, fullRestorePoint]);

  assert.deepEqual(route, { directory: 'app:vaultwarden', restorePointId: null });
});

test('backup selection links retain unrelated page parameters', () => {
  const search = backupNavigatorSearchWithSelection(new URLSearchParams('from=apps&scope=full'), {
    directory: 'app:vaultwarden',
    restorePointId: 101,
  });

  assert.equal(search.toString(), 'from=apps&app=vaultwarden&backup=101');
});

test('backup navigator exposes a reusable direct-link builder for other surfaces', () => {
  assert.equal(
    backupNavigatorLink({ directory: 'app:vaultwarden', restorePointId: 101 }),
    '/backups?app=vaultwarden&backup=101',
  );
});
