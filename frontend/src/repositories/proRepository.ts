import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  ProAPIClient,
  type ProDeactivationResult,
  type ProStatusResponse,
} from '@/api/pro';
import { ProProductStateAPIClient } from '@/api/proProductState';
import type { AutarkOsJob } from '@/types/jobs';
import type { ProModuleState } from '@/types/pro';
import {
  invalidateAutarkOsJobs,
  setAutarkOsJobCache,
} from './jobRepository';

export const proQueryKeys = {
  all: ['pro'] as const,
  productState: ['pro', 'product-state'] as const,
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

export function useProProductStateRepository() {
  return useQuery({
    queryKey: proQueryKeys.productState,
    queryFn: () => ProProductStateAPIClient.current(),
    refetchInterval: 30_000,
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
    onSuccess: (status) => acceptAuthoritativeProStatus(queryClient, status),
  });
}

export function useContinueProActivationMutation() {
  const queryClient = useQueryClient();
  return useMutation<ProStatusResponse, unknown, string>({
    mutationFn: (activationId) => ProAPIClient.completeActivation(activationId),
    onSuccess: (status) => acceptAuthoritativeProStatus(queryClient, status),
  });
}

export function useRefreshProEntitlementMutation() {
  const queryClient = useQueryClient();
  return useMutation<ProStatusResponse>({
    mutationFn: () => ProAPIClient.refreshEntitlement(),
    onSuccess: (status) => acceptAuthoritativeProStatus(queryClient, status),
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
  return useMutation<AutarkOsJob, unknown, string>({
    mutationFn: (confirmation) => ProAPIClient.removeModule(confirmation),
    onSuccess: (job) => cacheProModuleJob(queryClient, job),
    onSettled: () => invalidateProModuleLifecycle(queryClient),
  });
}

export function useDeactivateProMutation() {
  const queryClient = useQueryClient();
  return useMutation<ProDeactivationResult, unknown, {
    acknowledgeAccountAssociationRetained: boolean;
    acknowledgeModuleDataRetained: boolean;
    confirmation: string;
  }>({
    mutationFn: (request) => ProAPIClient.deactivate(request),
    onSettled: () => {
      void invalidateProLifecycle(queryClient);
      void invalidateAutarkOsJobs(queryClient);
    },
  });
}

export function setProStatusCache(queryClient: QueryClient, status: ProStatusResponse) {
  queryClient.setQueryData(proQueryKeys.status, status);
}

async function acceptAuthoritativeProStatus(
  queryClient: QueryClient,
  status: ProStatusResponse,
) {
  // Activation and entitlement endpoints return the server's canonical state.
  // Cancel an older status request before caching it: invalidating here could
  // immediately refetch the pre-transition state and incorrectly undo the UI.
  await queryClient.cancelQueries({ queryKey: proQueryKeys.status });
  setProStatusCache(queryClient, status);
  await queryClient.invalidateQueries({ queryKey: proQueryKeys.productState });
}

export function invalidateProStatus(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: proQueryKeys.status });
}

export function invalidateProLifecycle(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: proQueryKeys.productState });
  return invalidateProStatus(queryClient);
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
  return invalidateProLifecycle(queryClient);
}
