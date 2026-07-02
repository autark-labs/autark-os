import {
  appNeedsAttentionFromCanonicalState,
  displayStatusFromCanonicalState,
  type ApplicationStateRepositoryView,
} from '@/repositories/applicationStateRepository';
import type { AppAccessCheck, AppHealthSnapshot, AppRuntimeView, AppTelemetry } from '@/types/app';
import type { ObservedServiceView } from '@/types/observedService';
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
  'accessByAppId' | 'apps' | 'healthByAppId' | 'observedServices' | 'telemetryByAppId'
>;

export function buildApplicationSurfaceItems({
  accessByAppId,
  apps,
  healthByAppId,
  observedServices,
  telemetryByAppId,
}: ApplicationSurfaceInput): ApplicationSurfaceItem[] {
  return [
    ...apps.map((app) => managedAppSurfaceItem(
      app,
      healthByAppId[app.appId] ?? app.healthSnapshot,
      accessByAppId[app.appId],
      telemetryByAppId[app.appId] ?? app.telemetry,
    )),
    ...observedServices
      .filter((service) => !service.managedByThisProjectOs && service.userStatus !== 'installed_managed')
      .map(observedServiceSurfaceItem),
  ].slice().sort(compareSurfaceItems);
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
      disabled: false,
      reason: null,
    })),
    backup,
    description: app.description || app.category || 'Managed app',
    href: primaryOpenUrl(app),
    iconUrl: app.image || undefined,
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

