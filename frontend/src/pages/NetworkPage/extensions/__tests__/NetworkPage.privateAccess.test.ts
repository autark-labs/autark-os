import assert from 'node:assert/strict';
import { test } from 'vitest';
import { privateAccessUrlForApp } from '../NetworkPage.privateAccess';

test('private access URLs only come from canonical or observed backend state', () => {
  const privateUrl = privateAccessUrlForApp({
    appId: 'vaultwarden',
    appName: 'Vaultwarden',
    accessUrl: 'http://localhost:5006',
    observedAccess: {
      localUrl: 'http://localhost:5006',
      privateLinkStatus: 'missing',
    },
    settings: {
      accessUrl: 'http://localhost:5006',
      tailscaleEnabled: true,
    },
  });

  assert.equal(privateUrl, null);
});

test('private access URLs prefer reconciliation state before app state', () => {
  const privateUrl = privateAccessUrlForApp({
    accessRoute: { privateUrl: 'https://stored.tailnet:12890', privateLinkStatus: 'verified' },
    observedAccess: { privateUrl: 'https://observed.tailnet:5006', privateLinkStatus: 'verified' },
    settings: { privateAccessUrl: 'https://settings.tailnet:12890' },
  }, {
    expectedPrivateUrl: 'https://expected.tailnet:12890',
    status: 'healthy',
  });

  assert.equal(privateUrl, 'https://expected.tailnet:12890');
});

test('private access URLs suppress known local-port HTTPS conflicts', () => {
  const privateUrl = privateAccessUrlForApp({
    accessRoute: {
      privateLinkStatus: 'port_conflict',
      privateUrl: 'https://beast.tail5d987f.ts.net:5006',
    },
    observedAccess: { privateUrl: 'https://beast.tail5d987f.ts.net:5006' },
    settings: { privateAccessUrl: 'https://beast.tail5d987f.ts.net:5006' },
  });

  assert.equal(privateUrl, null);
});
