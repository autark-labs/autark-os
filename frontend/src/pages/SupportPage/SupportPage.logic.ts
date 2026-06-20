import type { SupportBundle, SupportSummary } from '@/types/system';

export function summaryFromBundle(bundle: SupportBundle): SupportSummary {
  return {
    status: bundle.status,
    headline: bundle.headline,
    summary: bundle.summary,
    redacted: bundle.redacted,
    backendHealth: bundle.backendHealth,
    dockerStatus: bundle.dockerStatus,
    tailscaleStatus: bundle.tailscaleStatus,
    serviceStatus: bundle.serviceStatus,
    version: bundle.version,
    recentFailures: bundle.recentFailureCount,
    findings: bundle.findings,
    redactionRules: bundle.redactionRules,
    commands: bundle.commands,
    checkedAt: bundle.generatedAt,
  };
}

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
