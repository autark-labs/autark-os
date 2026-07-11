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
