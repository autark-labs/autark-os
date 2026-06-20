export type HostMetricSample = {
  systemCpuPercent: number;
  processCpuPercent: number;
  usedMemoryPercent: number;
  runtimeUsedPercent: number;
  totalMemoryBytes: number;
  freeMemoryBytes: number;
  runtimeTotalBytes: number;
  runtimeUsableBytes: number;
  sampledAt: string;
};

export type AppMetricSample = {
  appId: string;
  cpuPercent: number;
  memoryPercent: number;
  memoryUsage: string;
  sampledAt: string;
};

export type MonitoringHistory = {
  windowMinutes: number;
  retentionMinutes: number;
  windowLabel: string;
  hostSamples: HostMetricSample[];
  appSamples: AppMetricSample[];
  checkedAt: string;
};

export type MonitoringDiagnostics = {
  summary: string;
  windowMinutes: number;
  hostSampleCount: number;
  appSampleCount: number;
  notes: string[];
  history: MonitoringHistory;
  generatedAt: string;
};
