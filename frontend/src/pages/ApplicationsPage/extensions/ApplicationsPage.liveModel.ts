import type { AppHealthSnapshot, AppRuntimeView, AppTelemetry } from '@/types/app';
import type { ApplicationView } from '@/types/applicationState';
import { catalogAppImageUrl, preferredAppImageUrl } from '@/lib/appImage';
import type {
  AppOperationState,
  ApplicationNextAction,
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
  const backup = backupLabel(application);

  return {
    access: accessLabel(application, app),
    availableActions: application.availableActions.map((action) => ({
      id: action.id,
      label: action.label,
      href: action.href,
      disabled: action.disabled,
      reason: action.reason,
    })),
    backup,
    category: app.category || 'App',
    description: app.description || app.category || 'Managed app',
    href: primaryOpenUrl(app),
    iconUrl: preferredAppImageUrl(app.image, catalogAppImageUrl(app.appId)) || undefined,
    id: app.appId,
    relationship: 'managed',
    issues: application.issues,
    lastEvent: app.recentEvents?.[0]?.message || health?.message || app.remediation?.summary || undefined,
    links: appLinks(app),
    name: app.appName,
    nextAction: managedNextAction(application, app),
    operation: backendOperationState(application.operation),
    runtime: appRuntimeDetails(app, health, telemetry),
    state: app.state,
    settings: appSettings(app),
    sortKey: `managed:${app.appName.toLowerCase()}:${app.appId}`,
    sourceId: app.appId,
  };
}

function compareSurfaceItems(left: ApplicationSurfaceItem, right: ApplicationSurfaceItem) {
  const leftOrder = left.displayOrder ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = right.displayOrder ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  const leftSort = left.sortKey || `${left.relationship}:${left.name.toLowerCase()}:${left.id}`;
  const rightSort = right.sortKey || `${right.relationship}:${right.name.toLowerCase()}:${right.id}`;
  return leftSort.localeCompare(rightSort);
}

function idleOperationState(): AppOperationState {
  return { kind: 'idle' };
}

function backendOperationState(value: ApplicationView['operation']): AppOperationState {
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

function managedNextAction(
  application: ApplicationView,
  app: AppRuntimeView,
): ApplicationNextAction | undefined {
  if (app.state === 'stopped') {
    return {
      description: 'Start the app so it can be opened again.',
      id: 'start_app',
      label: 'Start app',
    };
  }

  if (application.issues.length > 0 || app.state === 'degraded' || app.state === 'missing' || app.state === 'unknown') {
    return {
    description: app.remediation?.summary || application.issues[0]?.summary || 'Review the app state before making changes.',
      id: 'review_issue',
      label: app.remediation?.nextActionLabel || application.issues[0]?.primaryAction?.label || 'Review issue',
    };
  }

  if (app.backupProtection === 'backup_enabled_no_restore_point') {
    return {
      description: 'Create the first backup snapshot before making larger changes.',
      id: 'create_backup',
      label: 'Create backup',
    };
  }

  return undefined;
}

function accessLabel(application: ApplicationView, app: AppRuntimeView): ApplicationSurfaceItem['access'] {
  if (app.accessRoute?.privateLinkStatus === 'verified' && app.accessRoute.privateUrl) {
    return 'Private';
  }
  if (app.accessRoute?.localUrl || app.accessUrl) {
    return 'Open';
  }
  return 'No link';
}

function backupLabel(application: ApplicationView): ApplicationSurfaceItem['backup'] {
  if (application.runtime?.backupProtection === 'protected_by_restore_point') {
    return 'Protected';
  }
  if (application.runtime?.backupProtection === 'backup_disabled') {
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
    containerDetail: app.healthSnapshot?.detail || app.healthSnapshot?.message || 'No container detail reported.',
    containerStatus: app.healthSnapshot?.dockerStatus || app.state,
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
