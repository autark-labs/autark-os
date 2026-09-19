import assert from 'node:assert/strict';
import { test } from 'vitest';
import { buildApplicationSurfaceItems } from '../extensions/ApplicationsPage.liveModel';
import type { AppRuntimeView } from '@/types/app';

test('unknown managed runtime state does not render as ready', () => {
  const app = {
    appId: 'vaultwarden',
    appName: 'Vaultwarden',
    category: 'Security',
    state: 'unknown',
    backupProtection: 'backup_disabled',
  } as AppRuntimeView;

  const [item] = buildApplicationSurfaceItems({
    applications: [application(app)],
  });

  assert.equal(item.state, 'unknown');
  assert.equal(item.nextAction?.id, 'review_issue');
});

test('managed cards use the catalog icon when a runtime image is a Docker reference', () => {
  const app = {
    appId: 'vaultwarden',
    appName: 'Vaultwarden',
    category: 'Security',
    state: 'ready',
    backupProtection: 'backup_disabled',
    image: 'vaultwarden/server:1.36.0',
  } as AppRuntimeView;

  const [item] = buildApplicationSurfaceItems({
    applications: [application(app)],
  });

  assert.equal(item.iconUrl, '/app-images/vaultwarden.svg');
});

function application(runtime: AppRuntimeView) {
  return {
    id: runtime.appId, name: runtime.appName, category: runtime.category, image: '/app-images/vaultwarden.svg',
    summary: '', description: '', relationship: 'managed' as const, catalogAvailability: 'installable', appInstanceId: runtime.appId,
    operation: { kind: 'idle' as const }, issues: [],
    relationshipLabel: 'Installed', relationshipDescription: '', statusTone: 'success', cardTone: 'success',
    primaryAction: { id: 'manage', label: 'Manage', kind: 'route', href: '/apps', method: null, disabled: false, reason: '' },
    availableActions: [], runtime, evidence: null,
  };
}

test('registration appearing during install retains its busy operation', () => {
  const runtime = { appId: 'syncthing', appName: 'Syncthing', state: 'starting', backupProtection: 'backup_disabled' } as AppRuntimeView;
  const view = { ...application(runtime), operation: { kind: 'installing', label: 'Installing', jobId: 'install-1', currentStep: 'Finishing install' } };
  const [item] = buildApplicationSurfaceItems({ applications: [view] });
  assert.equal(item.operation.kind, 'installing');
  assert.equal(item.state, 'starting');
});
