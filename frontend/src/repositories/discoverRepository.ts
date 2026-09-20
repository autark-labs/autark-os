import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { BackupAPIClient } from '@/api/BackupAPIClient';
import { DiscoverAPIClient } from '@/api/DiscoverAPIClient';
import { SystemAPIClient } from '@/api/SystemAPIClient';
import type { DiscoverAppView, DiscoverInstallPreview, DiscoverInstallRequestOptions } from '@/types/discover';
import type { AutarkOsJob } from '@/types/jobs';
import type { OnboardingState, StorageReport, SystemDoctorStatus } from '@/types/system';
import { syncCanonicalAppMutationResult } from './canonicalAppMutationRepository';
import { invalidateBackupQueries } from './backupRepository';
import { useSystemDoctorQuery } from './systemRepository';

export type DiscoverReadiness = {
  doctor: SystemDoctorStatus | null;
  onboarding: OnboardingState | null;
  storage: StorageReport | null;
};

export type DiscoverInstallMutationInput = {
  answers: Record<string, unknown>;
  appId: string;
  options?: DiscoverInstallRequestOptions;
};

export const discoverQueryKeys = {
  all: ['discover'] as const,
  apps: ['discover', 'apps'] as const,
  preview: (appId: string | null, answers: Record<string, unknown>) => ['discover', 'preview', appId, answers] as const,
  readiness: ['discover', 'readiness'] as const,
};

export function useDiscoverAppsQuery(enabled = true) {
  return useQuery<DiscoverAppView[]>({
    queryKey: discoverQueryKeys.apps,
    queryFn: () => DiscoverAPIClient.listApps(),
    enabled,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

export function useDiscoverReadinessQuery() {
  const doctorQuery = useSystemDoctorQuery();
  const readinessQuery = useQuery<Omit<DiscoverReadiness, 'doctor'>>({
    queryKey: discoverQueryKeys.readiness,
    queryFn: async () => {
      const [onboarding, storage] = await Promise.all([
        SystemAPIClient.onboarding().catch((error) => {
          console.warn('Unable to load starter app recommendations.', error);
          return null;
        }),
        SystemAPIClient.storage().catch((error) => {
          console.warn('Unable to load storage readiness.', error);
          return null;
        }),
      ]);
      return { onboarding, storage };
    },
    refetchInterval: 30_000,
    staleTime: 30_000,
  });
  const { refetch: refetchDoctor } = doctorQuery;
  const { refetch: refetchReadiness } = readinessQuery;
  const refetch = useCallback(async () => {
    const [readiness] = await Promise.all([refetchReadiness(), refetchDoctor()]);
    return readiness;
  }, [refetchReadiness, refetchDoctor]);
  return {
    ...readinessQuery,
    data: {
      doctor: doctorQuery.data ?? null,
      onboarding: readinessQuery.data?.onboarding ?? null,
      storage: readinessQuery.data?.storage ?? null,
    },
    error: readinessQuery.error ?? doctorQuery.error,
    isFetching: readinessQuery.isFetching || doctorQuery.isFetching,
    isLoading: readinessQuery.isLoading || doctorQuery.isLoading,
    refetch,
  };
}

export function useDiscoverInstallPreviewQuery(appId: string | null, answers: Record<string, unknown>, enabled = true) {
  return useQuery<DiscoverInstallPreview>({
    queryKey: discoverQueryKeys.preview(appId, answers),
    queryFn: () => DiscoverAPIClient.installPreview(appId || '', answers),
    enabled: Boolean(appId) && enabled,
    staleTime: 5_000,
  });
}

export function useDiscoverInstallMutation() {
  const queryClient = useQueryClient();
  return useMutation<AutarkOsJob, unknown, DiscoverInstallMutationInput>({
    mutationFn: ({ appId, answers, options = {} }) => DiscoverAPIClient.install(appId, answers, options),
    onSuccess: (job) => {
      syncCanonicalAppMutationResult(queryClient, job);
      void invalidateDiscoverQueries(queryClient);
    },
  });
}

export function useDiscoverBackupMutation() {
  const queryClient = useQueryClient();
  return useMutation<AutarkOsJob, unknown, string>({
    mutationFn: (appId) => BackupAPIClient.run(appId),
    onSuccess: (job) => {
      syncCanonicalAppMutationResult(queryClient, job);
      void invalidateDiscoverQueries(queryClient);
      void invalidateBackupQueries(queryClient);
    },
  });
}

export function invalidateDiscoverQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: discoverQueryKeys.all });
}
