import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ActivityAPIClient } from '@/api/ActivityAPIClient';
import { InstalledAppsAPIClient } from '@/api/InstalledAppsAPIClient';
import { MonitoringAPIClient } from '@/api/MonitoringAPIClient';
import { SystemAPIClient } from '@/api/SystemAPIClient';
import type { ActivityFilters, ActivityLog } from '@/types/activity';
import type { AppReliabilitySummary } from '@/types/app';
import type { MonitoringDiagnostics, MonitoringHistory } from '@/types/monitoring';
import type { SystemMetrics } from '@/types/system';

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

export type MonitoringRepositoryView = {
  activity: ActivityLog[];
  error: unknown;
  history: MonitoringHistory | null;
  isFetching: boolean;
  isLoading: boolean;
  metrics: SystemMetrics | null;
  refresh: () => Promise<void>;
  reliability: AppReliabilitySummary | null;
  updatedAt: Date | null;
};

export function useMonitoringRepository(filters: ActivityFilters, windowMinutes = 60): MonitoringRepositoryView {
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
  const queries = [activityQuery, reliabilityQuery, metricsQuery, historyQuery];

  return {
    activity: activityQuery.data ?? [],
    error: queries.find((query) => query.error)?.error ?? null,
    history: historyQuery.data ?? null,
    isFetching: queries.some((query) => query.isFetching),
    isLoading: queries.some((query) => query.isLoading),
    metrics: metricsQuery.data ?? null,
    refresh: () => invalidateMonitoringQueries(queryClient),
    reliability: reliabilityQuery.data ?? null,
    updatedAt: latestUpdatedAt(queries.map((query) => query.dataUpdatedAt)),
  };
}

export function useMonitoringDiagnosticsMutation() {
  return useMutation<MonitoringDiagnostics, unknown, number>({
    mutationFn: (windowMinutes) => MonitoringAPIClient.diagnostics(windowMinutes),
  });
}

export function invalidateMonitoringQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: monitoringQueryKeys.all });
}

function latestUpdatedAt(timestamps: number[]) {
  const latest = Math.max(...timestamps);
  return Number.isFinite(latest) && latest > 0 ? new Date(latest) : null;
}
