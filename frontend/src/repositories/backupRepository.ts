import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { BackupAPIClient } from '@/api/BackupAPIClient';
import { JobsAPIClient } from '@/api/JobsAPIClient';
import type { BackupReport, RestorePlan } from '@/types/backup';
import type { ProjectOsJob } from '@/types/jobs';

export const backupQueryKeys = {
  all: ['backups'] as const,
  report: ['backups', 'report'] as const,
  job: (jobId: string | null) => ['backups', 'job', jobId] as const,
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

export function useProjectOsJobQuery(jobId: string | null) {
  return useQuery({
    queryKey: backupQueryKeys.job(jobId),
    queryFn: () => JobsAPIClient.get(jobId || ''),
    enabled: Boolean(jobId),
    refetchInterval: 1_200,
  });
}

export function useRunAppBackupMutation() {
  const queryClient = useQueryClient();
  return useMutation<ProjectOsJob, unknown, string>({
    mutationFn: (appId) => BackupAPIClient.run(appId),
    onSuccess: () => invalidateBackupQueries(queryClient),
  });
}

export function useRunFullBackupMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => BackupAPIClient.runFull(),
    onSuccess: () => invalidateBackupQueries(queryClient),
  });
}

export function useRunRoutineBackupMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => BackupAPIClient.runRoutine(),
    onSuccess: () => invalidateBackupQueries(queryClient),
  });
}

export function useRestorePlanMutation() {
  return useMutation<RestorePlan, unknown, { restorePointId: number; appId?: string | null }>({
    mutationFn: ({ restorePointId, appId }) => BackupAPIClient.restorePlan(restorePointId, appId),
  });
}

export function useRestoreBackupMutation() {
  const queryClient = useQueryClient();
  return useMutation<ProjectOsJob, unknown, { restorePointId: number; appId?: string | null }>({
    mutationFn: ({ restorePointId, appId }) => BackupAPIClient.restore(restorePointId, appId),
    onSuccess: () => invalidateBackupQueries(queryClient),
  });
}

export function useVerifyRestorePointMutation() {
  const queryClient = useQueryClient();
  return useMutation<ProjectOsJob, unknown, number>({
    mutationFn: (restorePointId) => BackupAPIClient.verify(restorePointId),
    onSuccess: () => invalidateBackupQueries(queryClient),
  });
}

export function invalidateBackupQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: backupQueryKeys.all });
}
