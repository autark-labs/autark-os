import type { SystemSetupStatus } from '@/types/system';

export function formatDate(value?: string) {
  if (!value) return 'not yet';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function shortSha(value: string) {
  if (!value || value === 'development' || value === 'unknown') {
    return value || 'unknown';
  }
  return value.length > 12 ? value.slice(0, 12) : value;
}

export function humanize(value: string) {
  return value.replace(/[-_]/g, ' ');
}

export function productionConflictSummary(setup: SystemSetupStatus | null | undefined) {
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
    title: 'Existing Autark-OS install found',
    message: report.summary || 'Review found apps before creating another production instance.',
  };
}
