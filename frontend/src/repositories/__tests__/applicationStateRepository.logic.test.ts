import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  accessByAppId, appNeedsAttentionFromCanonicalState, applications, applicationStateFreshness,
  applicationStateUpdatedAt, catalogAppIsManaged, displayStatusFromCanonicalState, healthByAppId,
  managedApplications, setAutarkOsJobInState, setRuntimeAppInState, telemetryByAppId,
} from '../applicationStateRepository.logic';
import type { AppRuntimeView } from '@/types/app';
import type { ApplicationState, ApplicationView } from '@/types/applicationState';

const updatedAt = '2026-06-21T12:00:00Z';

test('freshness distinguishes initial, current, refreshing, and failed snapshots', () => {
  assert.equal(applicationStateFreshness(state({ updatedAt: null, stale: true, refreshStatus: 'stale' })).phase, 'checking');
  assert.equal(applicationStateFreshness(state()).phase, 'current');
  assert.equal(applicationStateFreshness(state({ stale: true, refreshStatus: 'running' })).phase, 'refreshing');
  assert.equal(applicationStateFreshness(state({ updatedAt: null, stale: true, refreshStatus: 'error', lastError: 'failed' })).phase, 'unavailable');
  assert.equal(applicationStateFreshness(state(), { transportError: new Error('offline') }).phase, 'stale');
});

test('malformed timestamps and unknown statuses are conservative', () => {
  assert.equal(applicationStateFreshness(state({ updatedAt: 'bad' })).hasUsableData, false);
  assert.equal(applicationStateFreshness(state({ refreshStatus: 'mystery' })).isCurrent, false);
  assert.equal(applicationStateUpdatedAt(state())?.getTime(), new Date(updatedAt).getTime());
});

test('all selectors read the same canonical application collection', () => {
  const canonical = state({ applications: [application('vaultwarden', 'managed', runtimeApp('vaultwarden', 'Ready')), application('jellyfin', 'blocked', null)] });
  assert.deepEqual(applications(canonical).map((app) => app.id), ['vaultwarden', 'jellyfin']);
  assert.deepEqual(managedApplications(canonical).map((app) => app.id), ['vaultwarden']);
  assert.equal(catalogAppIsManaged(canonical, 'vaultwarden'), true);
  assert.equal(catalogAppIsManaged(canonical, 'jellyfin'), false);
  assert.equal(healthByAppId(canonical).vaultwarden.status, 'Ready');
  assert.equal(accessByAppId(canonical).vaultwarden.status, 'reachable');
  assert.equal(telemetryByAppId(canonical).vaultwarden.cpuPercent, '2%');
});

test('canonical runtime health drives presentation without reclassifying ownership', () => {
  const ready = runtimeApp('vaultwarden', 'Ready');
  const unavailable = runtimeApp('homepage', 'Ready', health('Unavailable', 'unreachable'));
  const readyState = state({ applications: [application('vaultwarden', 'managed', ready)] });
  const unavailableState = state({ applications: [application('homepage', 'managed', unavailable)] });
  assert.equal(displayStatusFromCanonicalState(ready, ready.healthSnapshot), 'Ready');
  assert.equal(appNeedsAttentionFromCanonicalState(ready, ready.healthSnapshot, accessByAppId(readyState).vaultwarden, ready.telemetry), false);
  assert.equal(displayStatusFromCanonicalState(unavailable, unavailable.healthSnapshot), 'Unavailable');
  assert.equal(appNeedsAttentionFromCanonicalState(unavailable, unavailable.healthSnapshot, accessByAppId(unavailableState).homepage, unavailable.telemetry), true);
});

test('runtime cache updates preserve canonical order and relationship', () => {
  const canonical = state({ applications: [application('homepage', 'managed', runtimeApp('homepage', 'Ready')), application('syncthing', 'managed', runtimeApp('syncthing', 'Ready')), application('jellyfin', 'blocked', null)] });
  const updated = setRuntimeAppInState(canonical, runtimeApp('syncthing', 'Starting'))!;
  assert.deepEqual(updated.applications.map((app) => app.id), ['homepage', 'syncthing', 'jellyfin']);
  assert.equal(updated.applications[1].runtime?.friendlyStatus, 'Starting');
  assert.equal(updated.applications[1].relationship, 'managed');
  assert.equal(updated.applications[2].runtime, null);
});

test('job overlays update only the targeted canonical runtime', () => {
  const canonical = state({ applications: [application('homepage', 'managed', runtimeApp('homepage', 'Ready')), application('syncthing', 'managed', runtimeApp('syncthing', 'Ready'))] });
  const updated = setAutarkOsJobInState(canonical, job('restart_app', 'syncthing', 'queued'))!;
  assert.equal(updated.applications[0].runtime?.operationState?.kind, undefined);
  assert.equal(updated.applications[1].runtime?.operationState?.kind, 'restarting');
  assert.equal(updated.applications[1].runtime?.friendlyStatus, 'Starting');
  assert.deepEqual(updated.applications[1].runtime?.availableActions, []);
});

