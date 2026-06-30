import assert from 'node:assert/strict';
import test from 'node:test';
import {
  accessByAppId,
  appNeedsAttentionFromCanonicalState,
  applicationStateUpdatedAt,
  catalogAppIsManaged,
  displayStatusFromCanonicalState,
  healthByAppId,
  managedRuntimeApps,
  removeManagedAppFromState,
  setProjectOsJobInState,
  setRuntimeAppInState,
  setRuntimeAppStatusInState,
  setObservedServiceAdoptedInState,
  observedServices,
  ownershipViews,
  setObservedServicePinnedInState,
  telemetryByAppId,
} from '../applicationStateRepository.logic.js';

const updatedAt = '2026-06-21T12:00:00Z';

test('repository selectors expose canonical app-state slices', () => {
  const state = {
    runtimeApps: [runtimeApp('vaultwarden', 'Ready')],
    observedServices: [{ id: 'docker:found', userStatus: 'found_on_server' }],
    ownershipViews: [{ catalogAppId: 'vaultwarden', state: 'installed_managed' }],
    updatedAt,
  };

  assert.deepEqual(managedRuntimeApps(state).map((app) => app.appId), ['vaultwarden']);
  assert.deepEqual(observedServices(state).map((service) => service.id), ['docker:found']);
  assert.deepEqual(ownershipViews(state).map((view) => view.catalogAppId), ['vaultwarden']);
  assert.equal(applicationStateUpdatedAt(state)?.getTime(), new Date(updatedAt).getTime());
});

test('repository falls back from managed app instances when runtime apps are not present', () => {
  const state = {
    managedApps: [
      {
        catalogAppId: 'homepage',
        name: 'Homepage',
        category: 'Dashboards',
        image: '',
        userStatus: 'Ready',
        runtimeState: 'running',
        accessState: 'local_ready',
        backupState: 'protected_by_restore_point',
        localUrl: 'http://localhost:3005',
        privateUrl: null,
        remediation: {
          state: 'watching',
          label: 'Project OS is watching',
          summary: 'Homepage is ready. If it drifts, Project OS will try safe repair before asking you to intervene.',
          nextActionLabel: 'No action needed',
          tone: 'success',
        },
        updatedAt,
      },
    ],
    runtimeApps: [],
  };

  const [app] = managedRuntimeApps(state);

  assert.equal(app.appId, 'homepage');
  assert.equal(app.friendlyStatus, 'Ready');
  assert.equal(app.accessUrl, 'http://localhost:3005');
  assert.equal(app.canonicalBackupState, 'protected_by_restore_point');
  assert.equal(app.remediation.state, 'watching');
});

test('ready cached health does not mark every app as needing attention', () => {
  const app = runtimeApp('vaultwarden', 'Ready', health('Ready', 'reachable'));
  const telemetry = telemetryByAppId({ runtimeApps: [app] }).vaultwarden;
  const healthById = healthByAppId({ runtimeApps: [app] });
  const accessById = accessByAppId({ runtimeApps: [app] });

  assert.equal(displayStatusFromCanonicalState(app, healthById.vaultwarden), 'Ready');
  assert.equal(accessById.vaultwarden.status, 'reachable');
  assert.equal(appNeedsAttentionFromCanonicalState(app, healthById.vaultwarden, accessById.vaultwarden, telemetry), false);
});

test('private-link-only health warnings do not make ready apps look globally broken', () => {
  const app = runtimeApp('vaultwarden', 'Ready', {
    ...health('Needs attention', 'reachable'),
    message: 'Private link is not responding.',
    detail: 'Tailscale private access needs repair.',
    privateAccessStatus: 'unreachable',
  });
  const accessById = accessByAppId({ runtimeApps: [app] });

  assert.equal(displayStatusFromCanonicalState(app, app.healthSnapshot), 'Ready');
  assert.equal(accessById.vaultwarden.status, 'reachable');
  assert.equal(appNeedsAttentionFromCanonicalState(app, app.healthSnapshot, accessById.vaultwarden, app.telemetry), false);
});

test('only explicit unhealthy or unreachable states need attention', () => {
  const healthyApp = runtimeApp('vaultwarden', 'Ready', health('Ready', 'reachable'));
  const unhealthyApp = runtimeApp('jellyfin', 'Ready', {
    ...health('Needs attention', 'reachable'),
    dockerStatus: 'Unavailable',
    privateAccessStatus: 'not_configured',
  });
  const unreachableApp = runtimeApp('homepage', 'Ready', health('Ready', 'unreachable'));

  assert.equal(appNeedsAttentionFromCanonicalState(healthyApp, healthyApp.healthSnapshot, accessByAppId({ runtimeApps: [healthyApp] }).vaultwarden, healthyApp.telemetry), false);
  assert.equal(appNeedsAttentionFromCanonicalState(unhealthyApp, unhealthyApp.healthSnapshot, accessByAppId({ runtimeApps: [unhealthyApp] }).jellyfin, unhealthyApp.telemetry), true);
  assert.equal(appNeedsAttentionFromCanonicalState(unreachableApp, unreachableApp.healthSnapshot, accessByAppId({ runtimeApps: [unreachableApp] }).homepage, unreachableApp.telemetry), true);
});

