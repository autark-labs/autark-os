import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ActivityAPIClient } from '@/api/ActivityAPIClient';
import { BackupAPIClient } from '@/api/BackupAPIClient';
import { DiscoverAPIClient } from '@/api/DiscoverAPIClient';
import { JobsAPIClient } from '@/api/JobsAPIClient';
import { SystemAPIClient } from '@/api/SystemAPIClient';
import type { ActivityLog } from '@/types/activity';
import type { DiscoverAppView, DiscoverInstallPreview, DiscoverInstallRequestOptions } from '@/types/discover';
import type { ProjectOsJob } from '@/types/jobs';
import type { OnboardingState, StorageReport, SystemDoctorStatus } from '@/types/system';
import { invalidateApplicationState } from './applicationStateRepository';
import { invalidateBackupQueries } from './backupRepository';
import { latestActiveDiscoverJob } from './discoverRepository.logic';
import { useSystemDoctorQuery } from './systemRepository';

export { latestActiveDiscoverJob };

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
  activity: ['discover', 'activity'] as const,
  apps: ['discover', 'apps'] as const,
  jobs: ['discover', 'jobs'] as const,
  job: (jobId: string | null) => ['discover', 'job', jobId] as const,
  preview: (appId: string | null, answers: Record<string, unknown>) => ['discover', 'preview', appId, stableValueKey(answers)] as const,
  readiness: ['discover', 'readiness'] as const,
};

export function useDiscoverAppsQuery() {
  return useQuery<DiscoverAppView[]>({
    queryKey: discoverQueryKeys.apps,
    queryFn: () => DiscoverAPIClient.listApps(),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

export function useMarketplaceActivityQuery() {
  return useQuery<ActivityLog[]>({
    queryKey: discoverQueryKeys.activity,
    queryFn: () => ActivityAPIClient.recent({ category: 'marketplace', limit: 8 }),
    refetchInterval: 30_000,
    staleTime: 30_000,
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
    refetch: async () => {
      const [readiness] = await Promise.all([readinessQuery.refetch(), doctorQuery.refetch()]);
      return readiness;
    },
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
  return useMutation<ProjectOsJob, unknown, DiscoverInstallMutationInput>({
    mutationFn: ({ appId, answers, options = {} }) => DiscoverAPIClient.install(appId, answers, options),
    onSuccess: (job) => {
      queryClient.setQueryData(discoverQueryKeys.job(job.jobId), job);
      void invalidateDiscoverQueries(queryClient);
      void invalidateApplicationState(queryClient);
    },
  });
}

export function useDiscoverBackupMutation() {
  const queryClient = useQueryClient();
  return useMutation<ProjectOsJob, unknown, string>({
    mutationFn: (appId) => BackupAPIClient.run(appId),
    onSuccess: (job) => {
      queryClient.setQueryData(discoverQueryKeys.job(job.jobId), job);
      void invalidateDiscoverQueries(queryClient);
      void invalidateBackupQueries(queryClient);
      void invalidateApplicationState(queryClient);
    },
  });
}

export function useDiscoverJobQuery(jobId: string | null) {
  return useQuery<ProjectOsJob>({
    queryKey: discoverQueryKeys.job(jobId),
    queryFn: () => JobsAPIClient.get(jobId || ''),
    enabled: Boolean(jobId),
    refetchInterval: 1_200,
  });
}

export function useDiscoverJobsQuery() {
  return useQuery<ProjectOsJob[]>({
    queryKey: discoverQueryKeys.jobs,
    queryFn: () => JobsAPIClient.list(),
    refetchInterval: 1_200,
    staleTime: 1_200,
  });
}

export function invalidateDiscoverQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: discoverQueryKeys.all });
}

function stableValueKey(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortValue(child)]),
  );
}
