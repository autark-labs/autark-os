import assert from 'node:assert/strict';
import { test } from 'vitest';
import { buildAppRemediation, buildAppRemediationFromIssue } from '../appRemediation.js';

const app = {
  appId: 'vaultwarden',
  appName: 'Vaultwarden',
  friendlyStatus: 'Ready',
};

test('describes broken local links as restart or URL updates without reset options', () => {
  const remediation = buildAppRemediation({
    app,
    access: { status: 'unreachable', message: 'http://localhost:8080 did not respond.' },
    health: { status: 'Ready', message: 'Ready', detail: 'Container is healthy.' },
  });

  assert.equal(remediation.cause, 'local-link');
  assert.equal(remediation.safeAction.kind, 'app-action');
  assert.equal(remediation.safeAction.action, 'restart');
  assert.match(remediation.nextStep, /update the app address/i);
  assert.deepEqual(remediation.dangerousActions, []);
});

test('routes private-link remediation to Access instead of generic restart guidance', () => {
  const remediation = buildAppRemediation({
    app,
    reconciliation: { status: 'mismatched', message: 'Wrong port', detail: 'Tailscale routes to another port.' },
  });

  assert.equal(remediation.cause, 'private-access');
  assert.equal(remediation.safeAction.kind, 'link');
  assert.equal(remediation.safeAction.to, '/access');
  assert.doesNotMatch(remediation.nextStep, /restart first/i);
});

test('keeps reinstall and reset recovery backup-first for unhealthy apps', () => {
  const remediation = buildAppRemediation({
    app,
    health: { status: 'Needs attention', detail: 'Container keeps restarting.', message: 'Restart loop' },
  });

  assert.equal(remediation.cause, 'app-health');
  assert.equal(remediation.severity, 'critical');
  assert.equal(remediation.safeAction.action, 'restart');
  assert.equal(remediation.dangerousActions.length, 2);
  assert.match(remediation.dangerousActions[0].warning, /backup/i);
  assert.match(remediation.dangerousActions[1].warning, /remove app state/i);
});

test('normalizes reliability issues into the same private-link model for Overview and Monitoring', () => {
  const remediation = buildAppRemediationFromIssue({
    appId: 'jellyfin',
    appName: 'Jellyfin',
    status: 'missing',
    message: 'Private link is missing.',
    detail: 'No Tailscale Serve route was found.',
    suggestedAction: 'Repair private app links from Access.',
    repairAvailable: true,
    checkedAt: '2026-06-20T12:00:00Z',
  });

  assert.equal(remediation.cause, 'private-access');
  assert.equal(remediation.safeAction.to, '/access');
  assert.equal(remediation.title, 'Private access needs repair');
});