test('observed service pinned-state helper preserves recoverable state', () => {
  const state = {
    observedServices: [
      observedService('docker:vaultwarden', 'recoverable', false),
      observedService('docker:gitlab', 'found_on_server', false),
    ],
    pinnedExternalServices: [],
    foundServices: [],
  };

  const pinnedRecoverable = setObservedServicePinnedInState(state, 'docker:vaultwarden', true);
  const pinnedFound = setObservedServicePinnedInState(state, 'docker:gitlab', true);
  const unpinnedFound = setObservedServicePinnedInState(pinnedFound, 'docker:gitlab', false);

  assert.equal(pinnedRecoverable.observedServices[0].pinned, true);
  assert.equal(pinnedRecoverable.observedServices[0].userStatus, 'recoverable');
  assert.equal(pinnedRecoverable.observedServices[0].managementState, 'linked');
  assert.equal(pinnedRecoverable.observedServices[0].availableActions.some((action) => action.id === 'unpin'), true);
  assert.equal(pinnedRecoverable.observedServices[0].availableActions.some((action) => action.id === 'pin'), false);
  assert.deepEqual(pinnedRecoverable.pinnedExternalServices.map((service) => service.id), ['docker:vaultwarden']);
  assert.equal(pinnedFound.observedServices[1].userStatus, 'pinned_external');
  assert.equal(pinnedFound.observedServices[1].managementState, 'linked');
  assert.equal(pinnedFound.observedServices[1].availableActions.some((action) => action.id === 'unpin'), true);
  assert.equal(unpinnedFound.observedServices[1].pinned, false);
  assert.equal(unpinnedFound.observedServices[1].userStatus, 'found_on_server');
  assert.equal(unpinnedFound.observedServices[1].managementState, 'found');
  assert.equal(unpinnedFound.observedServices[1].availableActions.some((action) => action.id === 'pin'), true);
  assert.equal(unpinnedFound.observedServices[1].availableActions.some((action) => action.id === 'unpin'), false);
});

test('observed service adoption helper moves a recoverable service into managed app views', () => {
  const state = {
    runtimeApps: [],
    managedApps: [],
    observedServices: [
      {
        ...observedService('docker:vaultwarden', 'recoverable', true),
        displayName: 'Vaultwarden',
        url: 'http://localhost:8090',
        runtimeState: 'running',
      },
    ],
    pinnedExternalServices: [],
    foundServices: [],
  };

  const adopted = setObservedServiceAdoptedInState(state, 'docker:vaultwarden');

  assert.equal(catalogAppIsManaged(adopted, 'vaultwarden'), true);
  assert.deepEqual(managedRuntimeApps(adopted).map((app) => [app.appId, app.appName, app.friendlyStatus, app.accessUrl]), [
    ['vaultwarden', 'Vaultwarden', 'Ready', 'http://localhost:8090'],
  ]);
  assert.deepEqual(adopted.managedApps.map((app) => [app.catalogAppId, app.name, app.userStatus]), [
    ['vaultwarden', 'Vaultwarden', 'Ready'],
  ]);
  assert.deepEqual(adopted.observedServices.map((service) => [service.id, service.userStatus, service.managedByThisProjectOs, service.pinned]), [
    ['docker:vaultwarden', 'installed_managed', true, false],
  ]);
});

test('catalogAppIsManaged finds managed runtime and managed instance records', () => {
  assert.equal(catalogAppIsManaged({ runtimeApps: [runtimeApp('pi-hole', 'Ready')] }, 'pi-hole'), true);
  assert.equal(catalogAppIsManaged({ managedApps: [{ catalogAppId: 'pi-hole' }] }, 'pi-hole'), true);
  assert.equal(catalogAppIsManaged({ observedServices: [observedService('docker:pi-hole', 'pinned_external', true)] }, 'pi-hole'), false);
});

