import type { SystemSummary } from '@/types/system';

export type HomeSummaryAvailability = 'available' | 'loading' | 'unavailable';
export type HomeMetricTone = 'info' | 'success' | 'teal' | 'warning';

export type HomeSystemMetric = {
  detail: string;
  tone: HomeMetricTone;
  value: string;
};

export function homeSummaryAvailability(summary: SystemSummary | null | undefined, summaryError: string | null): HomeSummaryAvailability {
  if (summary) {
    return 'available';
  }
  return summaryError ? 'unavailable' : 'loading';
}

export function homeSystemMetrics(summary: SystemSummary | null | undefined, availability: HomeSummaryAvailability): Record<'access' | 'backups' | 'docker' | 'storage', HomeSystemMetric> {
  if (!summary) {
    return unavailableMetrics(availability === 'available' ? 'unavailable' : availability);
  }

  return {
    docker: summary.docker.ready
      ? metric('Ready', 'Docker is ready.', 'success')
      : metric('Needs setup', summary.docker.summary || 'Docker is not ready for app installs.', 'warning'),
    access: accessMetric(summary.access.mode, summary.access.summary),
    backups: backupMetric(summary.backups.state, summary.backups.summary),
    storage: storageMetric(summary.storage.state, summary.storage.summary),
  };
}

function unavailableMetrics(availability: Exclude<HomeSummaryAvailability, 'available'>): Record<'access' | 'backups' | 'docker' | 'storage', HomeSystemMetric> {
  const checking = availability === 'loading';
  const value = checking ? 'Checking' : 'Status unavailable';
  const tone: HomeMetricTone = checking ? 'info' : 'warning';
  const suffix = checking ? 'is loading.' : 'could not be loaded.';

  return {
    docker: metric(value, `Docker status ${suffix}`, tone),
    access: metric(value, `Access status ${suffix}`, tone),
    backups: metric(value, `Backup status ${suffix}`, tone),
    storage: metric(value, `Storage status ${suffix}`, checking ? 'info' : 'warning'),
  };
}

function accessMetric(mode: string | null | undefined, detail: string | null | undefined): HomeSystemMetric {
  if (mode === 'private_ready') return metric('Private ready', detail || 'Private access is ready for at least one app.', 'success');
  if (mode === 'local_only') return metric('Local ready', detail || 'Local access is ready.', 'info');
  if (mode === 'private_needs_setup') return metric('Needs setup', detail || 'Private access needs setup.', 'warning');
  if (mode === 'mocked_dev') return metric('Dev mock', detail || 'Development access is mocked.', 'info');
  if (mode === 'not_ready') return metric('No app access yet', detail || 'No app access is ready yet.', 'warning');
  return metric('Status unavailable', detail || 'Autark-OS could not determine access status.', 'warning');
}

function backupMetric(state: string | null | undefined, detail: string | null | undefined): HomeSystemMetric {
  if (state === 'protected_by_restore_point') return metric('Protected by restore point', detail || 'A completed restore point protects managed app data.', 'success');
  if (state === 'needs_restore_point') return metric('First backup needed', detail || 'At least one app needs a restore point.', 'warning');
  if (state === 'not_configured') return metric('Not configured', detail || 'No restore point is required yet.', 'info');
  return metric('Status unavailable', detail || 'Autark-OS could not determine backup protection.', 'warning');
}

function storageMetric(state: string | null | undefined, detail: string | null | undefined): HomeSystemMetric {
  if (state === 'ready') return metric('Ready', detail || 'Storage is ready.', 'teal');
  if (state === 'warning') return metric('Needs review', detail || 'Storage needs attention.', 'warning');
  if (state === 'unknown') return metric('Check Storage', detail || 'Open Storage to review capacity and app data.', 'info');
  return metric('Status unavailable', detail || 'Autark-OS could not determine storage status.', 'warning');
}

function metric(value: string, detail: string, tone: HomeMetricTone): HomeSystemMetric {
  return { detail, tone, value };
}
