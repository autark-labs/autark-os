import assert from 'node:assert/strict';
import test from 'node:test';
import { tailscaleControlActions, tailscaleControlView } from '../TailscaleControlPopover.logic.js';

test('treats dev-mode Tailscale state as an informational mock even if copy changes', () => {
  const view = tailscaleControlView({ installed: true, connected: true, state: 'dev', message: '', dnsName: 'autark-os-dev.tailnet.local' }, null, null);

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

test('does not treat successful setup checks as live Tailscale connection or Serve readiness', () => {
  const view = tailscaleControlView(null, { status: 'ok' }, {
    status: 'warning',
    apps: [
      {
        appId: 'vaultwarden',
        status: 'waiting',
        expectedPrivateUrl: 'https://autark-os.tailnet.ts.net:8443',
        actualPrivateUrl: null,
      },
    ],
  });

  assert.equal(view.connected, false);
  assert.equal(view.httpsReady, false);
  assert.equal(view.serveReady, false);
  assert.equal(view.privateLinksReady, 0);
  assert.equal(view.label, 'Not signed in');
});

test('shows Serve ready only for live verified private-link reconciliation', () => {
  const status = {
    installed: true,
    connected: true,
    state: 'connected',
    message: 'Autark-OS is connected.',
    dnsName: 'autark-os.tailnet.ts.net',
  };
  const desiredOnly = tailscaleControlView(status, { status: 'ok' }, {
    status: 'warning',
    apps: [
      {
        appId: 'vaultwarden',
        status: 'waiting',
        expectedPrivateUrl: 'https://autark-os.tailnet.ts.net:8443',
        actualPrivateUrl: 'https://autark-os.tailnet.ts.net:8443',
      },
    ],
  });

  assert.equal(desiredOnly.connected, true);
  assert.equal(desiredOnly.httpsReady, true);
  assert.equal(desiredOnly.serveReady, false);
  assert.equal(desiredOnly.privateLinksReady, 0);

  const verified = tailscaleControlView(status, { status: 'ok' }, {
    status: 'healthy',
    apps: [
      {
        appId: 'vaultwarden',
        status: 'healthy',
        expectedPrivateUrl: 'https://autark-os.tailnet.ts.net:8443',
        actualPrivateUrl: 'https://autark-os.tailnet.ts.net:8443',
      },
    ],
  });

  assert.equal(verified.connected, true);
  assert.equal(verified.httpsReady, true);
  assert.equal(verified.serveReady, true);
  assert.equal(verified.privateLinksReady, 1);
});
