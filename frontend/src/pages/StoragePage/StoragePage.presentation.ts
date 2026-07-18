import type { AppStorageUsage, StorageReport } from '@/types/system';

export type CapacitySegment = {
  bytes: number;
  label: string;
  tone: 'apps' | 'backups' | 'free' | 'other';
};

export function formatStorageBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}

export function safeStoragePercent(value: number) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.max(0, Math.min(100, value));
}

export function storagePercentLabel(value?: number | null) {
  if (value == null || value < 0) return 'Unknown';
  return `${Math.round(value)}%`;
}

export function storageGrowthLabel(app: AppStorageUsage) {
  if (app.trend.length < 2) return 'Collecting';
  if (app.sevenDayGrowthBytes === 0) return 'No change';
  const sign = app.sevenDayGrowthBytes > 0 ? '+' : '-';
  return `${sign}${formatStorageBytes(Math.abs(app.sevenDayGrowthBytes))}`;
}

export function appStorageTotal(report: StorageReport) {
  return report.apps.reduce((total, app) => total + Math.max(0, app.usedBytes), 0);
}

export function weeklyAppGrowth(report: StorageReport) {
  return report.apps.reduce((total, app) => total + app.sevenDayGrowthBytes, 0);
}

export function capacitySegments(report: StorageReport): CapacitySegment[] {
  const hostUsedBytes = Math.max(0, report.hostDisk.usedBytes);
  const appBytes = Math.min(hostUsedBytes, appStorageTotal(report));
  const backupIsOnHost = report.backupDestination?.kind !== 'external';
  const backupBytes = backupIsOnHost
    ? Math.min(Math.max(0, report.backupStorage.usedBytes), Math.max(0, hostUsedBytes - appBytes))
    : 0;
  const otherBytes = Math.max(0, hostUsedBytes - appBytes - backupBytes);

  return [
    { bytes: appBytes, label: 'App data', tone: 'apps' },
    ...(backupBytes > 0 ? [{ bytes: backupBytes, label: 'Backups', tone: 'backups' as const }] : []),
    ...(otherBytes > 0 ? [{ bytes: otherBytes, label: 'Other data', tone: 'other' as const }] : []),
    { bytes: Math.max(0, report.hostDisk.usableBytes), label: 'Free room', tone: 'free' },
  ];
}

export function aggregateAppStorageTrend(apps: AppStorageUsage[], limit = 8) {
  const samples = new Map<string, number>();

  apps.forEach((app) => {
    app.trend.forEach((point) => {
      samples.set(point.sampledAt, (samples.get(point.sampledAt) ?? 0) + Math.max(0, point.usedBytes));
    });
  });

  return [...samples.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-limit)
    .map(([sampledAt, usedBytes]) => ({ sampledAt, usedBytes }));
}

export function storageHeroCopy(report: StorageReport | null) {
  if (!report) {
    return {
      action: 'Storage data is unavailable.',
      summary: 'Autark-OS could not read disk usage yet. Refresh the page or check Support if this continues.',
      title: 'Storage status is unknown',
    };
  }
  if (report.status === 'critical') {
    return {
      action: 'Free up space before installing more apps.',
      summary: report.summary || 'Free space is critically low. Review large apps and unused data before adding anything new.',
      title: 'Storage needs attention now',
    };
  }
  if (report.status === 'warning') {
    return {
      action: 'Review growth and cleanup candidates.',
      summary: report.summary || 'There is still usable room, but storage is getting tight enough to review app data and backups.',
      title: 'Storage is getting tight',
    };
  }
  return {
    action: 'No cleanup needed right now.',
    summary: report.summary || 'You have plenty of room for apps, backups, and normal growth.',
    title: 'Storage has room to grow',
  };
}
