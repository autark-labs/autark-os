import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAppIssueGuidance } from './ApplicationsPage.issueActions.js';

const app = {
  appId: 'vaultwarden',
  appName: 'Vaultwarden',
  friendlyStatus: 'Ready',
};

test('builds backup-first reinstall guidance for unhealthy apps', () => {
  const guidance = buildAppIssueGuidance({
    app,
    health: { status: 'Needs attention', detail: 'Container keeps restarting.', message: 'Restart loop' },
  });

  assert.equal(guidance.tone, 'red');
  assert.equal(guidance.safeAction.action, 'restart');
  assert.equal(guidance.dangerousActions.length, 2);
  assert.match(guidance.dangerousActions[0].warning, /backup/i);
  assert.match(guidance.dangerousActions[1].warning, /remove app state/i);
});

test('prioritizes private access repair when Tailscale mapping is wrong', () => {
  const guidance = buildAppIssueGuidance({
    app,
    reconciliation: { status: 'mismatched', message: 'Wrong port', detail: 'Tailscale routes to another port.' },
  });

  assert.equal(guidance.safeAction.to, '/access');
  assert.equal(guidance.title, 'Private access needs repair');
});
