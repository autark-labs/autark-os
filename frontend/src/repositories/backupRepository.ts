import axios from 'axios';
import { useCallback } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { BackupAPIClient } from '@/api/BackupAPIClient';
import type { BackupReport, RestorePoint } from '@/types/backup';
import type { AutarkOsJob } from '@/types/jobs';
import { syncCanonicalAppMutationResult } from './canonicalAppMutationRepository';
import { invalidateApplicationState } from './applicationStateRepository';
import { invalidateStorageQueries } from './storageRepository';
import { systemQueryKeys } from './systemRepository';
import { recommendedActionQueryKeys } from './recommendedActionRepository';

export const backupQueryKeys = {
  all: ['backups'] as const,
  archive: (appId: string | null) => ['backups', 'archive', appId] as const,
  point: (id: number | null) => ['backups', 'point', id] as const,
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
  return useMutation<AutarkOsJob, unknown, { appId: string; planId: string }>({
    mutationFn: ({ appId, planId }) => BackupAPIClient.run(appId, planId),
    onSuccess: (job) => {
      syncCanonicalAppMutationResult(queryClient, job);
      void invalidateBackupQueries(queryClient);
    },
  });
}

export function useConfigureBackupDestinationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => BackupAPIClient.configureDestination(path),
    // Reconcile even a lost response without replacing unsaved Settings drafts.
    onSettled: () => Promise.all([
      invalidateBackupQueries(queryClient),
      invalidateStorageQueries(queryClient),
      invalidateApplicationState(queryClient),
      queryClient.invalidateQueries({ queryKey: systemQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: recommendedActionQueryKeys.all }),
    ]),
  });
}

export function useRunFullBackupMutation() {
  const queryClient = useQueryClient();
  return useMutation<AutarkOsJob, unknown, string>({
    mutationFn: (planId) => BackupAPIClient.runFull(planId),
    onSuccess: (job) => {
      syncCanonicalAppMutationResult(queryClient, job);
      void invalidateBackupQueries(queryClient);
    },
  });
}

export function useRunRoutineBackupMutation() {
  const queryClient = useQueryClient();
  return useMutation<AutarkOsJob, unknown, string>({
    mutationFn: (planId) => BackupAPIClient.runRoutine(planId),
    onSuccess: (job) => {
      syncCanonicalAppMutationResult(queryClient, job);
      void invalidateBackupQueries(queryClient);
    },
  });
}

export function useRestorePointInventory(appId: string | null) {
  return useInfiniteQuery({
    queryKey: backupQueryKeys.archive(appId),
    queryFn: ({ pageParam }) => BackupAPIClient.restorePoints(pageParam, appId),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (page) => page.nextBeforeId ?? undefined,
  });
}

export function useRestorePointQuery(id: number | null) {
  const query = useQuery({
    queryKey: backupQueryKeys.point(id),
    queryFn: () => BackupAPIClient.restorePoint(id!),
    enabled: id !== null,
    retry: false,
  });
  return { ...query, data: axios.isAxiosError(query.error) && query.error.response?.status === 404 ? undefined : query.data };
}

export function useRestorePlanQuery(point: RestorePoint | null, appId: string | null, enabled = true) {
  return useQuery({
    queryKey: backupQueryKeys.plan(point, appId),
    queryFn: () => BackupAPIClient.restorePlan(point!.id, appId),
    enabled: enabled && Boolean(point),
  });
}

export function useRestoreBackupMutation() {
  const queryClient = useQueryClient();
  return useMutation<AutarkOsJob, unknown, { restorePointId: number; planId: string; appId?: string | null }>({
    mutationFn: ({ restorePointId, planId, appId }) => BackupAPIClient.restore(restorePointId, planId, appId),
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
