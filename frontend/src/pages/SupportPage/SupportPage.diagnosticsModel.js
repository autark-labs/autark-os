const summaryOrder = ['docker', 'apps', 'tailscale', 'backups', 'storage'];

export function diagnosticsHeadline(summary, doctor) {
  const needsAttention = summary?.status === 'needs_admin_setup' || doctor?.status === 'needs_attention' || (summary?.findings || []).length > 0;
  return needsAttention ? 'Needs attention' : 'Ready';
}

/**
 * @param {{ summary?: any, doctor?: any, setup?: any, managedApps?: any[], observedServices?: any[] }} params
 */
export function diagnosticsSummaryRows({ summary, doctor, setup, managedApps = [], observedServices = [] }) {
  const checks = new Map((doctor?.checks || setup?.checks || []).map((check) => [check.id, check]));
  const rows = {
    docker: statusRow('Docker', checkLabel(checks.get('docker'), summary?.dockerStatus)),
    apps: appRow(observedServices, managedApps),
    tailscale: statusRow('Tailscale', checkLabel(checks.get('tailscale'), summary?.tailscaleStatus)),
    backups: statusRow('Backups', backupLabel(summary)),
    storage: statusRow('Storage', storageLabel(summary)),
  };
  return summaryOrder.map((id) => ({ id, ...rows[id] }));
}

export function productionConflictSummary(setup) {
  const report = setup?.existingInstall;
  const hasDevelopmentResources = setup?.devMode && report?.developmentInstanceAllowed && (report?.resources || []).length > 0;
  if (!report?.conflict && !hasDevelopmentResources) {
    return null;
  }
  if (setup?.devMode || report.developmentInstanceAllowed) {
    return {
      tone: 'info',
      title: 'Development instance detected',
      message: report.summary || 'This development instance is isolated from production.',
    };
  }
  return {
    tone: 'warning',
    title: 'Existing Project OS install found',
    message: report.summary || 'Review found apps before creating another production instance.',
  };
}

function statusRow(label, value) {
  const clean = String(value || '').toLowerCase();
  const tone = clean.includes('ready') || clean.includes('connected') || clean.includes('ok') ? 'success' : clean.includes('no ') || clean.includes('missing') || clean.includes('not ') || clean.includes('issue') ? 'warning' : 'neutral';
  return { label, value: value || 'Unknown', tone };
}

function appRow(observedServices, managedApps) {
  const issues = (observedServices || []).filter((service) => service.userStatus !== 'installed_managed');
  const repairing = (managedApps || []).filter((app) => app?.remediation?.state === 'auto_repairing').length;
  const failed = (managedApps || []).filter((app) => ['repair_failed', 'restore_recommended'].includes(app?.remediation?.state)).length;
  const needsReview = (managedApps || []).filter((app) => app?.remediation?.state === 'needs_user_action').length;
  const parts = [];
  if (issues.length) parts.push(`${issues.length} found on this server`);
  if (repairing) parts.push(`${repairing} repairing`);
  if (failed) parts.push(`${failed} repair failed`);
  if (needsReview) parts.push(`${needsReview} need review`);
  if (!parts.length) {
    return { label: 'Apps', value: 'Ready', tone: 'success' };
  }
  return { label: 'Apps', value: parts.join(', '), tone: failed ? 'warning' : 'warning' };
}

function checkLabel(check, fallback) {
  if (check?.status === 'ok') {
    return 'Ready';
  }
  return check?.message || fallback || 'Unknown';
}

function backupLabel(summary) {
  const finding = (summary?.findings || []).find((item) => item.area === 'backups');
  return finding?.title || 'No restore point yet';
}

function storageLabel(summary) {
  const finding = (summary?.findings || []).find((item) => item.area === 'storage');
  return finding?.title || 'Ready';
}
