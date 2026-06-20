import { backupSafetyWarning } from './backupSafety.js';

/**
 * @typedef {{ kind: 'app-action', action: 'restart', label: string }} AppActionRemediation
 * @typedef {{ kind: 'link', to: string, label: string }} LinkRemediation
 * @typedef {{ kind: 'none', label: string }} NoopRemediation
 * @typedef {{ label: string, warning: string, target: string }} DangerousRemediationAction
 * @typedef {{
 *   cause: 'private-access' | 'app-health' | 'local-link' | 'resource',
 *   severity: 'warning' | 'critical',
 *   tone: 'amber' | 'red',
 *   title: string,
 *   summary: string,
 *   nextStep: string,
 *   safeAction: AppActionRemediation | LinkRemediation | NoopRemediation,
 *   checklist: string[],
 *   dangerousActions: DangerousRemediationAction[],
 * }} AppRemediation
 */

/**
 * @param {{ access?: any, app?: any, health?: any, reconciliation?: any, telemetry?: any }} input
 * @returns {AppRemediation | null}
 */
export function buildAppRemediation({ access, app, health, reconciliation, telemetry }) {
  const status = health?.status || app?.friendlyStatus;
  const privateAccessIssue = reconciliation && !['healthy', 'waiting'].includes(reconciliation.status);
  const linkIssue = access?.status === 'unreachable';
  const resourceIssue = resourceWarning(telemetry);

  if (privateAccessIssue) {
    return privateAccessRemediation({
      appId: app?.appId,
      summary: reconciliation.detail || reconciliation.message || 'Project OS could not verify this private Tailscale link.',
    });
  }

  if (status === 'Needs attention' || status === 'Unavailable') {
    return appHealthRemediation({
      appId: app?.appId,
      appName: app?.appName || 'This app',
      summary: health?.detail || health?.message || 'The app is not reaching its expected healthy state.',
    });
  }

  if (linkIssue) {
    return {
      cause: 'local-link',
      severity: 'warning',
      tone: 'amber',
      title: 'The app is running, but its link is not responding',
      summary: access.message || 'Project OS could not reach the configured app URL.',
      nextStep: 'Restart the app. If the URL was changed outside Project OS, update the app address in Settings.',
      safeAction: { kind: 'app-action', action: 'restart', label: 'Restart app' },
      checklist: ['Confirm the local address is still correct.', 'Restart before changing app data.', 'Use Settings to update the app URL if needed.'],
      dangerousActions: [],
    };
  }

  if (resourceIssue) {
    return {
      cause: 'resource',
      severity: 'warning',
      tone: 'amber',
      title: resourceIssue,
      summary: 'The app is still running, but resource use is high enough to deserve a quick check.',
      nextStep: 'Open the app, review what it is doing, and restart only if it feels stuck.',
      safeAction: { kind: 'none', label: 'Review app' },
      checklist: ['High resource use can be normal during imports or scans.', 'Avoid reinstalling for a temporary resource spike.'],
      dangerousActions: [],
    };
  }

  return null;
}

/**
 * @param {any} issue
 * @returns {AppRemediation | null}
 */
export function buildAppRemediationFromIssue(issue) {
  if (!issue) {
    return null;
  }
  const text = `${issue.status || ''} ${issue.message || ''} ${issue.detail || ''} ${issue.suggestedAction || ''}`.toLowerCase();
  if (text.includes('private') || text.includes('tailscale')) {
    return privateAccessRemediation({
      appId: issue.appId,
      summary: issue.detail || issue.message || 'Project OS could not verify this private Tailscale link.',
    });
  }
  return appHealthRemediation({
    appId: issue.appId,
    appName: issue.appName,
    summary: issue.detail || issue.message || 'The app is not reaching its expected healthy state.',
  });
}

/**
 * @param {{ summary: string }} input
 * @returns {AppRemediation}
 */
function privateAccessRemediation({ summary }) {
  return {
    cause: 'private-access',
    severity: 'warning',
    tone: 'amber',
    title: 'Private access needs repair',
    summary,
    nextStep: 'Repair the private link from Access, then reopen this app from a private device.',
    safeAction: { kind: 'link', to: '/access', label: 'Open Access' },
    checklist: ['Tailscale must be connected.', 'This app should stay installed.', 'No app data is removed when repairing a private link.'],
    dangerousActions: [],
  };
}

/**
 * @param {{ appId?: string, appName: string, summary: string }} input
 * @returns {AppRemediation}
 */
function appHealthRemediation({ appId, appName, summary }) {
  return {
    cause: 'app-health',
    severity: 'critical',
    tone: 'red',
    title: `${appName} needs a guided fix`,
    summary,
    nextStep: 'Restart first. If it returns to this state, create a backup before reinstalling or resetting the app.',
    safeAction: { kind: 'app-action', action: 'restart', label: 'Restart app' },
    checklist: ['Check the latest failure reason below.', 'Let the restart finish before trying another fix.', 'Create a backup before reinstalling or resetting.'],
    dangerousActions: recoveryActions(appId),
  };
}

function recoveryActions(appId) {
  if (!appId) {
    return [];
  }
  return [
    {
      label: 'Reinstall with current settings',
      warning: backupSafetyWarning('reinstall'),
      target: `/discover?app=${encodeURIComponent(appId)}&mode=reinstall`,
    },
    {
      label: 'Reset and reinstall',
      warning: backupSafetyWarning('reset'),
      target: `/discover?app=${encodeURIComponent(appId)}&mode=reset-reinstall`,
    },
  ];
}

function resourceWarning(telemetry) {
  const cpu = percent(telemetry?.cpuPercent);
  const memory = percent(telemetry?.memoryPercent);
  if (typeof cpu === 'number' && cpu >= 85) {
    return 'CPU use is unusually high';
  }
  if (typeof memory === 'number' && memory >= 85) {
    return 'Memory use is unusually high';
  }
  return null;
}

function percent(value) {
  if (!value || value === 'Unavailable') {
    return null;
  }
  const parsed = Number.parseFloat(String(value).replace('%', ''));
  return Number.isNaN(parsed) ? null : Math.max(0, Math.min(100, parsed));
}
