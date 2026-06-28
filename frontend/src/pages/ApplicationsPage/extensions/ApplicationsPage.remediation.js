const HEALTHY_STATES = new Set(['Ready', 'Running']);
const ATTENTION_STATES = new Set(['Needs attention', 'Unavailable', 'Missing']);

/**
 * @param {{ app?: any, health?: any }} input
 */
export function appRemediationDisplay({ app, health = null } = {}) {
  if (app?.remediation?.state) {
    return app.remediation;
  }

  const settings = app?.settings || {};
  const healthStatus = health?.status || app?.canonicalUserStatus || app?.friendlyStatus || 'Unknown';
  const lastRepairStatus = settings.lastRepairStatus || latestRepairStatus(app?.recentEvents || []);
  const autoRepairEnabled = settings.autoRepairEnabled !== false;
  const hasRestorePoint = app?.canonicalBackupState === 'protected_by_restore_point' || app?.backupState === 'protected_by_restore_point';
  const normalizedRepairStatus = String(lastRepairStatus || '').toLowerCase();
  const repairRunning = normalizedRepairStatus.includes('running') || normalizedRepairStatus.includes('started') || normalizedRepairStatus.includes('queued') || recentRepairStarted(app?.recentEvents || []);
  const repairFailed = normalizedRepairStatus.includes('failed') || normalizedRepairStatus.includes('error') || normalizedRepairStatus.includes('blocked') || normalizedRepairStatus.includes('needs_attention');

  if (repairRunning) {
    return {
      state: 'auto_repairing',
      label: 'Project OS is repairing',
      summary: `${appName(app)} is not ready yet. Project OS is trying a safe repair before asking you to intervene.`,
      nextActionLabel: 'Wait for repair',
      tone: 'warning',
    };
  }

  if (repairFailed && hasRestorePoint) {
    return {
      state: 'restore_recommended',
      label: 'Restore recommended',
      summary: `Safe repair did not finish. A completed restore point is available, so review restore before trying riskier fixes.`,
      nextActionLabel: 'Review restore',
      tone: 'critical',
    };
  }

  if (repairFailed) {
    return {
      state: 'repair_failed',
      label: 'Repair needs review',
      summary: `Project OS tried a safe repair, but ${appName(app)} still needs attention. Review the repair details before taking a riskier action.`,
      nextActionLabel: 'Review repair',
      tone: 'critical',
    };
  }

  if (ATTENTION_STATES.has(healthStatus) || ATTENTION_STATES.has(app?.friendlyStatus)) {
    if (autoRepairEnabled && health?.repairAvailable) {
      return {
        state: 'needs_user_action',
        label: 'Repair available',
        summary: `${appName(app)} needs attention. Project OS can try a safe repair from Manage.`,
        nextActionLabel: 'Open Manage',
        tone: 'warning',
      };
    }
    return {
      state: 'needs_user_action',
      label: 'Needs your review',
      summary: `${appName(app)} needs your review before Project OS can safely recover it.`,
      nextActionLabel: 'Open Manage',
      tone: 'critical',
    };
  }

  if (autoRepairEnabled && HEALTHY_STATES.has(healthStatus)) {
    return {
      state: 'watching',
      label: 'Project OS is watching',
      summary: `${appName(app)} is ready. If it drifts, Project OS will try safe repair before asking you to intervene.`,
      nextActionLabel: 'No action needed',
      tone: 'success',
    };
  }

  return {
    state: 'healthy',
    label: 'Ready',
    summary: `${appName(app)} is ready to use.`,
    nextActionLabel: 'No action needed',
    tone: 'success',
  };
}

export function shouldShowRemediation(display) {
  return display?.state && !['healthy', 'watching'].includes(display.state);
}

function appName(app) {
  return app?.appName || 'This app';
}

function latestRepairStatus(events) {
  const event = events.find((item) => String(item?.type || '').includes('repair'));
  const type = String(event?.type || '').toLowerCase();
  const tone = String(event?.tone || '').toLowerCase();
  if (type.includes('success') || type.includes('succeeded') || tone === 'success') return 'succeeded';
  if (type.includes('fail') || tone === 'danger' || tone === 'error') return 'failed';
  if (type.includes('start') || type.includes('running')) return 'running';
  return null;
}

function recentRepairStarted(events) {
  return events.some((item) => {
    const type = String(item?.type || '').toLowerCase();
    return type.includes('repair') && (type.includes('start') || type.includes('running'));
  });
}