test('restore overlays target one app or every managed app', () => {
  const canonical = state({ applications: [application('homepage', 'managed', runtimeApp('homepage', 'Ready')), application('vaultwarden', 'managed', runtimeApp('vaultwarden', 'Ready'))] });
  const targeted = setAutarkOsJobInState(canonical, job('backup_restore', '42:vaultwarden', 'running'))!;
  const full = setAutarkOsJobInState(canonical, job('backup_restore', '42:all', 'running'))!;
  assert.equal(targeted.applications[0].runtime?.operationState?.kind, undefined);
  assert.equal(targeted.applications[1].runtime?.operationState?.kind, 'restoring');
  assert.deepEqual(full.applications.map((app) => app.runtime?.operationState?.kind), ['restoring', 'restoring']);
});

test('an unrelated success does not clear an immediate failure overlay', () => {
  const canonical = state({ applications: [application('vaultwarden', 'managed', runtimeApp('vaultwarden', 'Ready'))] });
  const failed = setAutarkOsJobInState(canonical, job('backup_restore', '42:vaultwarden', 'failed'))!;
  const unrelated = setAutarkOsJobInState(failed, job('backup', 'vaultwarden', 'succeeded'))!;
  const restored = setAutarkOsJobInState(unrelated, job('backup_restore', '42:vaultwarden', 'succeeded'))!;
  assert.equal(failed.applications[0].runtime?.operationState?.kind, 'failed');
  assert.equal(unrelated.applications[0].runtime?.operationState?.kind, 'failed');
  assert.equal(restored.applications[0].runtime?.operationState?.kind, 'idle');
});

function state(overrides: Partial<ApplicationState> = {}): ApplicationState {
  return { applications: [], updatedAt, stale: false, refreshStatus: 'idle', refreshStartedAt: updatedAt, refreshCompletedAt: updatedAt, nextRefreshAt: '2026-06-21T12:00:10Z', lastError: null, ...overrides };
}

function application(id: string, relationship: ApplicationView['relationship'], runtime: AppRuntimeView | null): ApplicationView {
  return {
    id, name: id, category: 'Apps', image: '', summary: '', description: '', relationship, catalogAvailability: 'installable',
    appInstanceId: relationship === 'managed' ? id : '', runtimeState: runtime?.technicalStatus ?? 'unknown', ownershipState: relationship === 'managed' ? 'owned' : 'unowned',
    accessState: runtime ? 'local_ready' : 'not_ready', backupState: 'backup_disabled', issues: [], relationshipLabel: relationship === 'managed' ? 'Installed' : 'Blocked', relationshipDescription: '',
    statusTone: relationship === 'managed' ? 'success' : 'danger', cardTone: relationship === 'managed' ? 'success' : 'danger', installCopyWarningRequired: relationship === 'blocked', reviewExistingHref: null,
    primaryAction: { id: 'manage', label: 'Manage', kind: 'route', href: '/apps', method: null, disabled: false, reason: '' }, availableActions: [], runtime, evidence: null,
  };
}

function runtimeApp(appId: string, friendlyStatus: string, healthSnapshot = health('Ready', 'reachable')): AppRuntimeView {
  return {
    appId, appName: appId, category: 'Apps', description: '', version: '', image: '', friendlyStatus, technicalStatus: 'running', healthCheck: '', runtimePath: '', composeProject: '', accessUrl: `http://localhost/${appId}`,
    desiredAccess: null, observedAccess: { localUrl: `http://localhost/${appId}`, privateUrl: null, localPort: null, protocol: 'http', privateLinkStatus: 'not_configured', lastAccessCheckAt: null, lastSuccessfulAccessAt: null, lastRepairAttemptAt: null, lastRepairStatus: null },
    installedAt: updatedAt, lastBackup: 'Backups disabled', canonicalBackupState: 'backup_disabled', settings: null, telemetry: { cpuPercent: '2%', memoryUsage: '128MiB / 1GiB', memoryPercent: '12%', networkIo: '0B / 0B', blockIo: '0B / 0B', checkedAt: updatedAt },
    healthSnapshot, usageGuide: null, setupGuide: null, appConfiguration: [], recentEvents: [], updatedAt,
  } as AppRuntimeView;
}

function health(status: string, localAccessStatus: string) {
  return { appId: 'app', status, message: status, detail: '', dockerStatus: 'Ready', localAccessStatus, privateAccessStatus: 'not_configured', startupGrace: false, checkedAt: updatedAt };
}

function job(type: string, subjectId: string, status: string) {
  return { jobId: `${type}-1`, type, subjectId, status, currentStep: 'work', steps: [{ id: 'work', label: 'Work', status: 'running' }], createdAt: updatedAt, updatedAt };
}
