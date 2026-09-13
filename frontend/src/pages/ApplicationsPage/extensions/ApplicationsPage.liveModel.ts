import type { AppHealthSnapshot, AppRuntimeView, AppTelemetry } from '@/types/app';
import type { ApplicationView } from '@/types/applicationState';
import { catalogAppImageUrl, preferredAppImageUrl } from '@/lib/appImage';
import type {
  AppAttentionState,
  AppOperationState,
  AppReadinessState,
  ApplicationNextAction,
  ApplicationRuntimeState,
  ApplicationSurfaceItem,
} from './ApplicationsPage.types';

type ApplicationSurfaceInput = { applications: ApplicationView[] };

export function buildApplicationSurfaceItems({
  applications,
}: ApplicationSurfaceInput): ApplicationSurfaceItem[] {
  return applications
    .filter((application): application is ApplicationView & { runtime: AppRuntimeView } => application.relationship === 'managed' && Boolean(application.runtime))
    .map(managedAppSurfaceItem)
    .slice()
    .sort(compareSurfaceItems);
}

function managedAppSurfaceItem(application: ApplicationView & { runtime: AppRuntimeView }): ApplicationSurfaceItem {
  const app = application.runtime;
  const health = app.healthSnapshot;
  const telemetry = app.telemetry;
  const displayStatus = app.friendlyStatus || 'Unknown';
  const backup = backupLabel(application);
  const managementState = 'managed';
  const readinessState = backendReadinessState(app.readinessState ?? application.runtimeState);
  const attentionState = backendAttentionState(app.attentionState ?? (
    application.issues.length > 0 || readinessState === 'unknown' || readinessState === 'unreachable'
      ? 'needs_review'
      : 'none'
  ));
  const status = managedStatus(displayStatus, app);

  return {
    access: accessLabel(application, app),
    attentionState,
    availableActions: (app.availableActions ?? []).map((action) => ({
      id: action.id,
      label: action.label,
      href: action.href ?? action.route ?? null,
      disabled: action.disabled ?? false,
      reason: action.reason ?? null,
    })),
    backup,
    category: app.category || 'App',
    description: app.description || app.category || 'Managed app',
    href: primaryOpenUrl(app),
    iconUrl: preferredAppImageUrl(app.image, catalogAppImageUrl(app.appId)) || undefined,
    id: app.appId,
    kind: 'managed',
    lastEvent: app.recentEvents?.[0]?.message || health?.message || app.remediation?.summary || undefined,
    links: appLinks(app),
    managementState,
    name: app.appName,
    nextAction: managedNextAction(application, app, readinessState, attentionState),
    operationState: backendOperationState(app.operationState),
    readinessState,
    runtime: appRuntimeDetails(app, health, telemetry),
    runtimeState: managedRuntimeState(status, app),
    settings: appSettings(app),
    sortKey: app.sortKey || `managed:${app.appName.toLowerCase()}:${app.appId}`,
    displayOrder: app.displayOrder,
    sourceId: app.appId,
    status,
  };
}

function compareSurfaceItems(left: ApplicationSurfaceItem, right: ApplicationSurfaceItem) {
  const leftOrder = left.displayOrder ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = right.displayOrder ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  const leftSort = left.sortKey || `${left.managementState}:${left.name.toLowerCase()}:${left.id}`;
  const rightSort = right.sortKey || `${right.managementState}:${right.name.toLowerCase()}:${right.id}`;
  return leftSort.localeCompare(rightSort);
}

function managedStatus(displayStatus: string, app: AppRuntimeView): ApplicationSurfaceItem['status'] {
  if (displayStatus === 'Starting') {
    return 'Starting';
  }
  if (displayStatus === 'Paused' || displayStatus === 'Stopped' || app.friendlyStatus === 'Stopped') {
    return 'Paused';
  }
  if (['Needs attention', 'Unavailable', 'Missing', 'Managed elsewhere', 'Unknown'].includes(displayStatus)) {
    return 'Needs review';
  }
  return 'Ready';
}

function backendReadinessState(value: string): AppReadinessState {
  if (value === 'ready' || value === 'starting' || value === 'paused' || value === 'stopped' || value === 'unreachable' || value === 'unknown') {
    return value;
  }
  return 'unknown';
}

