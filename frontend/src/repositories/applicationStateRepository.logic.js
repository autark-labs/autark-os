export const applicationStateQueryKey = ['application-state'];

export function managedRuntimeApps(state) {
  return state?.runtimeApps?.length ? state.runtimeApps : (state?.managedApps ?? []).map(appInstanceToRuntimeView);
}

export function observedServices(state) {
  return state?.observedServices ?? [];
}

export function ownershipViews(state) {
  return state?.ownershipViews ?? [];
}

export function applicationStateUpdatedAt(state) {
  return state?.updatedAt ? new Date(state.updatedAt) : null;
}

export function telemetryByAppId(state) {
  return Object.fromEntries(managedRuntimeApps(state).map((app) => [app.appId, app.telemetry ?? unavailableTelemetry()]));
}

export function healthByAppId(state) {
  return Object.fromEntries(managedRuntimeApps(state).filter((app) => app.healthSnapshot).map((app) => [app.appId, app.healthSnapshot]));
}

export function accessByAppId(state) {
  return Object.fromEntries(managedRuntimeApps(state).map((app) => [app.appId, accessCheckFromApp(app)]));
}

export function updatesByAppId(updates = []) {
  return Object.fromEntries(updates.map((update) => [update.appId, update]));
}

export function catalogAppIsManaged(state, catalogAppId) {
  if (!catalogAppId) {
    return false;
  }
  return managedRuntimeApps(state).some((app) => app.appId === catalogAppId)
    || (state?.managedApps ?? []).some((app) => app.catalogAppId === catalogAppId);
}

export function displayStatusFromCanonicalState(app, health) {
  if (app?.canonicalUserStatus) {
    return app.canonicalUserStatus;
  }
  if (isPrivateAccessOnlyWarning(app, health)) {
    return normalizeDisplayStatus(app?.friendlyStatus ?? 'Ready');
  }
  if (health?.status) {
    return normalizeDisplayStatus(health.status);
  }
  return normalizeDisplayStatus(app?.friendlyStatus);
}

export function appNeedsAttentionFromCanonicalState(app, health, access, telemetry) {
  const status = displayStatusFromCanonicalState(app, health);
  if (status === 'Needs attention' || status === 'Unavailable' || status === 'Missing') {
    return true;
  }
  if (status === 'Ready' && access?.status === 'unreachable') {
    return true;
  }
  return resourceAlert(telemetry) !== null;
}

export function privateAccessSummaryFromState(state) {
  return state?.privateAccessSummary ?? null;
}

export function setObservedServicePinnedInState(state, serviceId, pinned) {
  if (!state || !Array.isArray(state.observedServices)) {
    return state;
  }
  const observedServices = state.observedServices.map((service) => {
    if (service.id !== serviceId) {
      return service;
    }
    return serviceWithPinnedState(service, pinned);
  });
  return {
    ...state,
    observedServices,
    pinnedExternalServices: observedServices.filter((service) => service.pinned || service.userStatus === 'pinned_external'),
    foundServices: observedServices.filter((service) => !service.managedByThisProjectOs && !service.pinned && service.userStatus !== 'pinned_external'),
  };
}

export function setObservedServiceAdoptedInState(state, serviceId) {
  if (!state || !Array.isArray(state.observedServices)) {
    return state;
  }
  const service = state.observedServices.find((item) => item.id === serviceId);
  if (!service?.catalogAppId) {
    return state;
  }
  const runtimeApp = runtimeAppFromObservedService(service);
  const managedApp = managedAppFromObservedService(service);
  const observedServices = state.observedServices.map((item) => item.id === serviceId ? observedServiceAsManaged(item) : item);
  return {
    ...state,
    runtimeApps: upsertByKey(state.runtimeApps ?? [], runtimeApp, (app) => app.appId),
    managedApps: upsertByKey(state.managedApps ?? [], managedApp, (app) => app.catalogAppId),
    observedServices,
    pinnedExternalServices: observedServices.filter((item) => item.pinned || item.userStatus === 'pinned_external'),
    foundServices: observedServices.filter((item) => !item.managedByThisProjectOs && !item.pinned && item.userStatus !== 'pinned_external'),
  };
}

export function setRuntimeAppInState(state, app) {
  if (!state || !app?.appId) {
    return state;
  }
  return {
    ...state,
    runtimeApps: upsertByKey(state.runtimeApps ?? [], app, (item) => item.appId),
    managedApps: (state.managedApps ?? []).map((item) => item.catalogAppId === app.appId ? {
      ...item,
      name: app.appName || item.name,
      userStatus: app.friendlyStatus || item.userStatus,
      runtimeState: app.technicalStatus || item.runtimeState,
      localUrl: app.accessUrl || item.localUrl,
      updatedAt: new Date().toISOString(),
    } : item),
  };
}

