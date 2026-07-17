import type {
  AppAccessCheck,
  AppHealthSnapshot,
  AppInstanceView,
  AppTelemetry,
  AppRuntimeView,
  BackendAppOperationState,
} from '@/types/app';
import type { ApplicationState } from '@/types/applicationState';
import type { AppOwnershipView } from '@/types/appOwnership';
import type { AutarkOsJob } from '@/types/jobs';
import type { ObservedServiceAction, ObservedServiceView } from '@/types/observedService';

export const applicationStateQueryKey = ['application-state'];

type ExtendedApplicationState = ApplicationState & {
  privateAccessSummary?: unknown;
};

type AppOperationKind = BackendAppOperationState['kind'] | 'installing' | 'repairing' | 'restoring';

type AppOperation = {
  currentStep?: string;
  jobId?: string;
  kind: AppOperationKind;
  label: string;
  message?: string;
};

export function managedRuntimeApps(state?: ApplicationState | null): AppRuntimeView[] {
  return state?.runtimeApps?.length ? state.runtimeApps : (state?.managedApps ?? []).map(appInstanceToRuntimeView);
}

export function observedServices(state?: ApplicationState | null): ObservedServiceView[] {
  return state?.observedServices ?? [];
}

export function pinnedExternalServices(state?: ApplicationState | null): ObservedServiceView[] {
  return state?.pinnedExternalServices ?? [];
}

export function foundServices(state?: ApplicationState | null): ObservedServiceView[] {
  return state?.foundServices ?? [];
}

export function ownershipViews(state?: ApplicationState | null): AppOwnershipView[] {
  return state?.ownershipViews ?? [];
}

export function applicationStateUpdatedAt(state?: ApplicationState | null) {
  return state?.updatedAt ? new Date(state.updatedAt) : null;
}

export function telemetryByAppId(state?: ApplicationState | null): Record<string, AppTelemetry> {
  return Object.fromEntries(managedRuntimeApps(state).map((app) => [app.appId, app.telemetry ?? unavailableTelemetry()]));
}

export function healthByAppId(state?: ApplicationState | null): Record<string, AppHealthSnapshot> {
  return Object.fromEntries(
    managedRuntimeApps(state)
      .filter((app): app is AppRuntimeView & { healthSnapshot: AppHealthSnapshot } => Boolean(app.healthSnapshot))
      .map((app) => [app.appId, app.healthSnapshot]),
  );
}

export function accessByAppId(state?: ApplicationState | null): Record<string, AppAccessCheck> {
  return Object.fromEntries(managedRuntimeApps(state).map((app) => [app.appId, accessCheckFromApp(app)]));
}

export function catalogAppIsManaged(state: ApplicationState | null | undefined, catalogAppId?: string | null) {
  if (!catalogAppId) {
    return false;
  }
  return managedRuntimeApps(state).some((app) => app.appId === catalogAppId)
    || (state?.managedApps ?? []).some((app) => app.catalogAppId === catalogAppId);
}

export function displayStatusFromCanonicalState(app?: AppRuntimeView | null, health?: AppHealthSnapshot | null) {
  if (app?.canonicalUserStatus) {
    return app.canonicalUserStatus;
  }
  if (isPrivateAccessOnlyWarning(app, health)) {
    return normalizeDisplayStatus(app?.friendlyStatus);
  }
  if (health?.status) {
    return normalizeDisplayStatus(health.status);
  }
  return normalizeDisplayStatus(app?.friendlyStatus);
}

export function appNeedsAttentionFromCanonicalState(
  app?: AppRuntimeView | null,
  health?: AppHealthSnapshot | null,
  access?: AppAccessCheck | null,
  telemetry?: AppTelemetry | null,
) {
  const status = displayStatusFromCanonicalState(app, health);
  if (status === 'Needs attention' || status === 'Unavailable' || status === 'Missing' || status === 'Unknown') {
    return true;
  }
  if (status === 'Ready' && access?.status === 'unreachable') {
    return true;
  }
  return resourceAlert(telemetry) !== null;
}

export function privateAccessSummaryFromState(state?: ExtendedApplicationState | null) {
  return state?.privateAccessSummary ?? null;
}