function backendAttentionState(value: string): AppAttentionState {
  if (value === 'none' || value === 'needs_review' || value === 'conflict' || value === 'blocked') {
    return value;
  }
  return 'needs_review';
}

function idleOperationState(): AppOperationState {
  return { kind: 'idle' };
}

function backendOperationState(value: AppRuntimeView['operationState']): AppOperationState {
  if (!value || value.kind === 'idle') {
    return idleOperationState();
  }
  if (value.kind === 'failed') {
    return {
      kind: 'failed',
      jobType: value.jobType || undefined,
      label: value.label || 'Action failed',
      message: value.message || 'Autark-OS could not finish this action.',
      jobId: value.jobId || undefined,
    };
  }
  if (value.kind === 'starting' || value.kind === 'stopping' || value.kind === 'restarting' || value.kind === 'repairing' || value.kind === 'saving_settings' || value.kind === 'backing_up' || value.kind === 'restoring' || value.kind === 'uninstalling' || value.kind === 'updating' || value.kind === 'rolling_back') {
    return {
      kind: value.kind,
      label: value.label || operationLabel(value.kind),
      jobId: value.jobId || undefined,
      currentStep: value.currentStep || value.message || undefined,
    };
  }
  return idleOperationState();
}

function operationLabel(kind: string) {
  if (kind === 'starting') return 'Starting';
  if (kind === 'stopping') return 'Pausing';
  if (kind === 'restarting') return 'Restarting';
  if (kind === 'repairing') return 'Repairing';
  if (kind === 'saving_settings') return 'Saving settings';
  if (kind === 'backing_up') return 'Creating backup';
  if (kind === 'restoring') return 'Restoring';
  if (kind === 'uninstalling') return 'Uninstalling safely';
  if (kind === 'updating') return 'Updating safely';
  if (kind === 'rolling_back') return 'Restoring previous release';
  return 'Working';
}

function managedRuntimeState(status: ApplicationSurfaceItem['status'], app: AppRuntimeView): ApplicationRuntimeState {
  if (status === 'Paused') {
    return 'paused';
  }
  if (status === 'Starting') {
    return 'starting';
  }
  if (status === 'Needs review') {
    return 'needs_attention';
  }
  if (app.canonicalRuntimeState === 'stopped') {
    return 'paused';
  }
  return 'running';
}

function managedNextAction(
  application: ApplicationView,
  app: AppRuntimeView,
  readinessState: AppReadinessState,
  attentionState: AppAttentionState,
): ApplicationNextAction | undefined {
  if (readinessState === 'paused' || readinessState === 'stopped') {
    return {
      description: 'Start the app so it can be opened again.',
      id: 'start_app',
      label: 'Start app',
    };
  }

  if (attentionState !== 'none' || readinessState === 'unreachable' || readinessState === 'unknown') {
    return {
    description: app.remediation?.summary || application.issues[0]?.summary || 'Review the app state before making changes.',
      id: 'review_issue',
      label: app.remediation?.nextActionLabel || application.issues[0]?.primaryAction?.label || 'Review issue',
    };
  }

  if (application.backupState === 'backup_enabled_no_restore_point') {
    return {
      description: 'Create the first backup snapshot before making larger changes.',
      id: 'create_backup',
      label: 'Create backup',
    };
  }

  return undefined;
}

function accessLabel(application: ApplicationView, app: AppRuntimeView): ApplicationSurfaceItem['access'] {
  if (application.accessState === 'private_ready') {
    return 'Private';
  }
  if (application.accessState === 'local_ready' || application.accessState === 'private_waiting' || application.accessState === 'private_needs_setup') {
    return 'Open';
  }
  return 'No link';
}

function backupLabel(application: ApplicationView): ApplicationSurfaceItem['backup'] {
  if (application.backupState === 'protected_by_restore_point') {
    return 'Protected';
  }
  if (application.backupState === 'backup_disabled') {
    return 'Not managed';
  }
  return 'Needs backup';
}