export function setRuntimeAppStatusInState(state, appId, status) {
  if (!state || !appId) {
    return state;
  }
  return {
    ...state,
    runtimeApps: (state.runtimeApps ?? []).map((app) => app.appId === appId ? {
      ...app,
      friendlyStatus: status,
      canonicalUserStatus: status,
    } : app),
    managedApps: (state.managedApps ?? []).map((app) => app.catalogAppId === appId ? {
      ...app,
      userStatus: status,
      runtimeState: status === 'Ready' ? 'running' : status === 'Paused' || status === 'Stopped' ? 'stopped' : app.runtimeState,
      updatedAt: new Date().toISOString(),
    } : app),
  };
}

export function removeManagedAppFromState(state, appId) {
  if (!state || !appId) {
    return state;
  }
  return {
    ...state,
    runtimeApps: (state.runtimeApps ?? []).filter((app) => app.appId !== appId),
    managedApps: (state.managedApps ?? []).filter((app) => app.catalogAppId !== appId),
  };
}

function appInstanceToRuntimeView(app) {
  return {
    appId: app.catalogAppId,
    appName: app.name,
    category: app.category,
    description: '',
    version: '',
    image: app.image,
    friendlyStatus: app.userStatus,
    technicalStatus: app.runtimeState,
    healthCheck: '',
    runtimePath: '',
    composeProject: '',
    accessUrl: app.localUrl,
    desiredAccess: null,
    observedAccess: {
      localUrl: app.localUrl,
      privateUrl: app.privateUrl,
      localPort: null,
      protocol: null,
      privateLinkStatus: app.privateUrl ? 'configured' : 'not_configured',
      lastAccessCheckAt: null,
      lastSuccessfulAccessAt: null,
      lastRepairAttemptAt: null,
      lastRepairStatus: null,
    },
    installedAt: app.updatedAt,
    lastBackup: app.backupState,
    settings: null,
    telemetry: unavailableTelemetry(),
    healthSnapshot: null,
    usageGuide: null,
    setupGuide: null,
    appConfiguration: [],
    recentEvents: [],
    canonicalUserStatus: app.userStatus,
    managementState: app.managementState,
    readinessState: app.readinessState,
    attentionState: app.attentionState,
    canonicalRuntimeState: app.runtimeState,
    canonicalOwnershipState: app.ownershipState,
    canonicalAccessState: app.accessState,
    canonicalBackupState: app.backupState,
    canonicalIssues: app.issues ?? [],
    canonicalActions: app.actions ?? [],
    remediation: app.remediation ?? null,
  };
}

function serviceWithPinnedState(service, pinned) {
  const next = { ...service, pinned };
  if (pinned && service.userStatus === 'found_on_server') {
    return {
      ...next,
      userStatus: 'pinned_external',
      managementState: 'linked',
      attentionState: 'none',
      userStatusLabel: 'Pinned',
      userStatusDescription: 'Pinned to My Apps. Project OS can open it but does not manage its runtime.',
    };
  }
  if (!pinned && service.userStatus === 'pinned_external') {
    return {
      ...next,
      userStatus: 'found_on_server',
      managementState: 'found',
      attentionState: 'needs_review',
      userStatusLabel: 'Found',
      userStatusDescription: 'Found on this server.',
    };
  }
  return next;
}

function observedServiceAsManaged(service) {
  return {
    ...service,
    userStatus: 'installed_managed',
    userStatusLabel: 'Managed',
    userStatusDescription: 'Managed by this Project OS installation.',
    ownershipState: 'owned_managed',
    managementState: 'managed',
    readinessState: service.readinessState ?? (service.runtimeState === 'running' ? 'ready' : 'starting'),
    attentionState: 'none',
    managedByThisProjectOs: true,
    pinned: false,
  };
}

function runtimeAppFromObservedService(service) {
  return {
    appId: service.catalogAppId,
    appName: service.displayName || service.catalogAppId,
    category: service.category || 'Application',
    description: 'Recovered by Project OS.',
    version: '',
    image: null,
    friendlyStatus: service.runtimeState === 'running' ? 'Ready' : 'Starting',
    technicalStatus: service.runtimeState || 'recovering',
    healthCheck: service.runtimeState || 'recovering',
    runtimePath: '',
    composeProject: service.id,
    accessUrl: service.url || null,
    desiredAccess: null,
    observedAccess: {
      localUrl: service.url || null,
      privateUrl: null,
      localPort: null,
      protocol: service.url?.startsWith('https://') ? 'https' : 'http',
      privateLinkStatus: 'not_enabled',
      lastAccessCheckAt: null,
      lastSuccessfulAccessAt: null,
      lastRepairAttemptAt: null,
      lastRepairStatus: null,
    },
    installedAt: new Date().toISOString(),
    lastBackup: 'Backups disabled',
    settings: null,
    telemetry: unavailableTelemetry(),
    healthSnapshot: null,
    usageGuide: null,
    setupGuide: null,
    appConfiguration: [],
    recentEvents: [],
    canonicalUserStatus: service.runtimeState === 'running' ? 'Ready' : 'Starting',
    managementState: 'managed',
    readinessState: service.readinessState ?? (service.runtimeState === 'running' ? 'ready' : 'starting'),
    attentionState: 'none',
    canonicalRuntimeState: service.runtimeState || 'recovering',
    canonicalOwnershipState: 'owned',
    canonicalAccessState: service.url ? 'local_ready' : 'not_ready',
    canonicalBackupState: 'backup_disabled',
    canonicalIssues: [],
    canonicalActions: [],
  };
}

