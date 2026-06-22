import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { SystemAPIClient } from '@/api/SystemAPIClient';
import type { RuntimeMigrationPlan, RuntimeMigrationPlanRequest, StorageCleanupResult, StorageReport } from '@/types/system';

export const storageQueryKeys = {
  all: ['storage'] as const,
  report: ['storage', 'report'] as const,
};

export type StorageReportRepositoryView = {
  error: unknown;
  isFetching: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
  report: StorageReport | null;
  updatedAt: Date | null;
};

export function useStorageReportRepository(): StorageReportRepositoryView {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: storageQueryKeys.report,
    queryFn: () => SystemAPIClient.storage(),
    refetchInterval: 30_000,
    staleTime: 30_000,
  });

  return {
    error: query.error,
    isFetching: query.isFetching,
    isLoading: query.isLoading,
    refresh: () => invalidateStorageQueries(queryClient),
    report: query.data ?? null,
    updatedAt: query.dataUpdatedAt > 0 ? new Date(query.dataUpdatedAt) : null,
  };
}

export function useCleanupOrphanMutation() {
  const queryClient = useQueryClient();
  return useMutation<StorageCleanupResult, unknown, string>({
    mutationFn: (name) => SystemAPIClient.cleanupOrphan(name),
    onSuccess: () => invalidateStorageQueries(queryClient),
  });
}

export function useRuntimeMigrationPlanMutation() {
  return useMutation<RuntimeMigrationPlan, unknown, RuntimeMigrationPlanRequest>({
    mutationFn: (request) => SystemAPIClient.runtimeMigrationPlan(request),
  });
}

export function invalidateStorageQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: storageQueryKeys.all });
}
