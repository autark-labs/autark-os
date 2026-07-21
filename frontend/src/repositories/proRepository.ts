import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  ProAPIClient,
  type ProStatusResponse,
} from '@/api/pro';
import type { AutarkOsJob } from '@/types/jobs';
import type { ProModuleState } from '@/types/pro';
import {
  invalidateAutarkOsJobs,
  setAutarkOsJobCache,
} from './jobRepository';

export const proQueryKeys = {
  all: ['pro'] as const,
  status: ['pro', 'status'] as const,
};

const ACTIVE_MODULE_STATES = new Set<ProModuleState>([
  'DOWNLOADING',
  'VERIFYING',
  'STARTING_CANDIDATE',
  'HEALTH_CHECKING',
  'ROLLING_BACK',
  'REMOVING',
]);

export function useProStatusRepository() {
  return useQuery({
    queryKey: proQueryKeys.status,
    queryFn: () => ProAPIClient.status(),
    refetchInterval: (query) => {
      const status = query.state.data;
      return status
        && (status.activation.state !== 'idle'
          || status.refresh.inProgress
          || ACTIVE_MODULE_STATES.has(status.module.state))
        ? 2_000
        : 30_000;
    },
    staleTime: 5_000,
  });
}

export function useActivateProMutation() {
  const queryClient = useQueryClient();
  return useMutation<ProStatusResponse, unknown, string>({
    mutationFn: async (activationCode) => {
      const attempt = await ProAPIClient.startActivation(activationCode);
      return ProAPIClient.completeActivation(attempt.activationId);
    },
    onSuccess: (status) => setProStatusCache(queryClient, status),
    onSettled: () => void invalidateProStatus(queryClient),
  });
}

export function useContinueProActivationMutation() {
  const queryClient = useQueryClient();
  return useMutation<ProStatusResponse, unknown, string>({
    mutationFn: (activationId) => ProAPIClient.completeActivation(activationId),
    onSuccess: (status) => setProStatusCache(queryClient, status),
    onSettled: () => void invalidateProStatus(queryClient),
  });
}

export function useRefreshProEntitlementMutation() {
  const queryClient = useQueryClient();
  return useMutation<ProStatusResponse>({
    mutationFn: () => ProAPIClient.refreshEntitlement(),
    onSuccess: (status) => setProStatusCache(queryClient, status),
    onSettled: () => void invalidateProStatus(queryClient),
  });
}

export function useCheckProModuleReleaseMutation() {
  const queryClient = useQueryClient();
  return useMutation<AutarkOsJob>({
    mutationFn: () => ProAPIClient.checkModuleRelease(),
    onSuccess: (job) => cacheProModuleJob(queryClient, job),
    onSettled: () => invalidateProModuleLifecycle(queryClient),
  });
}

export function useInstallOrUpdateProModuleMutation() {
  const queryClient = useQueryClient();
  return useMutation<AutarkOsJob>({
    mutationFn: () => ProAPIClient.installOrUpdateModule(),
    onSuccess: (job) => cacheProModuleJob(queryClient, job),
    onSettled: () => invalidateProModuleLifecycle(queryClient),
  });
}

export function useRemoveProModuleMutation() {
  const queryClient = useQueryClient();
  return useMutation<AutarkOsJob>({
    mutationFn: () => ProAPIClient.removeModule(),
    onSuccess: (job) => cacheProModuleJob(queryClient, job),
    onSettled: () => invalidateProModuleLifecycle(queryClient),
  });
}

export function setProStatusCache(queryClient: QueryClient, status: ProStatusResponse) {
  queryClient.setQueryData(proQueryKeys.status, status);
}

export function invalidateProStatus(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: proQueryKeys.status });
}

function cacheProModuleJob(queryClient: QueryClient, job: AutarkOsJob) {
  setAutarkOsJobCache(queryClient, job);
  queryClient.setQueryData<ProStatusResponse>(
    proQueryKeys.status,
    (current) => current
      ? {
          ...current,
          module: {
            ...current.module,
            jobId: job.jobId,
          },
        }
      : current,
  );
}

function invalidateProModuleLifecycle(queryClient: QueryClient) {
  void invalidateAutarkOsJobs(queryClient);
  return invalidateProStatus(queryClient);
}
