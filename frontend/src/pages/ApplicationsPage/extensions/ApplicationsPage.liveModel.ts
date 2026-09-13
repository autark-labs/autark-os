import {
  appNeedsAttentionFromCanonicalState,
  displayStatusFromCanonicalState,
  type ApplicationStateRepositoryView,
} from '@/repositories/applicationStateRepository';
import type { AppAccessCheck, AppHealthSnapshot, AppRuntimeView, AppTelemetry } from '@/types/app';
import { catalogAppImageUrl, preferredAppImageUrl } from '@/lib/appImage';
import type {
  AppAttentionState,
  AppOperationState,
  AppReadinessState,
  ApplicationNextAction,
  ApplicationRuntimeState,
  ApplicationSurfaceItem,
} from './ApplicationsPage.types';

type ApplicationSurfaceInput = Pick<
  ApplicationStateRepositoryView,
  'accessByAppId' | 'apps' | 'healthByAppId' | 'telemetryByAppId'
>;

export function buildApplicationSurfaceItems({
  accessByAppId,
  apps,
  healthByAppId,
  telemetryByAppId,
}: ApplicationSurfaceInput): ApplicationSurfaceItem[] {
  return apps.map((app) => managedAppSurfaceItem(
      app,
      healthByAppId[app.appId] ?? app.healthSnapshot,
      accessByAppId[app.appId],
      telemetryByAppId[app.appId] ?? app.telemetry,
    )).slice().sort(compareSurfaceItems);
}

function managedAppSurfaceItem(
  app: AppRuntimeView,
  health?: AppHealthSnapshot | null,
  access?: AppAccessCheck,
  telemetry?: AppTelemetry | null,
): ApplicationSurfaceItem {
  const displayStatus = displayStatusFromCanonicalState(app, health);
  const backup = backupLabel(app);
  const needsAttention = appNeedsAttentionFromCanonicalState(app, health, access, telemetry);
  const managementState = backendManagementState(app.managementState ?? 'managed');
  const readinessState = backendReadinessState(app.readinessState ?? managedReadinessState(displayStatus, app, access));
  const attentionState = backendAttentionState(app.attentionState ?? managedAttentionState(displayStatus, app, needsAttention));
  const status = managedStatus(displayStatus, app);

  return {
    access: accessLabel(app, access),
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
    nextAction: managedNextAction(app, readinessState, attentionState),
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

function managedReadinessState(displayStatus: string, app: AppRuntimeView, access?: AppAccessCheck): AppReadinessState {
  if (displayStatus === 'Starting') {
    return 'starting';
  }
  if (displayStatus === 'Paused') {
    return 'paused';
  }
  if (displayStatus === 'Stopped' || app.friendlyStatus === 'Stopped' || app.canonicalRuntimeState === 'stopped') {
    return 'stopped';
  }
  if (displayStatus === 'Unavailable' || access?.status === 'unreachable') {
    return 'unreachable';
  }
  if (displayStatus === 'Missing' || displayStatus === 'Managed elsewhere' || displayStatus === 'Unknown') {
    return 'unknown';
  }
  return 'ready';
}

function managedAttentionState(displayStatus: string, app: AppRuntimeView, needsAttention: boolean): AppAttentionState {
  if (displayStatus === 'Managed elsewhere') {
    return 'conflict';
  }
  if (displayStatus === 'Missing' || app.canonicalIssues?.some((issue) => issue.severity === 'error')) {
    return 'blocked';
  }
  if (needsAttention || displayStatus === 'Needs attention' || displayStatus === 'Unavailable' || displayStatus === 'Unknown') {
    return 'needs_review';
  }
  return 'none';
}

function backendManagementState(value: string): ApplicationSurfaceItem['managementState'] {
  if (value === 'managed') {
    return value;
  }
  return 'managed';
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
      description: app.remediation?.summary || app.canonicalIssues?.[0]?.summary || 'Review the app state before making changes.',
      id: 'review_issue',
      label: app.remediation?.nextActionLabel || app.canonicalIssues?.[0]?.primaryAction?.label || 'Review issue',
    };
  }

  if (app.canonicalBackupState === 'backup_enabled_no_restore_point') {
    return {
      description: 'Create the first backup snapshot before making larger changes.',
      id: 'create_backup',
      label: 'Create backup',
    };
  }

  return undefined;
}

function accessLabel(app: AppRuntimeView, access?: AppAccessCheck): ApplicationSurfaceItem['access'] {
  if (app.canonicalAccessState === 'private_ready' || app.accessRoute?.privateLinkStatus === 'verified' || app.observedAccess?.privateLinkStatus === 'verified') {
    return 'Private';
  }
  if (app.canonicalAccessState === 'local_ready' || app.accessRoute?.localUrl || app.observedAccess?.localUrl || app.accessUrl) {
    return access?.status === 'unreachable' ? 'Local only' : 'Open';
  }
  return 'No link';
}

function backupLabel(app: AppRuntimeView): ApplicationSurfaceItem['backup'] {
  if (app.canonicalBackupState === 'protected_by_restore_point') {
    return 'Protected';
  }
  if (app.canonicalBackupState === 'backup_disabled') {
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
