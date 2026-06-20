import { apiErrorMessage } from '@/api/httpClient';
import type { AppAccessCheck, AppHealthSnapshot, AppRuntimeView, AppTelemetry, BackupPolicy } from '@/types/app';
import type { PrivateAccessReconciliationItem } from '@/types/network';

export const statusStyles: Record<string, string> = {
  Ready: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
  Starting: 'border-amber-300/25 bg-amber-500/10 text-amber-200',
  Stopped: 'border-slate-500/25 bg-slate-700/30 text-slate-200',
  Paused: 'border-slate-500/25 bg-slate-700/30 text-slate-200',
  Unavailable: 'border-red-400/25 bg-red-500/10 text-red-200',
  'Needs attention': 'border-red-400/25 bg-red-500/10 text-red-200',
};

export function friendlyStatusText(app: AppRuntimeView) {
  if (app.friendlyStatus === 'Ready') {
    return app.appName + ' is running and ready to open.';
  }
  if (app.friendlyStatus === 'Stopped') {
    return app.appName + ' is stopped. Start it when you are ready to use it again.';
  }
  if (app.friendlyStatus === 'Needs attention') {
    return app.appName + ' needs attention. Open Advanced or restart the app to recover.';
  }
  return app.appName + ' is changing state. Refresh in a moment.';
}

export function backupLabel(backup?: BackupPolicy | null) {
  if (!backup) {
    return 'Default backups';
  }
  if (!backup.enabled) {
    return 'Disabled';
  }
  return 'Protected';
}

export function storageLabel(subfolders?: Record<string, string> | null) {
  const entries = Object.entries(subfolders ?? {});
  if (entries.length === 0) {
    return 'Default folders';
  }
  return entries.map(([key, value]) => `${key} -> ${value}`).join(', ');
}

export function percentFromTelemetry(value?: string | null) {
  if (!value || value === 'Unavailable') {
    return null;
  }
  const parsed = Number.parseFloat(String(value).replace('%', ''));
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

export function appPriority(app: AppRuntimeView, telemetry?: AppTelemetry | null, access?: AppAccessCheck, health?: AppHealthSnapshot | null) {
  const status = displayStatus(app, health);
  if (status === 'Needs attention' || status === 'Unavailable') {
    return 0;
  }
  if (status === 'Ready' && access?.status === 'unreachable') {
    return 1;
  }
  if (resourceAlert(telemetry)) {
    return 2;
  }
  if (status === 'Starting') {
    return 3;
  }
  if (status === 'Ready') {
    return 4;
  }
  if (status === 'Paused') {
    return 5;
  }
  return 6;
}

export function appNeedsAttention(app: AppRuntimeView, telemetry?: AppTelemetry | null, access?: AppAccessCheck, health?: AppHealthSnapshot | null) {
  return appPriority(app, telemetry, access, health) <= 2;
}

export function statusReason(app: AppRuntimeView, telemetry?: AppTelemetry | null, access?: AppAccessCheck, health?: AppHealthSnapshot | null, reconciliation?: PrivateAccessReconciliationItem | null) {
  if (health?.message) {
    return health.message;
  }
  if (reconciliation && !['healthy', 'waiting'].includes(reconciliation.status)) {
    return reconciliation.message;
  }
  if (app.observedAccess?.privateLinkStatus === 'missing') {
    return 'Private link needs repair';
  }
  if (app.friendlyStatus === 'Stopped') {
    return 'Stopped';
  }
  if (app.friendlyStatus === 'Starting') {
    return 'Starting up';
  }
  if (app.friendlyStatus === 'Needs attention') {
    return 'Needs a look';
  }
  if (access?.status === 'unreachable') {
    return 'Link not responding';
  }
  const alert = resourceAlert(telemetry);
  if (alert) {
    return alert;
  }
  if (access?.status === 'reachable') {
    return 'Running normally';
  }
  return app.friendlyStatus === 'Ready' ? 'Running' : app.friendlyStatus;
}

export function appNotice(app: AppRuntimeView, telemetry?: AppTelemetry | null, access?: AppAccessCheck, health?: AppHealthSnapshot | null, reconciliation?: PrivateAccessReconciliationItem | null) {
  if (health && ['Needs attention', 'Unavailable'].includes(health.status)) {
    return health.detail || health.message;
  }
  if (reconciliation && !['healthy', 'waiting'].includes(reconciliation.status)) {
    return reconciliation.detail || reconciliation.message;
  }
  if (app.observedAccess?.privateLinkStatus === 'missing') {
    return 'Private access is turned on, but Project OS does not have a working private link yet.';
  }
  if (app.friendlyStatus === 'Ready' && access?.status === 'unreachable') {
    return 'App is running, but the link is not responding.';
  }
  return resourceAlert(telemetry);
}

export function resourceAlert(telemetry?: AppTelemetry | null) {
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

export function accessLabel(access?: AppAccessCheck) {
  if (!access) {
    return 'Checking';
  }
  if (access.status === 'reachable') {
    return 'Responding';
  }
  if (access.status === 'unreachable') {
    return 'Not responding';
  }
  return 'Not set';
}

export function desiredAccessLabel(app: AppRuntimeView) {
  return app.desiredAccess?.label || (app.settings?.tailscaleEnabled ? 'Your private devices' : 'Only this device');
}

export function privateLinkLabel(app: AppRuntimeView, reconciliation?: PrivateAccessReconciliationItem | null) {
  if (reconciliation?.status === 'healthy') {
    return reconciliation.verifiedAt ? `Verified ${formatTime(reconciliation.verifiedAt)}` : 'Verified by Tailscale';
  }
  if (reconciliation && reconciliation.status !== 'waiting') {
    return reconciliation.message;
  }
  if (app.observedAccess?.privateLinkStatus === 'configured') {
    return 'Private link ready';
  }
  if (app.observedAccess?.privateLinkStatus === 'missing') {
    return 'Private link missing';
  }
  if (app.desiredAccess?.privateAccessRequired) {
    return 'Private link required';
  }
  if (app.desiredAccess?.privateAccessRecommended) {
    return 'Private link suggested';
  }
  return desiredAccessLabel(app);
}

export function displayStatus(app: AppRuntimeView, health?: AppHealthSnapshot | null) {
  if (health?.status) {
    return health.status;
  }
  if (app.friendlyStatus === 'Stopped') {
    return 'Paused';
  }
  return app.friendlyStatus;
}

export function telemetryValue(value?: string | null) {
  if (!value || value === 'Unavailable') {
    return '--';
  }
  return value;
}

export function memoryUsed(value?: string | null) {
  const clean = telemetryValue(value);
  return clean.includes(' / ') ? clean.split(' / ')[0] : clean;
}

export function uptimeLabel(app: AppRuntimeView) {
  const match = app.technicalStatus.match(/Up\s+([^;(]+)/i);
  if (match?.[1]) {
    return match[1].trim();
  }
  if (app.friendlyStatus === 'Stopped') {
    return '--';
  }
  return 'Active';
}

export function formatTime(value?: string | null) {
  if (!value) {
    return '--';
  }
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(value));
}

export function errorMessage(error: unknown) {
  return apiErrorMessage(error);
}

export function humanize(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatDate(value?: string | null) {
  if (!value) {
    return 'Unknown';
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