function managedAppFromObservedService(service) {
  return {
    appInstanceId: `appinst_adopted_${service.catalogAppId}`,
    catalogAppId: service.catalogAppId,
    name: service.displayName || service.catalogAppId,
    category: service.category || 'Application',
    icon: '',
    userStatus: service.runtimeState === 'running' ? 'Ready' : 'Starting',
    managementState: 'managed',
    readinessState: service.readinessState ?? (service.runtimeState === 'running' ? 'ready' : 'starting'),
    attentionState: 'none',
    installState: 'adopted',
    runtimeState: service.runtimeState || 'recovering',
    ownershipState: 'owned',
    accessState: service.url ? 'local_ready' : 'not_ready',
    backupState: 'backup_disabled',
    localUrl: service.url || '',
    privateUrl: '',
    issues: [],
    actions: [],
    updatedAt: new Date().toISOString(),
  };
}

function upsertByKey(items, nextItem, keyFor) {
  const key = keyFor(nextItem);
  const index = items.findIndex((item) => keyFor(item) === key);
  if (index === -1) {
    return [...items, nextItem];
  }
  return items.map((item, currentIndex) => currentIndex === index ? nextItem : item);
}

function accessCheckFromApp(app) {
  const health = app.healthSnapshot;
  if (health?.localAccessStatus && health.localAccessStatus !== 'not_configured') {
    return {
      appId: app.appId,
      url: app.accessUrl,
      status: health.localAccessStatus,
      message: health.localAccessStatus === 'reachable' ? 'App link is responding.' : 'App is running, but the link is not responding.',
      checkedAt: health.checkedAt,
    };
  }
  const privateStatus = app.observedAccess?.privateLinkStatus;
  if (privateStatus === 'missing') {
    return {
      appId: app.appId,
      url: app.observedAccess?.privateUrl ?? app.accessUrl,
      status: 'unreachable',
      message: 'Private link is missing.',
      checkedAt: app.updatedAt ?? null,
    };
  }
  return {
    appId: app.appId,
    url: app.accessUrl ?? null,
    status: app.accessUrl ? 'reachable' : 'not_configured',
    message: app.accessUrl ? 'App link is available.' : 'No app link has been configured yet.',
    checkedAt: app.updatedAt ?? null,
  };
}

function normalizeDisplayStatus(status) {
  if (status === 'Stopped') {
    return 'Paused';
  }
  if (!status) {
    return 'Starting';
  }
  return status;
}

function isPrivateAccessOnlyWarning(app, health) {
  if (health?.status !== 'Needs attention') {
    return false;
  }
  const appLooksReady = !app?.friendlyStatus || app.friendlyStatus === 'Ready';
  const containerLooksReady = !health.dockerStatus || health.dockerStatus === 'Ready';
  const localAccessWorks = health.localAccessStatus === 'reachable' || health.localAccessStatus === 'not_configured';
  const privateAccessProblem = ['missing', 'unreachable', 'not_configured'].includes(health.privateAccessStatus);
  return appLooksReady && containerLooksReady && localAccessWorks && privateAccessProblem;
}

function resourceAlert(telemetry) {
  const cpu = percentFromTelemetry(telemetry?.cpuPercent);
  const memory = percentFromTelemetry(telemetry?.memoryPercent);
  if (typeof cpu === 'number' && cpu >= 85) {
    return 'CPU is higher than usual.';
  }
  if (typeof memory === 'number' && memory >= 85) {
    return 'Memory use is higher than usual.';
  }
  return null;
}

function percentFromTelemetry(value) {
  if (!value || value === 'Unavailable') {
    return null;
  }
  const parsed = Number.parseFloat(String(value).replace('%', ''));
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function unavailableTelemetry() {
  return {
    cpuPercent: 'Unavailable',
    memoryUsage: 'Unavailable',
    memoryPercent: 'Unavailable',
    networkIo: 'Unavailable',
    blockIo: 'Unavailable',
    checkedAt: null,
  };
}
