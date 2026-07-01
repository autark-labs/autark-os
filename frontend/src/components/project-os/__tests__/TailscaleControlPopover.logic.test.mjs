import assert from 'node:assert/strict';
import test from 'node:test';
import { tailscaleControlActions, tailscaleControlView } from '../TailscaleControlPopover.logic.js';

test('treats dev-mode Tailscale state as an informational mock even if copy changes', () => {
  const view = tailscaleControlView({ installed: true, connected: true, state: 'dev', message: '', dnsName: 'project-os-dev.tailnet.local' }, null, null);

  assert.equal(view.mock, true);
  assert.equal(view.connected, true);
  assert.equal(view.tone, 'amber');
  assert.equal(view.label, 'Mock connected');
});

test('keeps connected Tailscale controls available for informational use', () => {
  const actions = tailscaleControlActions({
    connected: true,
    mock: false,
    dnsName: 'project.tail.ts.net',
    deviceName: 'project',
  });

  assert.deepEqual(actions.map((action) => action.id), ['admin', 'access', 'refresh', 'copy-hostname']);
  assert.equal(actions.find((action) => action.id === 'copy-hostname')?.enabled, true);
});

test('offers sign-in and setup-later controls when Tailscale is disconnected', () => {
  const actions = tailscaleControlActions({
    connected: false,
    mock: false,
    dnsName: null,
    deviceName: null,
  });

  assert.deepEqual(actions.map((action) => action.id), ['signin', 'access', 'refresh']);
  assert.equal(actions[0].href, 'https://login.tailscale.com/start');
});
