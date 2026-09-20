import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityAPIClient } from '@/api/ActivityAPIClient';
import { InstalledAppsAPIClient } from '@/api/InstalledAppsAPIClient';
import { MonitoringAPIClient } from '@/api/MonitoringAPIClient';
import { SystemAPIClient } from '@/api/SystemAPIClient';
import type { ActivityFilters } from '@/types/activity';
import type { MonitoringDiagnostics } from '@/types/monitoring';

export const monitoringQueryKeys = {
  all: ['monitoring'] as const,
  activity: (filters: ActivityFilters) => ['monitoring', 'activity', filters] as const,
  reliability: ['monitoring', 'reliability'] as const,
  metrics: ['monitoring', 'metrics'] as const,
  history: (windowMinutes: number) => ['monitoring', 'history', windowMinutes] as const,
};

const monitoringQueryOptions = {
  refetchInterval: 10_000,
  staleTime: 10_000,
};

export function useMonitoringRepository(filters: ActivityFilters) {
  const queryClient = useQueryClient();
  const activityQuery = useQuery({
    queryKey: monitoringQueryKeys.activity(filters),
    queryFn: () => ActivityAPIClient.recent(filters),
    ...monitoringQueryOptions,
  });
  const reliabilityQuery = useQuery({
    queryKey: monitoringQueryKeys.reliability,
    queryFn: () => InstalledAppsAPIClient.reliabilitySummary(),
    ...monitoringQueryOptions,
  });
  return { activityQuery, reliabilityQuery, refresh: () => queryClient.invalidateQueries({ queryKey: monitoringQueryKeys.all }) };
}

// Mounted only while System metrics is visible; History does not collect samples.
export function useMonitoringMetricsRepository(windowMinutes = 60) {
  const metricsQuery = useQuery({
    queryKey: monitoringQueryKeys.metrics,
    queryFn: () => SystemAPIClient.metrics(),
    ...monitoringQueryOptions,
  });
  const historyQuery = useQuery({
    queryKey: monitoringQueryKeys.history(windowMinutes),
    queryFn: () => MonitoringAPIClient.history(windowMinutes),
    ...monitoringQueryOptions,
  });
  return { metricsQuery, historyQuery };
}

export function useMonitoringDiagnosticsMutation() {
  return useMutation<MonitoringDiagnostics, unknown, number>({
    mutationFn: (windowMinutes) => MonitoringAPIClient.diagnostics(windowMinutes),
  });
}