test('runtime app cache helpers update routine management state', () => {
  const state = {
    runtimeApps: [runtimeApp('pi-hole', 'Ready')],
    managedApps: [{ catalogAppId: 'pi-hole', name: 'Pi-hole', userStatus: 'Ready' }],
  };
  const starting = setRuntimeAppStatusInState(state, 'pi-hole', 'Starting');
  const updated = setRuntimeAppInState(starting, { ...runtimeApp('pi-hole', 'Paused'), appName: 'Pi-hole' });
  const removed = removeManagedAppFromState(updated, 'pi-hole');

  assert.equal(starting.runtimeApps[0].friendlyStatus, 'Starting');
  assert.equal(starting.managedApps[0].userStatus, 'Starting');
  assert.equal(updated.runtimeApps[0].friendlyStatus, 'Paused');
  assert.deepEqual(removed.runtimeApps, []);
  assert.deepEqual(removed.managedApps, []);
});

test('runtime app cache helper preserves existing runtime app order', () => {
  const state = {
    runtimeApps: [
      runtimeApp('homepage', 'Ready'),
      runtimeApp('syncthing', 'Ready'),
      runtimeApp('vaultwarden', 'Ready'),
    ],
    managedApps: [],
  };

  const updated = setRuntimeAppInState(state, { ...runtimeApp('syncthing', 'Starting'), appName: 'Syncthing' });

  assert.deepEqual(updated.runtimeApps.map((app) => app.appId), ['homepage', 'syncthing', 'vaultwarden']);
});

test('project os job helper applies backend operation state without reordering apps', () => {
  const state = {
    runtimeApps: [
      runtimeApp('homepage', 'Ready'),
      runtimeApp('syncthing', 'Ready'),
      runtimeApp('vaultwarden', 'Ready'),
    ],
    managedApps: [
      { catalogAppId: 'homepage', name: 'Homepage', userStatus: 'Ready' },
      { catalogAppId: 'syncthing', name: 'Syncthing', userStatus: 'Ready' },
      { catalogAppId: 'vaultwarden', name: 'Vaultwarden', userStatus: 'Ready' },
    ],
  };

  const updated = setProjectOsJobInState(state, {
    jobId: 'restart-1',
    type: 'restart_app',
    subjectId: 'syncthing',
    status: 'queued',
    currentStep: 'run_command',
    steps: [{ id: 'run_command', label: 'Restart app', status: 'pending', message: 'Project OS is restarting the app.' }],
    createdAt: updatedAt,
    updatedAt,
  });

  assert.deepEqual(updated.runtimeApps.map((app) => app.appId), ['homepage', 'syncthing', 'vaultwarden']);
  assert.equal(updated.runtimeApps[1].operationState.kind, 'restarting');
  assert.equal(updated.runtimeApps[1].operationState.jobId, 'restart-1');
  assert.equal(updated.runtimeApps[1].readinessState, 'starting');
  assert.equal(updated.runtimeApps[1].friendlyStatus, 'Starting');
  assert.deepEqual(updated.runtimeApps[1].availableActions, []);
  assert.equal(updated.managedApps[1].userStatus, 'Starting');
});

function runtimeApp(appId, friendlyStatus, healthSnapshot = null) {
  return {
    appId,
    appName: appId,
    category: 'Apps',
    description: '',
    version: '',
    image: '',
    friendlyStatus,
    technicalStatus: 'running',
    healthCheck: '',
    runtimePath: '',
    composeProject: '',
    accessUrl: `http://localhost/${appId}`,
    desiredAccess: null,
    observedAccess: { localUrl: `http://localhost/${appId}`, privateUrl: null, localPort: null, protocol: 'http', privateLinkStatus: 'not_configured' },
    installedAt: updatedAt,
    lastBackup: 'Backups disabled',
    settings: null,
    telemetry: {
      cpuPercent: '2%',
      memoryUsage: '128MiB / 1GiB',
      memoryPercent: '12%',
      networkIo: '0B / 0B',
      blockIo: '0B / 0B',
      checkedAt: updatedAt,
    },
    healthSnapshot,
    usageGuide: null,
    setupGuide: null,
    appConfiguration: [],
    recentEvents: [],
    updatedAt,
  };
}

function health(status, localAccessStatus) {
  return {
    appId: 'vaultwarden',
    status,
    message: status,
    detail: '',
    dockerStatus: 'Ready',
    localAccessStatus,
    privateAccessStatus: 'not_configured',
    startupGrace: false,
    checkedAt: updatedAt,
  };
}

function observedService(id, userStatus, pinned) {
  return {
    id,
    source: 'docker',
    displayName: id.split(':')[1],
    url: 'http://localhost',
    category: 'External',
    accessScope: 'LAN',
    catalogAppId: 'vaultwarden',
    userStatus,
    userStatusLabel: userStatus === 'recoverable' ? 'Recoverable' : 'Found',
    userStatusDescription: userStatus === 'recoverable' ? 'Recoverable Project OS app.' : 'Found on this server.',
    ownershipState: userStatus === 'recoverable' ? 'legacy_project_os' : 'external_docker',
    runtimeState: 'running',
    pinned,
    managedByThisProjectOs: false,
    availableActions: [],
  };
}
