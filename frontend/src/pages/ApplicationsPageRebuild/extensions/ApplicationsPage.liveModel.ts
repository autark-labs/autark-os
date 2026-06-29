import {
  appNeedsAttentionFromCanonicalState,
  displayStatusFromCanonicalState,
  type ApplicationStateRepositoryView,
} from '@/repositories/applicationStateRepository';
import type { AppAccessCheck, AppHealthSnapshot, AppRuntimeView, AppTelemetry } from '@/types/app';
import type { ObservedServiceView } from '@/types/observedService';
import type { ApplicationNextAction, ApplicationRuntimeState, ApplicationSurfaceItem } from './ApplicationsPage.types';

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
  ];
}

function managedAppSurfaceItem(
  app: AppRuntimeView,
  health?: AppHealthSnapshot | null,
  access?: AppAccessCheck,
  telemetry?: AppTelemetry | null,
): ApplicationSurfaceItem {
  const displayStatus = displayStatusFromCanonicalState(app, health);
  const backup = backupLabel(app);
  const status = managedStatus(displayStatus, app);
  const needsAttention = appNeedsAttentionFromCanonicalState(app, health, access, telemetry);

  return {
    access: accessLabel(app, access),
    backup,
    description: app.description || app.category || 'Managed app',
    href: primaryOpenUrl(app),
    iconUrl: app.image || undefined,
    id: app.appId,
    kind: 'managed',
    lastEvent: app.recentEvents?.[0]?.message || health?.message || app.remediation?.summary || undefined,
    links: appLinks(app),
    name: app.appName,
    nextAction: managedNextAction(app, status, backup, needsAttention),
    runtimeState: managedRuntimeState(status, app),
    settings: appSettings(app),
    sourceId: app.appId,
    status,
  };
}

function observedServiceSurfaceItem(service: ObservedServiceView): ApplicationSurfaceItem {
  const pinned = service.pinned || service.userStatus === 'pinned_external';
  const needsReview = ['recoverable', 'managed_elsewhere', 'blocked'].includes(service.userStatus) || !pinned;

  return {
    access: observedAccessLabel(service),
    backup: 'Not managed',
    description: service.userStatusDescription || service.category || 'Found service',
    href: service.url || undefined,
    id: `observed:${service.id}`,
    kind: pinned ? 'pinned' : 'observed',
    lastEvent: service.userStatusLabel || undefined,
    links: observedLinks(service),
    name: service.displayName || service.id,
    nextAction: needsReview ? observedNextAction(service) : undefined,
    runtimeState: pinned ? 'shortcut' : 'found',
    settings: observedSettings(service),
    sourceId: service.id,
    status: pinned ? 'Pinned' : needsReview ? 'Needs review' : 'Found',
  };
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
  status: ApplicationSurfaceItem['status'],
  backup: ApplicationSurfaceItem['backup'],
  needsAttention: boolean,
): ApplicationNextAction | undefined {
  if (status === 'Paused') {
    return {
      description: 'Start the app so it can be opened again.',
      id: 'start_app',
      label: 'Start app',
    };
  }

  if (needsAttention || status === 'Needs review') {
    return {
      description: app.remediation?.summary || app.canonicalIssues?.[0]?.summary || 'Review the app state before making changes.',
      id: 'review_issue',
      label: app.remediation?.nextActionLabel || app.canonicalIssues?.[0]?.primaryAction?.label || 'Review issue',
    };
  }

  if (backup === 'Needs backup') {
    return {
      description: 'Create the first backup snapshot before making larger changes.',
      id: 'create_backup',
      label: 'Create backup',
    };
  }

  return undefined;
}

function observedNextAction(service: ObservedServiceView): ApplicationNextAction {
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
    canEdit: true,
    containerDetail: app.healthSnapshot?.detail || app.healthSnapshot?.message || app.technicalStatus || app.healthCheck || 'No container detail reported.',
    containerStatus: app.technicalStatus || app.healthSnapshot?.dockerStatus || app.friendlyStatus,
    desiredAccessMode: app.settings?.desiredAccessMode || app.desiredAccess?.mode || 'local',
    privateAccessRequired: Boolean(app.desiredAccess?.privateAccessRequired || app.settings?.privateAccessRequirement === 'required'),
    privateAccessUrl: appLinks(app).privateUrl,
    privateLinkStatus: app.accessRoute?.privateLinkStatus || app.observedAccess?.privateLinkStatus || 'not_enabled',
    tailscaleEnabled: Boolean(app.settings?.tailscaleEnabled || app.desiredAccess?.mode === 'private' || app.desiredAccess?.mode === 'local-and-private'),
  };
}

function observedSettings(service: ObservedServiceView): ApplicationSurfaceItem['settings'] {
  return {
    autoRepairEnabled: false,
    canEdit: false,
    containerDetail: service.userStatusDescription || 'Project OS observes this service but does not manage its container.',
    containerStatus: service.runtimeState || service.userStatusLabel || 'Observed',
    desiredAccessMode: service.accessScope || 'external',
    privateAccessRequired: false,
    privateAccessUrl: undefined,
    privateLinkStatus: service.accessScope || 'not_managed',
    tailscaleEnabled: service.accessScope.toLowerCase().includes('tailscale') || service.accessScope.toLowerCase().includes('private'),
  };
}
