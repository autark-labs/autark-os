import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { StorageReport } from '@/types/system';
import { aggregateAppStorageTrend, capacitySegments, weeklyAppGrowth } from '../StoragePage.presentation';

function report(overrides: Partial<StorageReport> = {}): StorageReport {
  return {
    status: 'healthy',
    headline: 'Storage has room to grow',
    summary: '',
    hostDisk: { label: 'Host disk', path: '/', totalBytes: 1_000, usableBytes: 400, usedBytes: 600, usedPercent: 60 },
    runtimeDisk: { label: 'Runtime', path: '/var/lib/autark-os', totalBytes: 1_000, usableBytes: 400, usedBytes: 200, usedPercent: 20 },
    backupStorage: { label: 'Backups', path: '/backups', totalBytes: 1_000, usableBytes: 900, usedBytes: 100, usedPercent: 10 },
    apps: [
      { appId: 'immich', appName: 'Immich', status: 'healthy', path: '/apps/immich', usedBytes: 300, sevenDayGrowthBytes: 40, trend: [{ sampledAt: '2026-07-01T00:00:00.000Z', usedBytes: 260 }, { sampledAt: '2026-07-02T00:00:00.000Z', usedBytes: 300 }], backupEnabled: true, backupFrequency: 'daily', lastBackup: '' },
      { appId: 'vaultwarden', appName: 'Vaultwarden', status: 'healthy', path: '/apps/vaultwarden', usedBytes: 80, sevenDayGrowthBytes: 5, trend: [{ sampledAt: '2026-07-01T00:00:00.000Z', usedBytes: 75 }, { sampledAt: '2026-07-02T00:00:00.000Z', usedBytes: 80 }], backupEnabled: true, backupFrequency: 'daily', lastBackup: '' },
    ],
    orphanedData: [],
    recommendations: [],
    installSafety: { status: 'ready', message: '', minimumRecommendedFreeBytes: 0, currentFreeBytes: 400, installAllowed: true },
    backupDestination: null,
    checkedAt: '2026-07-02T00:00:00.000Z',
    ...overrides,
  };
}

test('capacity ribbon keeps external backup bytes out of host capacity', () => {
  const storage = report({
    backupDestination: {
      kind: 'external',
      status: 'ready',
      configuredPath: '/media/backups',
      mountPoint: '/media',
      deviceIdentity: 'backup-drive',
      filesystemType: 'ext4',
      available: true,
      writable: true,
      usableBytes: 900,
      protectsAgainstRuntimeDriveFailure: true,
      message: 'Ready',
      actionLabel: null,
      checkedAt: '2026-07-02T00:00:00.000Z',
    },
  });

  const segments = capacitySegments(storage);

  assert.deepEqual(segments.map((segment) => segment.tone), ['apps', 'other', 'free']);
  assert.equal(segments.reduce((total, segment) => total + segment.bytes, 0), storage.hostDisk.totalBytes);
});

test('capacity ribbon includes on-device backup bytes without exceeding host capacity', () => {
  const segments = capacitySegments(report());

  assert.deepEqual(segments.map((segment) => segment.tone), ['apps', 'backups', 'other', 'free']);
  assert.equal(segments.reduce((total, segment) => total + segment.bytes, 0), 1_000);
});

test('weekly growth and chart data are derived from live app samples', () => {
  const storage = report();

  assert.equal(weeklyAppGrowth(storage), 45);
  assert.deepEqual(aggregateAppStorageTrend(storage.apps), [
    { sampledAt: '2026-07-01T00:00:00.000Z', usedBytes: 335 },
    { sampledAt: '2026-07-02T00:00:00.000Z', usedBytes: 380 },
  ]);
});
