import assert from 'node:assert/strict';
import { test } from 'vitest';
import { diagnosticsHeadline, diagnosticsSummaryRows, productionConflictSummary } from '../SupportPage.diagnosticsModel';

test('Diagnostics headline prefers plain Ready and Needs attention states', () => {
  assert.equal(diagnosticsHeadline({ status: 'ready', findings: [] }, { status: 'ready' }), 'Ready');
  assert.equal(diagnosticsHeadline({ status: 'ready', findings: [{ id: 'docker' }] }, { status: 'ready' }), 'Needs attention');
  assert.equal(diagnosticsHeadline(null, null), 'Status unavailable');
});

test('Diagnostics summary does not render missing data as ready', () => {
  const rows = diagnosticsSummaryRows({ summary: null, doctor: null, setup: null });

  assert.deepEqual(rows.map((row) => [row.value, row.tone]), [
    ['Status unavailable', 'warning'],
    ['Status unavailable', 'warning'],
    ['Status unavailable', 'warning'],
    ['Status unavailable', 'warning'],
    ['Status unavailable', 'warning'],
  ]);
});

test('Diagnostics summary includes apps found on the server without treating owned apps as issues', () => {
  const rows = diagnosticsSummaryRows({
    summary: { dockerStatus: 'Ready', tailscaleStatus: 'Ready', findings: [] },
    doctor: { checks: [{ id: 'docker', status: 'ok' }, { id: 'tailscale', status: 'ok' }] },
    applications: [
      application('owned', 'managed'),
      application('legacy', 'recovery_required'),
      application('conflict', 'blocked'),
    ],
  });

  assert.deepEqual(rows.map((row) => row.label), ['Docker', 'Apps', 'Tailscale', 'Backups', 'Storage']);
  assert.deepEqual(rows.find((row) => row.id === 'apps'), {
    id: 'apps',
    label: 'Apps',
    value: '2 found on this server',
    tone: 'warning',
  });
});

test('Diagnostics summary surfaces app repair state from canonical managed apps', () => {
  const rows = diagnosticsSummaryRows({
    summary: { dockerStatus: 'Ready', tailscaleStatus: 'Ready', findings: [] },
    doctor: { checks: [{ id: 'docker', status: 'ok' }, { id: 'tailscale', status: 'ok' }] },
    applications: [
      application('vaultwarden', 'managed', 'auto_repairing'),
      application('home-assistant', 'managed', 'repair_failed'),
      application('homepage', 'managed', 'watching'),
    ],
  });

  assert.deepEqual(rows.find((row) => row.id === 'apps'), {
    id: 'apps',
    label: 'Apps',
    value: '1 repairing, 1 repair failed',
    tone: 'warning',
  });
});

function application(id, relationship, remediationState = null) {
  return {
    id, relationship,
    runtime: relationship === 'managed' ? { appId: id, remediation: remediationState ? { state: remediationState } : null } : null,
  };
}

test('Diagnostics copy separates production conflicts from allowed development instances', () => {
  assert.equal(productionConflictSummary({ existingInstall: { conflict: false } }), null);
  assert.equal(productionConflictSummary({ devMode: false, existingInstall: { conflict: true, summary: 'Another install exists.' } }).title, 'Existing Autark-OS install found');
  assert.equal(productionConflictSummary({ devMode: true, existingInstall: { conflict: false, developmentInstanceAllowed: true, resources: [{ id: 'docker:other' }] } }).title, 'Development instance detected');
});