function primaryOpenUrl(app: AppRuntimeView): string | undefined {
  const routePrivateUrl = app.accessRoute?.privateLinkStatus === 'verified'
    ? app.accessRoute.privateUrl || app.accessRoute.primaryOpenUrl
    : undefined;
  const observedPrivateUrl = app.observedAccess?.privateLinkStatus === 'verified'
    ? app.observedAccess.privateUrl || undefined
    : undefined;
  return routePrivateUrl
    || observedPrivateUrl
    || app.accessRoute?.localUrl
    || app.observedAccess?.localUrl
    || app.accessUrl
    || app.settings?.accessUrl
    || undefined;
}

function appLinks(app: AppRuntimeView): ApplicationSurfaceItem['links'] {
  return {
    backendTargetUrl: app.accessRoute?.backendTargetUrl || undefined,
    localUrl: app.accessRoute?.localUrl || app.observedAccess?.localUrl || app.accessUrl || app.settings?.accessUrl || undefined,
    primaryUrl: primaryOpenUrl(app),
    privateUrl: app.accessRoute?.privateLinkStatus === 'verified'
      ? app.accessRoute.privateUrl || undefined
      : app.observedAccess?.privateLinkStatus === 'verified' ? app.observedAccess.privateUrl || undefined : undefined,
  };
}

function appSettings(app: AppRuntimeView): ApplicationSurfaceItem['settings'] {
  return {
    autoRepairEnabled: app.settings?.autoRepairEnabled ?? true,
    backupEnabled: app.settings?.backup?.enabled ?? true,
    backupFrequency: app.settings?.backup?.frequency ?? 'daily',
    backupRetention: app.settings?.backup?.retention ?? 7,
    canEdit: true,
    containerDetail: app.healthSnapshot?.detail || app.healthSnapshot?.message || app.technicalStatus || app.healthCheck || 'No container detail reported.',
    containerStatus: app.technicalStatus || app.healthSnapshot?.dockerStatus || app.friendlyStatus,
    desiredAccessMode: app.settings?.desiredAccessMode || app.desiredAccess?.mode || 'local',
    expectedLocalPort: app.settings?.expectedLocalPort ?? app.desiredAccess?.expectedLocalPort ?? app.observedAccess?.localPort ?? portFromUrl(primaryOpenUrl(app)),
    expectedProtocol: app.settings?.expectedProtocol ?? app.desiredAccess?.expectedProtocol ?? app.observedAccess?.protocol ?? protocolFromUrl(primaryOpenUrl(app)),
    privateAccessRequired: Boolean(app.desiredAccess?.privateAccessRequired || app.settings?.privateAccessRequirement === 'required'),
    privateAccessUrl: appLinks(app).privateUrl,
    privateLinkStatus: app.accessRoute?.privateLinkStatus || app.observedAccess?.privateLinkStatus || 'not_enabled',
    tailscaleEnabled: Boolean(app.settings?.tailscaleEnabled || app.desiredAccess?.mode === 'private' || app.desiredAccess?.mode === 'local-and-private'),
  };
}

function appRuntimeDetails(
  app: AppRuntimeView,
  health?: AppHealthSnapshot | null,
  telemetry?: AppTelemetry | null,
): ApplicationSurfaceItem['runtime'] {
  return {
    appConfiguration: app.appConfiguration ?? [],
    checkedAt: telemetry?.checkedAt || health?.checkedAt || app.recentEvents?.[0]?.createdAt || undefined,
    composeProject: app.composeProject || undefined,
    health: health ?? app.healthSnapshot ?? null,
    image: app.image,
    lastBackup: app.lastBackup || undefined,
    recentEvents: app.recentEvents ?? [],
    runtimePath: app.runtimePath || undefined,
    setupGuide: app.setupGuide ?? null,
    telemetry: telemetry ?? app.telemetry ?? null,
    usageGuide: app.usageGuide ?? null,
    version: app.version || undefined,
  };
}

function portFromUrl(url?: string): number | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.port) {
      return Number(parsed.port);
    }
    if (parsed.protocol === 'https:') {
      return 443;
    }
    if (parsed.protocol === 'http:') {
      return 80;
    }
  } catch {
    return null;
  }

  return null;
}

function protocolFromUrl(url?: string): 'http' | 'https' {
  if (!url) {
    return 'http';
  }

  try {
    return new URL(url).protocol === 'https:' ? 'https' : 'http';
  } catch {
    return 'http';
  }
}
