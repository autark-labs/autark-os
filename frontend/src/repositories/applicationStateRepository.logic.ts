import type {
  AppAccessCheck,
  AppHealthSnapshot,
  AppRuntimeView,
  AppTelemetry,
} from '@/types/app';
import type { ApplicationState, ApplicationStateFreshness, ApplicationView } from '@/types/applicationState';

export const applicationStateQueryKey = ['application-state'];

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

function unavailableTelemetry(): AppTelemetry {
  return { cpuPercent: 'Unavailable', memoryUsage: 'Unavailable', memoryPercent: 'Unavailable', networkIo: 'Unavailable', blockIo: 'Unavailable', checkedAt: '' };
}
