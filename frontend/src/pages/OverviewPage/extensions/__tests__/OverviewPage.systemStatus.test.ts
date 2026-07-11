import assert from 'node:assert/strict';
import { test } from 'vitest';
import { homeSummaryAvailability, homeSystemMetrics } from '../OverviewPage.systemStatus';
import type { SystemSummary } from '@/types/system';

function summary(overrides: Partial<SystemSummary> = {}): SystemSummary {
  return {
    deviceName: 'Autark-OS',
    instanceId: 'instance',
    lanUrl: 'http://autark.local',
    setup: { complete: true, status: 'complete', nextStep: 'done', summary: 'Setup is complete.' },
    docker: { ready: true, summary: 'Docker is ready.' },
    access: { mode: 'local_only', summary: 'Local access is ready.' },
    apps: { installed: 1, running: 1, needsAttention: 0, readyToOpen: [] },
    backups: { state: 'protected_by_restore_point', summary: 'A restore point is available.' },
    storage: { state: 'unknown', summary: 'Storage details are available from the Storage page.' },
    issues: [],
    updatedAt: '2026-07-10T00:00:00Z',
    ...overrides,
  };
}

test('uses neutral loading and warning unavailable states until Home has a summary', () => {
  assert.equal(homeSummaryAvailability(null, null), 'loading');
  assert.equal(homeSummaryAvailability(null, 'Request failed'), 'unavailable');
  assert.equal(homeSummaryAvailability(summary(), 'Background refresh failed'), 'available');

  const loading = homeSystemMetrics(null, 'loading');
  assert.equal(loading.backups.value, 'Checking');
  assert.equal(loading.backups.tone, 'info');

  const unavailable = homeSystemMetrics(null, 'unavailable');
  assert.equal(unavailable.access.value, 'Status unavailable');
  assert.equal(unavailable.access.tone, 'warning');
});

test('only calls backup protection confirmed when the summary reports a restore point', () => {
  const protectedMetrics = homeSystemMetrics(summary(), 'available');
  assert.equal(protectedMetrics.backups.value, 'Protected by restore point');
  assert.equal(protectedMetrics.backups.tone, 'success');

  const notConfiguredMetrics = homeSystemMetrics(summary({ backups: { state: 'not_configured', summary: 'No restore point is required yet.' } }), 'available');
  assert.equal(notConfiguredMetrics.backups.value, 'Not configured');
  assert.equal(notConfiguredMetrics.backups.tone, 'info');
});

test('does not map unknown access modes to local-ready access', () => {
  const metrics = homeSystemMetrics(summary({ access: { mode: 'unknown', summary: '' } }), 'available');
  assert.equal(metrics.access.value, 'Status unavailable');
  assert.equal(metrics.access.tone, 'warning');
});