function observedServiceSurfaceItem(service: ObservedServiceView): ApplicationSurfaceItem {
  const pinned = service.pinned || service.userStatus === 'pinned_external';
  const needsReview = ['recoverable', 'managed_elsewhere', 'blocked', 'failed_install'].includes(service.userStatus) || !pinned;
  const managementState = backendManagementState(service.managementState ?? (pinned ? 'linked' : 'found'));
  const readinessState = backendReadinessState(service.readinessState ?? observedReadinessState(service, pinned));
  const attentionState = backendAttentionState(service.attentionState ?? observedAttentionState(service, needsReview));

  return {
    access: observedAccessLabel(service),
    attentionState,
    availableActions: (service.availableActions ?? []).map((action) => ({
      id: action.id,
      label: action.label,
      href: action.href,
      disabled: action.disabled,
      reason: action.reason,
    })),
    backup: 'Not managed',
    catalogAppId: service.catalogAppId,
    catalogMatchConfidence: service.catalogMatchConfidence,
    description: service.userStatusDescription || service.category || 'Found service',
    href: service.url || undefined,
    id: `observed:${service.id}`,
    kind: pinned ? 'pinned' : 'observed',
    lastEvent: service.userStatusLabel || undefined,
    links: observedLinks(service),
    managementState,
    name: service.displayName || service.id,
    nextAction: needsReview ? observedNextAction(service) : undefined,
    operationState: idleOperationState(),
    readinessState,
    runtime: observedRuntimeDetails(service),
    runtimeState: pinned ? 'shortcut' : 'found',
    settings: observedSettings(service),
    sortKey: `${managementState}:${(service.displayName || service.id).toLowerCase()}:${service.id}`,
    sourceId: service.id,
    status: pinned ? 'Pinned' : needsReview ? 'Needs review' : 'Found',
    userStatus: service.userStatus,
    userStatusDescription: service.userStatusDescription,
    userStatusLabel: service.userStatusLabel,
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
  if (['Needs attention', 'Unavailable', 'Missing', 'Managed elsewhere'].includes(displayStatus)) {
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
  if (displayStatus === 'Missing' || displayStatus === 'Managed elsewhere') {
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
  if (needsAttention || displayStatus === 'Needs attention' || displayStatus === 'Unavailable') {
    return 'needs_review';
  }
  return 'none';
}

function observedReadinessState(service: ObservedServiceView, pinned: boolean): AppReadinessState {
  const runtimeState = service.runtimeState?.toLowerCase() ?? '';
  if (!service.url && !pinned) {
    return 'unknown';
  }
  if (runtimeState.includes('start')) {
    return 'starting';
  }
  if (runtimeState.includes('pause')) {
    return 'paused';
  }
  if (runtimeState.includes('stop') || runtimeState.includes('exit')) {
    return 'stopped';
  }
  if (runtimeState.includes('unhealthy') || runtimeState.includes('unreachable')) {
    return 'unreachable';
  }
  return service.url || pinned ? 'ready' : 'unknown';
}

function observedAttentionState(service: ObservedServiceView, needsReview: boolean): AppAttentionState {
  if (service.userStatus === 'blocked') {
    return 'blocked';
  }
  if (service.userStatus === 'managed_elsewhere') {
    return 'conflict';
  }
  if (needsReview) {
    return 'needs_review';
  }
  return 'none';
}

function backendManagementState(value: string): ApplicationSurfaceItem['managementState'] {
  if (value === 'managed' || value === 'found' || value === 'linked') {
    return value;
  }
  return 'found';
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
      label: value.label || 'Action failed',
      message: value.message || 'Project OS could not finish this action.',
      jobId: value.jobId || undefined,
    };
  }
  if (value.kind === 'starting' || value.kind === 'stopping' || value.kind === 'restarting' || value.kind === 'repairing' || value.kind === 'saving_settings' || value.kind === 'backing_up' || value.kind === 'restoring' || value.kind === 'uninstalling') {
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

function observedNextAction(service: ObservedServiceView): ApplicationNextAction {
  if (service.userStatus === 'failed_install') {
    return {
      description: service.userStatusDescription || 'Review this failed install before trying again.',
      id: 'review_found_service',
      label: 'Review install',
    };
  }

  if (service.userStatus === 'recoverable') {
    return {
      description: service.userStatusDescription || 'Review this service before recovering it into Project OS.',
      id: 'review_found_service',
      label: 'Review recovery',
    };
  }

  if (service.userStatus === 'managed_elsewhere') {
    return {
      description: service.userStatusDescription || 'This service appears to be owned outside this Project OS instance.',
      id: 'review_found_service',
      label: 'Review owner',
    };
  }

  return {
    description: service.userStatusDescription || 'Review this service before linking or recovering it.',
    id: 'review_found_service',
    label: 'Review service',
  };
}

function accessLabel(app: AppRuntimeView, access?: AppAccessCheck): ApplicationSurfaceItem['access'] {
  if (app.canonicalAccessState === 'private_ready' || app.accessRoute?.privateUrl || app.observedAccess?.privateLinkStatus === 'configured') {
    return 'Private';
  }
  if (app.canonicalAccessState === 'local_ready' || app.accessRoute?.localUrl || app.observedAccess?.localUrl || app.accessUrl) {
    return access?.status === 'unreachable' ? 'Local only' : 'Open';
  }
  return 'No link';
}

function observedAccessLabel(service: ObservedServiceView): ApplicationSurfaceItem['access'] {
  const scope = service.accessScope.toLowerCase();
  if (scope.includes('private') || scope.includes('tailscale')) {
    return 'Private';
  }
  if (scope.includes('public') || scope.includes('internet')) {
    return 'Open';
  }
  return service.url ? 'Local only' : 'No link';
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
  return app.accessRoute?.primaryOpenUrl
    || app.settings?.privateAccessUrl
    || app.observedAccess?.privateUrl
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
    privateUrl: app.accessRoute?.privateUrl || app.settings?.privateAccessUrl || app.observedAccess?.privateUrl || undefined,
  };
}

function observedLinks(service: ObservedServiceView): ApplicationSurfaceItem['links'] {
  return {
    primaryUrl: service.url || undefined,
    localUrl: service.url || undefined,
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

function observedSettings(service: ObservedServiceView): ApplicationSurfaceItem['settings'] {
  return {
    autoRepairEnabled: false,
    backupEnabled: false,
    backupFrequency: 'daily',
    backupRetention: 7,
    canEdit: false,
    containerDetail: service.userStatusDescription || 'Project OS observes this service but does not manage its container.',
    containerStatus: service.runtimeState || service.userStatusLabel || 'Observed',
    desiredAccessMode: service.accessScope || 'external',
    expectedLocalPort: portFromUrl(service.url || undefined),
    expectedProtocol: protocolFromUrl(service.url || undefined),
    privateAccessRequired: false,
    privateAccessUrl: undefined,
    privateLinkStatus: service.accessScope || 'not_managed',
    tailscaleEnabled: service.accessScope.toLowerCase().includes('tailscale') || service.accessScope.toLowerCase().includes('private'),
  };
}

function observedRuntimeDetails(service: ObservedServiceView): ApplicationSurfaceItem['runtime'] {
  return {
    appConfiguration: [],
    checkedAt: undefined,
    composeProject: service.metadata?.composeProject || service.id,
    health: null,
    image: null,
    lastBackup: undefined,
    recentEvents: [],
    runtimePath: service.metadata?.runtimePath,
    setupGuide: null,
    telemetry: null,
    usageGuide: null,
    version: undefined,
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