export function setObservedServicePinnedInState(state: ApplicationState | undefined, serviceId: string, pinned: boolean) {
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
    foundServices: observedServices.filter((service) => !service.managedByThisAutarkOs && !service.pinned && service.userStatus !== 'pinned_external'),
  };
}

export function setObservedServiceAdoptedInState(state: ApplicationState | undefined, serviceId: string) {
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
    foundServices: observedServices.filter((item) => !item.managedByThisAutarkOs && !item.pinned && item.userStatus !== 'pinned_external'),
  };
}

export function setAutarkOsJobInState(state: ApplicationState | undefined, job?: AutarkOsJob | null) {
  if (!state || !job?.subjectId || !lifecycleJobTypes().has(job.type)) {
    return state;
  }

  const operation = operationStateFromAutarkOsJob(job);
  const runtimeApps = (state.runtimeApps ?? []).map((app) => jobTargetsApp(job, app.appId)
    ? runtimeAppWithOperation(app, operation)
    : app);
  const managedApps = (state.managedApps ?? []).map((app) => jobTargetsApp(job, app.catalogAppId)
    ? managedAppWithOperation(app, operation)
    : app);

  return {
    ...state,
    runtimeApps,
    managedApps,
  };
}

export function setRuntimeAppInState(state: ApplicationState | undefined, app: AppRuntimeView) {
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

function lifecycleJobTypes() {
  return new Set(['install_app', 'repair_app', 'start_app', 'stop_app', 'restart_app', 'backup', 'backup_verify', 'backup_restore', 'uninstall_app']);
}

function jobTargetsApp(job: AutarkOsJob | null | undefined, appId?: string | null) {
  if (!job || !appId) {
    return false;
  }
  if (job.subjectId === appId) {
    return true;
  }
  if (job.type !== 'backup_restore') {
    return false;
  }
  const target = restoreTarget(job.subjectId);
  return target === 'all' || target === appId;
}

function restoreTarget(subjectId?: string | null) {
  if (!subjectId) {
    return '';
  }
  const separator = subjectId.indexOf(':');
  return separator < 0 ? subjectId : subjectId.slice(separator + 1);
}

function operationStateFromAutarkOsJob(job: AutarkOsJob): AppOperation {
  if (job.status === 'failed') {
    if (isFailedFullRestore(job)) {
      return {
        kind: 'idle',
        label: 'Idle',
        jobId: job.jobId,
        currentStep: currentAutarkOsJobStepText(job),
        message: currentAutarkOsJobStepText(job),
      };
    }
    return {
      kind: 'failed',
      label: operationLabel(job.type),
      jobId: job.jobId,
      currentStep: '',
      message: job.error?.message || 'Autark-OS could not finish this action.',
    };
  }
  if (job.status !== 'queued' && job.status !== 'running') {
    return {
      kind: 'idle',
      label: 'Idle',
      jobId: job.jobId,
      currentStep: currentAutarkOsJobStepText(job),
      message: currentAutarkOsJobStepText(job),
    };
  }

  return {
    kind: operationKind(job.type),
    label: operationLabel(job.type),
    jobId: job.jobId,
    currentStep: currentAutarkOsJobStepText(job),
    message: currentAutarkOsJobStepText(job),
  };
}

function runtimeAppWithOperation(app: AppRuntimeView, operation: AppOperation): AppRuntimeView {
  return {
    ...app,
    friendlyStatus: friendlyStatusForOperation(operation, app.friendlyStatus),
    readinessState: readinessStateForOperation(operation, app.readinessState),
    operationState: operation,
    availableActions: operation.kind === 'idle' || operation.kind === 'failed' ? app.availableActions : [],
  };
}

function managedAppWithOperation(app: AppInstanceView, operation: AppOperation): AppInstanceView {
  return {
    ...app,
    userStatus: friendlyStatusForOperation(operation, app.userStatus),
    runtimeState: runtimeStateForOperation(operation, app.runtimeState),
    updatedAt: new Date().toISOString(),
  };
}

function operationKind(type: string): AppOperationKind {
  if (type === 'start_app') return 'starting';
  if (type === 'stop_app') return 'stopping';
  if (type === 'restart_app') return 'restarting';
  if (type === 'repair_app') return 'repairing';
  if (type === 'install_app') return 'installing';
  if (type === 'backup' || type === 'backup_verify') return 'backing_up';
  if (type === 'backup_restore') return 'restoring';
  if (type === 'uninstall_app') return 'uninstalling';
  return 'idle';
}

function operationLabel(type: string) {
  if (type === 'start_app') return 'Starting';
  if (type === 'stop_app') return 'Pausing';
  if (type === 'restart_app') return 'Restarting';
  if (type === 'repair_app') return 'Repairing';
  if (type === 'install_app') return 'Installing';
  if (type === 'backup' || type === 'backup_verify') return 'Creating backup';
  if (type === 'backup_restore') return 'Restoring';
  if (type === 'uninstall_app') return 'Uninstalling safely';
  return 'Working';
}

function readinessStateForOperation(operation: AppOperation | null | undefined, current: AppRuntimeView['readinessState']) {
  if (!operation || operation.kind === 'idle' || operation.kind === 'failed') {
    return current;
  }
  if (operation.kind === 'starting' || operation.kind === 'restarting' || operation.kind === 'installing') {
    return 'starting';
  }
  if (operation.kind === 'stopping') {
    return 'paused';
  }
  return current;
}

function friendlyStatusForOperation(operation: AppOperation | null | undefined, current: string) {
  if (!operation || operation.kind === 'idle' || operation.kind === 'failed') {
    return current;
  }
  if (operation.kind === 'starting' || operation.kind === 'restarting') {
    return 'Starting';
  }
  if (operation.kind === 'installing') {
    return 'Installing';
  }
  if (operation.kind === 'stopping') {
    return 'Paused';
  }
  return current;
}

function runtimeStateForOperation(operation: AppOperation | null | undefined, current: string) {
  if (!operation || operation.kind === 'idle' || operation.kind === 'failed') {
    return current;
  }
  if (operation.kind === 'starting' || operation.kind === 'restarting' || operation.kind === 'installing') {
    return 'starting';
  }
  if (operation.kind === 'stopping') {
    return 'stopped';
  }
  return current;
}

function currentAutarkOsJobStepText(job: AutarkOsJob) {
  const step = job.steps?.find((candidate) => candidate.id === job.currentStep)
    ?? job.steps?.find((candidate) => candidate.status === 'running')
    ?? job.steps?.find((candidate) => candidate.status === 'pending');
  return step?.message || step?.label || '';
}

function isFailedFullRestore(job: AutarkOsJob) {
  return job?.type === 'backup_restore' && job.status === 'failed' && restoreTarget(job.subjectId) === 'all';
}

export function setRuntimeAppStatusInState(state: ApplicationState | undefined, appId: string, status: string) {
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

export function removeManagedAppFromState(state: ApplicationState | undefined, appId: string) {
  if (!state || !appId) {
    return state;
  }
  return {
    ...state,
    runtimeApps: (state.runtimeApps ?? []).filter((app) => app.appId !== appId),
    managedApps: (state.managedApps ?? []).filter((app) => app.catalogAppId !== appId),
  };
}

function appInstanceToRuntimeView(app: AppInstanceView): AppRuntimeView {
  return {
    appId: app.catalogAppId,
    appName: app.name,
    category: app.category,
    description: '',
    version: '',
    image: app.icon,
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
      protocol: 'http',
      privateLinkStatus: app.privateUrl ? 'verified' : 'not_configured',
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

function serviceWithPinnedState(service: ObservedServiceView, pinned: boolean): ObservedServiceView {
  const next = {
    ...service,
    pinned,
    managementState: pinned ? 'linked' : 'found',
    availableActions: observedServiceActionsForPinnedState(service.availableActions, pinned),
  };
  if (pinned && service.userStatus === 'found_on_server') {
    return {
      ...next,
      userStatus: 'pinned_external',
      attentionState: 'none',
      userStatusLabel: 'Pinned',
      userStatusDescription: 'Pinned to My Apps. Autark-OS can open it but does not manage its runtime.',
    };
  }
  if (!pinned && service.userStatus === 'pinned_external') {
    return {
      ...next,
      userStatus: 'found_on_server',
      attentionState: 'needs_review',
      userStatusLabel: 'Found',
      userStatusDescription: 'Found on this server.',
    };
  }
  return next;
}

function observedServiceActionsForPinnedState(actions: ObservedServiceAction[] = [], pinned: boolean) {
  const retainedActions = actions.filter((action) => action.id !== 'pin' && action.id !== 'unpin');
  const nextAction = pinned
    ? observedServiceMutationAction('unpin', 'Unpin')
    : observedServiceMutationAction('pin', 'Pin to My Apps');
  return [...retainedActions, nextAction];
}

function observedServiceMutationAction(id: string, label: string): ObservedServiceAction {
  return {
    id,
    label,
    kind: 'mutation',
    href: null,
    method: 'POST',
    disabled: false,
    reason: '',
  };
}

function observedServiceAsManaged(service: ObservedServiceView): ObservedServiceView {
  return {
    ...service,
    userStatus: 'installed_managed',
    userStatusLabel: 'Managed',
    userStatusDescription: 'Managed by this Autark-OS installation.',
    ownershipState: 'owned_managed',
    managementState: 'managed',
    readinessState: service.readinessState ?? (service.runtimeState === 'running' ? 'ready' : 'starting'),
    attentionState: 'none',
    managedByThisAutarkOs: true,
    pinned: false,
  };
}

function runtimeAppFromObservedService(service: ObservedServiceView): AppRuntimeView {
  const appId = service.catalogAppId ?? service.id;
  return {
    appId,
    appName: service.displayName || appId,
    category: service.category || 'Application',
    description: 'Recovered by Autark-OS.',
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

function managedAppFromObservedService(service: ObservedServiceView): AppInstanceView {
  const appId = service.catalogAppId ?? service.id;
  return {
    appInstanceId: `appinst_adopted_${appId}`,
    catalogAppId: appId,
    name: service.displayName || appId,
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

function upsertByKey<T>(items: T[], nextItem: T, keyFor: (item: T) => string | null | undefined) {
  const key = keyFor(nextItem);
  const index = items.findIndex((item) => keyFor(item) === key);
  if (index === -1) {
    return [...items, nextItem];
  }
  return items.map((item, currentIndex) => currentIndex === index ? nextItem : item);
}

function accessCheckFromApp(app: AppRuntimeView): AppAccessCheck {
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
      checkedAt: app.healthSnapshot?.checkedAt ?? '',
    };
  }
  return {
    appId: app.appId,
    url: app.accessUrl ?? null,
    status: app.accessUrl ? 'reachable' : 'not_configured',
    message: app.accessUrl ? 'App link is available.' : 'No app link has been configured yet.',
    checkedAt: app.healthSnapshot?.checkedAt ?? '',
  };
}

function normalizeDisplayStatus(status?: string | null) {
  if (status === 'Stopped') {
    return 'Paused';
  }
  if (!status) {
    return 'Unknown';
  }
  return status;
}

function isPrivateAccessOnlyWarning(app?: AppRuntimeView | null, health?: AppHealthSnapshot | null) {
  if (health?.status !== 'Needs attention') {
    return false;
  }
  const appLooksReady = app?.friendlyStatus === 'Ready';
  const containerLooksReady = health.dockerStatus === 'Ready';
  const localAccessWorks = health.localAccessStatus === 'reachable' || health.localAccessStatus === 'not_configured';
  const privateAccessProblem = !['verified', 'not_enabled'].includes(health.privateAccessStatus);
  return appLooksReady && containerLooksReady && localAccessWorks && privateAccessProblem;
}

function resourceAlert(telemetry?: AppTelemetry | null) {
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

function percentFromTelemetry(value?: string | null) {
  if (!value || value === 'Unavailable') {
    return null;
  }
  const parsed = Number.parseFloat(String(value).replace('%', ''));
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function unavailableTelemetry(): AppTelemetry {
  return {
    cpuPercent: 'Unavailable',
    memoryUsage: 'Unavailable',
    memoryPercent: 'Unavailable',
    networkIo: 'Unavailable',
    blockIo: 'Unavailable',
    checkedAt: '',
  };
}
