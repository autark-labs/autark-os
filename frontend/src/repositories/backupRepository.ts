import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { BackupAPIClient } from '@/api/BackupAPIClient';
import type { BackupReport, RestorePoint } from '@/types/backup';
import type { AutarkOsJob } from '@/types/jobs';
import { syncCanonicalAppMutationResult } from './canonicalAppMutationRepository';

export const backupQueryKeys = {
  all: ['backups'] as const,
  report: ['backups', 'report'] as const,
  plan: (point: RestorePoint | null, appId: string | null) => ['backups', 'plan', point?.id, appId, point?.verifiedAt, point?.verificationStatus] as const,
};

export type BackupReportRepositoryView = {
  error: unknown;
  isFetching: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
  report: BackupReport | null;
  updatedAt: Date | null;
};

export function useBackupReportRepository({ paused = false }: { paused?: boolean } = {}): BackupReportRepositoryView {
  const queryClient = useQueryClient();
  const refresh = useCallback(() => invalidateBackupQueries(queryClient), [queryClient]);
  const query = useQuery({
    queryKey: backupQueryKeys.report,
    queryFn: () => BackupAPIClient.report(),
    refetchInterval: paused ? false : 30_000,
    staleTime: 30_000,
  });

  return {
    error: query.error,
    isFetching: query.isFetching,
    isLoading: query.isLoading,
    refresh,
    report: query.data ?? null,
    updatedAt: query.dataUpdatedAt > 0 ? new Date(query.dataUpdatedAt) : null,
  };
}

export function useRunAppBackupMutation() {
  const queryClient = useQueryClient();
  return useMutation<AutarkOsJob, unknown, string>({
    mutationFn: (appId) => BackupAPIClient.run(appId),
    onSuccess: (job) => {
      syncCanonicalAppMutationResult(queryClient, job);
      void invalidateBackupQueries(queryClient);
    },
  });
}

export function useRunFullBackupMutation() {
  const queryClient = useQueryClient();
  return useMutation<AutarkOsJob>({
    mutationFn: () => BackupAPIClient.runFull(),
    onSuccess: (job) => {
      syncCanonicalAppMutationResult(queryClient, job);
      void invalidateBackupQueries(queryClient);
    },
  });
}

export function useRunRoutineBackupMutation() {
  const queryClient = useQueryClient();
  return useMutation<AutarkOsJob>({
    mutationFn: () => BackupAPIClient.runRoutine(),
    onSuccess: (job) => {
      syncCanonicalAppMutationResult(queryClient, job);
      void invalidateBackupQueries(queryClient);
    },
  });
}

export function useRestorePlanQuery(point: RestorePoint | null, appId: string | null) {
  return useQuery({
    queryKey: backupQueryKeys.plan(point, appId),
    queryFn: () => BackupAPIClient.restorePlan(point!.id, appId),
    enabled: Boolean(point),
  });
}

export function useRestoreBackupMutation() {
  const queryClient = useQueryClient();
  return useMutation<AutarkOsJob, unknown, { restorePointId: number; appId?: string | null }>({
    mutationFn: ({ restorePointId, appId }) => BackupAPIClient.restore(restorePointId, appId),
    onSuccess: (job) => {
      syncCanonicalAppMutationResult(queryClient, job);
      void invalidateBackupQueries(queryClient);
    },
  });
}

export function useVerifyRestorePointMutation() {
  const queryClient = useQueryClient();
  return useMutation<AutarkOsJob, unknown, number>({
    mutationFn: (restorePointId) => BackupAPIClient.verify(restorePointId),
    onSuccess: (job) => {
      syncCanonicalAppMutationResult(queryClient, job);
      void invalidateBackupQueries(queryClient);
    },
  });
}

export function invalidateBackupQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: backupQueryKeys.all });
}
