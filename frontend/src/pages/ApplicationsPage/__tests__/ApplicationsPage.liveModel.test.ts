import assert from 'node:assert/strict';
import { test } from 'vitest';
import { buildApplicationSurfaceItems } from '../extensions/ApplicationsPage.liveModel';
import type { AppRuntimeView } from '@/types/app';

test('unknown managed runtime state does not render as ready', () => {
  const app = {
    appId: 'vaultwarden',
    appName: 'Vaultwarden',
    category: 'Security',
    friendlyStatus: undefined,
  } as AppRuntimeView;

  const [item] = buildApplicationSurfaceItems({
    accessByAppId: {},
    apps: [app],
    healthByAppId: {},
    observedServices: [],
    telemetryByAppId: {},
  });

  assert.equal(item.status, 'Needs review');
  assert.equal(item.readinessState, 'unknown');
  assert.equal(item.attentionState, 'needs_review');
});

test('managed cards use the catalog icon when a runtime image is a Docker reference', () => {
  const app = {
    appId: 'vaultwarden',
    appName: 'Vaultwarden',
    category: 'Security',
    friendlyStatus: 'Ready',
    image: 'vaultwarden/server:1.36.0',
  } as AppRuntimeView;

  const [item] = buildApplicationSurfaceItems({
    accessByAppId: {},
    apps: [app],
    healthByAppId: {},
    observedServices: [],
    telemetryByAppId: {},
  });

  assert.equal(item.iconUrl, '/app-images/vaultwarden.svg');
});
