import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ApplicationStateAPIClient } from '@/api/ApplicationStateAPIClient';
import type { ApplicationState, ApplicationStateFreshness, ApplicationView } from '@/types/applicationState';
import {
  accessByAppId,
  appNeedsAttentionFromCanonicalState,
  applications,
  applicationStateFreshness,
  applicationStateQueryKey,
  applicationStateUpdatedAt,
  catalogAppIsManaged,
  displayStatusFromCanonicalState,
  healthByAppId,
  setAutarkOsJobInState,
  setRuntimeAppInState,
  telemetryByAppId,
} from './applicationStateRepository.logic';
import type { AppAccessCheck, AppHealthSnapshot, AppRuntimeView, AppTelemetry } from '@/types/app';
import type { AutarkOsJob } from '@/types/jobs';

export {
  accessByAppId,
  appNeedsAttentionFromCanonicalState,
  applications,
  applicationStateFreshness,
  applicationStateQueryKey,
  applicationStateUpdatedAt,
  catalogAppIsManaged,
  displayStatusFromCanonicalState,
  healthByAppId,
  setAutarkOsJobInState,
  setRuntimeAppInState,
  telemetryByAppId,
};

export type ApplicationStateRepositoryView = {
  accessByAppId: Record<string, AppAccessCheck>;
  applications: ApplicationView[];
  freshness: ApplicationStateFreshness;
  healthByAppId: Record<string, AppHealthSnapshot>;
  lastError: string | null;
  refreshStatus: string;
  stale: boolean;
  telemetryByAppId: Record<string, AppTelemetry>;
  updatedAt: Date | null;
};

export function useApplicationStateQuery() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: applicationStateQueryKey,
    queryFn: () => ApplicationStateAPIClient.get({
      refresh: !queryClient.getQueryData<ApplicationState>(applicationStateQueryKey),
    }),
    refetchInterval: 10_000,
    staleTime: 10_000,
  });
}

export function useRefreshApplicationStateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => ApplicationStateAPIClient.refresh(),
    onSuccess: (state) => setApplicationStateCache(queryClient, state),
  });
}

export function useApplicationStateRepository(): ApplicationStateRepositoryView & {
  applicationState: ApplicationState | undefined;
  error: unknown;
  isFetching: boolean;
  isLoading: boolean;
  refresh: () => Promise<ApplicationState | undefined>;
} {
  const query = useApplicationStateQuery();
  const refreshMutation = useRefreshApplicationStateMutation();
  const state = query.data;
  const error = refreshMutation.error ?? query.error;
  const freshness = applicationStateFreshness(state, { transportError: error });
  return {
    accessByAppId: accessByAppId(state),
    applicationState: state,
    applications: applications(state),
    error,
    freshness,
    healthByAppId: healthByAppId(state),
    isFetching: query.isFetching || refreshMutation.isPending,
    isLoading: query.isLoading,
    lastError: state?.lastError?.trim() || null,
    refreshStatus: state?.refreshStatus || (state ? 'unknown' : 'stale'),
    refresh: async () => refreshMutation.mutateAsync(),
    stale: state?.stale ?? !state,
    telemetryByAppId: telemetryByAppId(state),
    updatedAt: applicationStateUpdatedAt(state),
  };
}

export function setApplicationStateCache(queryClient: QueryClient, state?: ApplicationState | null) {
  if (state) {
    queryClient.setQueryData(applicationStateQueryKey, state);
  }
}

export function setApplicationStateFromActionResultCache(queryClient: QueryClient, result?: { applicationState?: ApplicationState | null } | null) {
  if (!result?.applicationState) {
    return false;
  }
  setApplicationStateCache(queryClient, result.applicationState);
  return true;
}

export function invalidateApplicationState(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: applicationStateQueryKey });
}

export function setAutarkOsJobInApplicationStateCache(queryClient: QueryClient, job?: AutarkOsJob | null) {
  if (!job) {
    return;
  }
  queryClient.setQueryData<ApplicationState | undefined>(applicationStateQueryKey, (current) => setAutarkOsJobInState(current, job));
}

export function setRuntimeAppInApplicationStateCache(queryClient: QueryClient, app: AppRuntimeView) {
  queryClient.setQueryData<ApplicationState | undefined>(applicationStateQueryKey, (current) => setRuntimeAppInState(current, app));
}
