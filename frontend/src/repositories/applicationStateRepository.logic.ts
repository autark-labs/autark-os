import type {
  AppAccessCheck,
  AppHealthSnapshot,
  AppRuntimeView,
  AppTelemetry,
  BackendAppOperationState,
} from '@/types/app';
import type { ApplicationState, ApplicationStateFreshness, ApplicationView } from '@/types/applicationState';
import type { AutarkOsJob } from '@/types/jobs';
import { jobTypeLabel } from './jobRepository.logic';

export const applicationStateQueryKey = ['application-state'];

type AppOperationKind = BackendAppOperationState['kind'] | 'installing' | 'repairing' | 'restoring';

type AppOperation = {
  jobType?: string;
  currentStep?: string;
  jobId?: string;
  kind: AppOperationKind;
  label: string;
  message?: string;
};

export function applications(state?: ApplicationState | null): ApplicationView[] {
  return state?.applications ?? [];
}

export function managedApplications(state?: ApplicationState | null): ApplicationView[] {
  return applications(state).filter((application) => application.relationship === 'managed' && application.runtime);
}

export function applicationStateUpdatedAt(state?: ApplicationState | null) {
  if (!state?.updatedAt) {
    return null;
  }
  const updatedAt = new Date(state.updatedAt);
  return Number.isNaN(updatedAt.getTime()) ? null : updatedAt;
}

export function applicationStateFreshness(
  state?: ApplicationState | null,
  options: { transportError?: unknown } = {},
): ApplicationStateFreshness {
  const lastSuccessfulUpdate = applicationStateUpdatedAt(state);
  const hasUsableData = Boolean(lastSuccessfulUpdate);
  const refreshStatus = state?.refreshStatus?.trim().toLowerCase() ?? '';
  const canonicalRefreshFailed = refreshStatus === 'error' || refreshStatus === 'failed' || Boolean(state?.lastError?.trim());
  const refreshStatusUnknown = Boolean(refreshStatus && !['idle', 'running', 'stale', 'error', 'failed'].includes(refreshStatus));
  const refreshFailed = canonicalRefreshFailed || Boolean(options.transportError);

  if (!hasUsableData) {
    return {
      hasUsableData: false,
      isCurrent: false,
      lastSuccessfulUpdate: null,
      phase: refreshFailed ? 'unavailable' : 'checking',
    };
  }

  if (refreshFailed || refreshStatusUnknown || state?.stale || refreshStatus === 'stale') {
    return {
      hasUsableData: true,
      isCurrent: false,
      lastSuccessfulUpdate,
      phase: refreshStatus === 'running' && !refreshFailed ? 'refreshing' : 'stale',
    };
  }

  if (refreshStatus === 'running') {
    return {
      hasUsableData: true,
      isCurrent: false,
      lastSuccessfulUpdate,
      phase: 'refreshing',
    };
  }

  return {
    hasUsableData: true,
    isCurrent: true,
    lastSuccessfulUpdate,
    phase: 'current',
  };
}

export function telemetryByAppId(state?: ApplicationState | null): Record<string, AppTelemetry> {
  return Object.fromEntries(managedApplications(state).map(({ id, runtime }) => [id, runtime?.telemetry ?? unavailableTelemetry()]));
}

export function healthByAppId(state?: ApplicationState | null): Record<string, AppHealthSnapshot> {
  return Object.fromEntries(
    managedApplications(state)
      .filter((application): application is ApplicationView & { runtime: AppRuntimeView & { healthSnapshot: AppHealthSnapshot } } => Boolean(application.runtime?.healthSnapshot))
      .map((application) => [application.id, application.runtime.healthSnapshot]),
  );
}

export function accessByAppId(state?: ApplicationState | null): Record<string, AppAccessCheck> {
  return Object.fromEntries(managedApplications(state).map(({ id, runtime }) => [id, accessCheckFromApp(runtime!)]));
}

