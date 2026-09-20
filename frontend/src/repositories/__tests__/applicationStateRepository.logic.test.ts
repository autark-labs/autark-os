import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  accessByAppId, applications, applicationOpenUrl, applicationStateFreshness, applicationStateUpdatedAt,
  catalogAppIsManaged, healthByAppId, managedApplications, telemetryByAppId,
} from '../applicationStateRepository.logic';
import type { AppRuntimeView } from '@/types/app';
import type { ApplicationState, ApplicationView } from '@/types/applicationState';

const updatedAt = '2026-06-21T12:00:00Z';

test('Open requires an enabled external action, never an arbitrary action URL', () => {
  assert.equal(applicationOpenUrl(null), undefined);
  assert.equal(applicationOpenUrl({ availableActions: [] }), undefined);
  for (const kind of ['external', 'route', 'action', 'disabled']) {
    for (const disabled of [true, false]) {
      const action = { id: 'open', label: 'Open', kind, href: 'https://app.example', method: null, disabled, reason: '' };
      assert.equal(applicationOpenUrl({ availableActions: [action] }), kind === 'external' && !disabled ? action.href : undefined);
    }
  }
});

test('freshness distinguishes initial, current, refreshing, and failed snapshots', () => {
  assert.equal(applicationStateFreshness(state({ updatedAt: null, stale: true, refreshStatus: 'stale' })).phase, 'checking');
  assert.equal(applicationStateFreshness(state()).phase, 'current');
  assert.equal(applicationStateFreshness(state({ stale: true, refreshStatus: 'running' })).phase, 'refreshing');
  assert.equal(applicationStateFreshness(state({ updatedAt: null, stale: true, refreshStatus: 'error', lastError: 'failed' })).phase, 'unavailable');
  assert.equal(applicationStateUpdatedAt(state())?.getTime(), new Date(updatedAt).getTime());
});

test('all selectors read the same canonical application collection', () => {
  const canonical = state({ applications: [application('vaultwarden', 'managed', runtimeApp('vaultwarden')), application('jellyfin', 'blocked', null)] });
  assert.deepEqual(applications(canonical).map((app) => app.id), ['vaultwarden', 'jellyfin']);
  assert.deepEqual(managedApplications(canonical).map((app) => app.id), ['vaultwarden']);
  assert.equal(catalogAppIsManaged(canonical, 'vaultwarden'), true);
  assert.equal(catalogAppIsManaged(canonical, 'jellyfin'), false);
  assert.equal(healthByAppId(canonical).vaultwarden.status, 'Ready');
  assert.equal(accessByAppId(canonical).vaultwarden.status, 'reachable');
  assert.equal(telemetryByAppId(canonical).vaultwarden.cpuPercent, '2%');
});

function state(overrides: Partial<ApplicationState> = {}): ApplicationState {
  return { applications: [], updatedAt, stale: false, refreshStatus: 'idle', refreshStartedAt: updatedAt, refreshCompletedAt: updatedAt, nextRefreshAt: '2026-06-21T12:00:10Z', lastError: null, ...overrides };
}

function application(id: string, relationship: ApplicationView['relationship'], runtime: AppRuntimeView | null): ApplicationView {
  return {
    id, name: id, category: 'Apps', image: '', summary: '', description: '', relationship, catalogAvailability: 'installable',
    appInstanceId: relationship === 'managed' ? id : '', operation: { kind: 'idle' }, issues: [],
    relationshipLabel: relationship === 'managed' ? 'Installed' : 'Blocked', relationshipDescription: '',
    statusTone: relationship === 'managed' ? 'success' : 'danger', cardTone: relationship === 'managed' ? 'success' : 'danger',
    primaryAction: { id: 'manage', label: 'Manage', kind: 'route', href: '/apps', method: null, disabled: false, reason: '' },
    availableActions: [], runtime, evidence: null,
  };
}

function runtimeApp(appId: string): AppRuntimeView {
  return {
    appId, appName: appId, category: 'Apps', description: '', version: '', image: '', state: 'ready', runtimePath: '', composeProject: '', accessUrl: `http://localhost/${appId}`,
    desiredAccess: null, observedAccess: { localUrl: `http://localhost/${appId}`, privateUrl: null, localPort: null, protocol: 'http', privateLinkStatus: 'not_configured', lastAccessCheckAt: null, lastSuccessfulAccessAt: null, lastRepairAttemptAt: null, lastRepairStatus: null },
    installedAt: updatedAt, lastBackup: 'Backups disabled', backupProtection: 'backup_disabled', settings: null,
    telemetry: { cpuPercent: '2%', memoryUsage: '128MiB / 1GiB', memoryPercent: '12%', networkIo: '0B / 0B', blockIo: '0B / 0B', checkedAt: updatedAt },
    healthSnapshot: { appId, status: 'Ready', message: 'Ready', detail: '', dockerStatus: 'Ready', localAccessStatus: 'reachable', privateAccessStatus: 'not_configured', startupGrace: false, checkedAt: updatedAt },
    usageGuide: null, setupGuide: null, appConfiguration: [], recentEvents: [],
  };
}
