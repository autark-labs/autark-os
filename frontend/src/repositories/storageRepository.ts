import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { SystemAPIClient } from '@/api/SystemAPIClient';
import type { StorageReport } from '@/types/system';
import type { AutarkOsJob } from '@/types/jobs';
import { syncCanonicalAppMutationResult } from './canonicalAppMutationRepository';
import { invalidateApplicationState } from './applicationStateRepository';
import { systemQueryKeys } from './systemRepository';
import { terminalJob } from './jobRepository';

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
  return useMutation<AutarkOsJob, unknown, string>({
    mutationFn: (name) => SystemAPIClient.cleanupOrphan(name),
    onSuccess: (job) => {
      syncCanonicalAppMutationResult(queryClient, job);
      if (terminalJob(job)) void invalidateStorageCleanupQueries(queryClient);
    },
  });
}

export function invalidateStorageQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: storageQueryKeys.all });
}

export function invalidateStorageCleanupQueries(queryClient: QueryClient) {
  return Promise.all([
    invalidateStorageQueries(queryClient),
    invalidateApplicationState(queryClient),
    ...[systemQueryKeys.summary, ['monitoring'], ['activity'], ['backups'], ['discover', 'readiness']]
      .map(queryKey => queryClient.invalidateQueries({ queryKey })),
  ]);
}
