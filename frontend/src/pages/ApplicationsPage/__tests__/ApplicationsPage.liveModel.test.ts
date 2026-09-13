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
    applications: [application(app)],
    healthByAppId: {},
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
    applications: [application(app)],
    healthByAppId: {},
    telemetryByAppId: {},
  });

  assert.equal(item.iconUrl, '/app-images/vaultwarden.svg');
});

function application(runtime: AppRuntimeView) {
  return {
    id: runtime.appId, name: runtime.appName, category: runtime.category, image: '/app-images/vaultwarden.svg',
    summary: '', description: '', relationship: 'managed' as const, catalogAvailability: 'installable', appInstanceId: runtime.appId,
    runtimeState: runtime.technicalStatus ?? 'unknown', ownershipState: 'owned', accessState: 'local_ready', backupState: 'backup_disabled', issues: [],
    relationshipLabel: 'Installed', relationshipDescription: '', statusTone: 'success', cardTone: 'success', installCopyWarningRequired: false,
    reviewExistingHref: null, primaryAction: { id: 'manage', label: 'Manage', kind: 'route', href: '/apps', method: null, disabled: false, reason: '' },
    availableActions: [], runtime, evidence: null,
  };
}
