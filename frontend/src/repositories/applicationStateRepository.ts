import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ApplicationStateAPIClient } from '@/api/ApplicationStateAPIClient';
import type { ApplicationState } from '@/types/applicationState';
import {
  accessByAppId,
  appNeedsAttentionFromCanonicalState,
  applicationStateQueryKey,
  applicationStateUpdatedAt,
  catalogAppIsManaged,
  displayStatusFromCanonicalState,
  foundServices,
  healthByAppId,
  managedRuntimeApps,
  removeManagedAppFromState,
  observedServices,
  ownershipViews,
  pinnedExternalServices,
  setAutarkOsJobInState,
  setObservedServicePinnedInState,
  setRuntimeAppInState,
  setRuntimeAppStatusInState,
  telemetryByAppId,
} from './applicationStateRepository.logic';
import type { AppAccessCheck, AppHealthSnapshot, AppRuntimeView, AppTelemetry } from '@/types/app';
import type { AppOwnershipView } from '@/types/appOwnership';
import type { ObservedServiceView } from '@/types/observedService';
import type { AutarkOsJob } from '@/types/jobs';

export {
  accessByAppId,
  appNeedsAttentionFromCanonicalState,
  applicationStateQueryKey,
  applicationStateUpdatedAt,
  catalogAppIsManaged,
  displayStatusFromCanonicalState,
  foundServices,
  healthByAppId,
  managedRuntimeApps,
  removeManagedAppFromState,
  observedServices,
  ownershipViews,
  pinnedExternalServices,
  setAutarkOsJobInState,
  setObservedServicePinnedInState,
  setRuntimeAppInState,
  setRuntimeAppStatusInState,
  telemetryByAppId,
};

export type ApplicationStateRepositoryView = {
  accessByAppId: Record<string, AppAccessCheck>;
  apps: AppRuntimeView[];
  foundServices: ObservedServiceView[];
  healthByAppId: Record<string, AppHealthSnapshot>;
  observedServices: ObservedServiceView[];
  ownershipViews: AppOwnershipView[];
  pinnedExternalServices: ObservedServiceView[];
  telemetryByAppId: Record<string, AppTelemetry>;
  updatedAt: Date | null;
};

export function useApplicationStateQuery() {
  return useQuery({
    queryKey: applicationStateQueryKey,
    queryFn: () => ApplicationStateAPIClient.get(),
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
  return {
    accessByAppId: accessByAppId(state),
    applicationState: state,
    apps: managedRuntimeApps(state),
    error: query.error,
    foundServices: foundServices(state),
    healthByAppId: healthByAppId(state),
    isFetching: query.isFetching || refreshMutation.isPending,
    isLoading: query.isLoading,
    observedServices: observedServices(state),
    ownershipViews: ownershipViews(state),
    pinnedExternalServices: pinnedExternalServices(state),
    refresh: async () => refreshMutation.mutateAsync(),
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

export function setObservedServicePinnedInApplicationStateCache(queryClient: QueryClient, serviceId: string, pinned: boolean) {
  queryClient.setQueryData<ApplicationState | undefined>(applicationStateQueryKey, (current) => setObservedServicePinnedInState(current, serviceId, pinned));
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

export function setRuntimeAppStatusInApplicationStateCache(queryClient: QueryClient, appId: string, status: string) {
  queryClient.setQueryData<ApplicationState | undefined>(applicationStateQueryKey, (current) => setRuntimeAppStatusInState(current, appId, status));
}

export function removeManagedAppFromApplicationStateCache(queryClient: QueryClient, appId: string) {
  queryClient.setQueryData<ApplicationState | undefined>(applicationStateQueryKey, (current) => removeManagedAppFromState(current, appId));
}