export function catalogAppIsManaged(state: ApplicationState | null | undefined, catalogAppId?: string | null) {
  return Boolean(catalogAppId && applications(state).some((application) => application.id === catalogAppId && application.relationship === 'managed'));
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

export function setAutarkOsJobInState(state: ApplicationState | undefined, job?: AutarkOsJob | null) {
  if (!state || !job?.subjectId || !lifecycleJobTypes().has(job.type)) {
    return state;
  }
  const operation = operationStateFromAutarkOsJob(job);
  return {
    ...state,
    applications: state.applications.map((application) => {
      const runtime = application.runtime;
      if (!runtime || !jobTargetsApp(job, application.id) || preservesUnrelatedFailure(runtime.operationState, job)) {
        return application;
      }
      return { ...application, runtime: runtimeAppWithOperation(runtime, operation) };
    }),
  };
}

export function setRuntimeAppInState(state: ApplicationState | undefined, app: AppRuntimeView) {
  if (!state || !app?.appId) {
    return state;
  }
  return {
    ...state,
    applications: state.applications.map((application) => application.id === app.appId && application.relationship === 'managed'
      ? { ...application, runtime: app, runtimeState: app.technicalStatus || application.runtimeState }
      : application),
  };
}

function preservesUnrelatedFailure(operation: BackendAppOperationState | null | undefined, job: AutarkOsJob) {
  return operation?.kind === 'failed' && operation.jobType && operation.jobType !== job.type && job.status === 'succeeded';
}

function lifecycleJobTypes() {
  return new Set(['install_app', 'repair_app', 'save_app_settings', 'start_app', 'stop_app', 'restart_app', 'backup', 'backup_verify', 'backup_restore', 'uninstall_app', 'update_app', 'rollback_app']);
}

function jobTargetsApp(job: AutarkOsJob, appId: string) {
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
  const currentStep = currentAutarkOsJobStepText(job);
  if (job.status === 'failed') {
    if (job.type === 'backup_restore' && restoreTarget(job.subjectId) === 'all') {
      return { kind: 'idle', label: 'Idle', jobId: job.jobId, currentStep, message: currentStep };
    }
    return {
      kind: 'failed',
      label: `${jobTypeLabel(job.type)} failed`,
      jobType: job.type,
      jobId: job.jobId,
      currentStep: '',
      message: job.error?.message || 'Autark-OS could not finish this action.',
    };
  }
  if (job.status !== 'queued' && job.status !== 'running') {
    return { kind: 'idle', label: 'Idle', jobId: job.jobId, currentStep, message: currentStep };
  }
  return { kind: operationKind(job.type), label: operationLabel(job.type), jobId: job.jobId, currentStep, message: currentStep };
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

function operationKind(type: string): AppOperationKind {
  if (type === 'start_app') return 'starting';
  if (type === 'stop_app') return 'stopping';
  if (type === 'restart_app') return 'restarting';
  if (type === 'repair_app') return 'repairing';
  if (type === 'save_app_settings') return 'saving_settings';
  if (type === 'install_app') return 'installing';
  if (type === 'backup' || type === 'backup_verify') return 'backing_up';
  if (type === 'backup_restore') return 'restoring';
  if (type === 'update_app') return 'updating';
  if (type === 'rollback_app') return 'rolling_back';
  if (type === 'uninstall_app') return 'uninstalling';
  return 'idle';
}

function operationLabel(type: string) {
  if (type === 'start_app') return 'Starting';
  if (type === 'stop_app') return 'Pausing';
  if (type === 'restart_app') return 'Restarting';
  if (type === 'repair_app') return 'Repairing';
  if (type === 'save_app_settings') return 'Saving settings';
  if (type === 'install_app') return 'Installing';
  if (type === 'backup' || type === 'backup_verify') return 'Creating backup';
  if (type === 'backup_restore') return 'Restoring';
  if (type === 'update_app') return 'Updating safely';
  if (type === 'rollback_app') return 'Restoring previous release';
  if (type === 'uninstall_app') return 'Uninstalling safely';
  return 'Working';
}

function readinessStateForOperation(operation: AppOperation, current: AppRuntimeView['readinessState']) {
  if (operation.kind === 'idle' || operation.kind === 'failed') return current;
  if (operation.kind === 'starting' || operation.kind === 'restarting' || operation.kind === 'installing') return 'starting';
  if (operation.kind === 'stopping') return 'paused';
  return current;
}

function friendlyStatusForOperation(operation: AppOperation, current: string) {
  if (operation.kind === 'starting' || operation.kind === 'restarting') return 'Starting';
  if (operation.kind === 'installing') return 'Installing';
  if (operation.kind === 'stopping') return 'Paused';
  return current;
}

function currentAutarkOsJobStepText(job: AutarkOsJob) {
  const step = job.steps?.find((candidate) => candidate.id === job.currentStep)
    ?? job.steps?.find((candidate) => candidate.status === 'running')
    ?? job.steps?.find((candidate) => candidate.status === 'pending');
  return step?.message || step?.label || '';
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
  if (app.observedAccess?.privateLinkStatus === 'missing') {
    return {
      appId: app.appId,
      url: app.observedAccess.privateUrl ?? app.accessUrl,
      status: 'unreachable',
      message: 'Private link is missing.',
      checkedAt: health?.checkedAt ?? '',
    };
  }
  return {
    appId: app.appId,
    url: app.accessUrl ?? null,
    status: app.accessUrl ? 'reachable' : 'not_configured',
    message: app.accessUrl ? 'App link is available.' : 'No app link has been configured yet.',
    checkedAt: health?.checkedAt ?? '',
  };
}

function normalizeDisplayStatus(status?: string | null) {
  if (status === 'Stopped') return 'Paused';
  return status || 'Unknown';
}

function isPrivateAccessOnlyWarning(app?: AppRuntimeView | null, health?: AppHealthSnapshot | null) {
  if (health?.status !== 'Needs attention') return false;
  return app?.friendlyStatus === 'Ready'
    && health.dockerStatus === 'Ready'
    && (health.localAccessStatus === 'reachable' || health.localAccessStatus === 'not_configured')
    && !['verified', 'not_enabled'].includes(health.privateAccessStatus);
}

function resourceAlert(telemetry?: AppTelemetry | null) {
  const cpu = percentFromTelemetry(telemetry?.cpuPercent);
  const memory = percentFromTelemetry(telemetry?.memoryPercent);
  if (typeof cpu === 'number' && cpu >= 85) return 'CPU is higher than usual.';
  if (typeof memory === 'number' && memory >= 85) return 'Memory use is higher than usual.';
  return null;
}

function percentFromTelemetry(value?: string | null) {
  if (!value) return null;
  const parsed = Number.parseFloat(value.replace('%', '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function unavailableTelemetry(): AppTelemetry {
  return { cpuPercent: 'Unavailable', memoryUsage: 'Unavailable', memoryPercent: 'Unavailable', networkIo: 'Unavailable', blockIo: 'Unavailable', checkedAt: '' };
}
