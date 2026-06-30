import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ApplicationStateAPIClient } from '@/api/ApplicationStateAPIClient';
import { InstalledAppsAPIClient } from '@/api/InstalledAppsAPIClient';
import type { ApplicationState } from '@/types/applicationState';
import {
  accessByAppId,
  appNeedsAttentionFromCanonicalState,
  applicationStateQueryKey,
  applicationStateUpdatedAt,
  catalogAppIsManaged,
  displayStatusFromCanonicalState,
  healthByAppId,
  managedRuntimeApps,
  removeManagedAppFromState,
  observedServices,
  ownershipViews,
  setProjectOsJobInState,
  setRuntimeAppInState,
  setRuntimeAppStatusInState,
  telemetryByAppId,
  updatesByAppId,
} from './applicationStateRepository.logic';
import type { AppAccessCheck, AppHealthSnapshot, AppRuntimeView, AppTelemetry, AppUpdateStatus } from '@/types/app';
import type { AppOwnershipView } from '@/types/appOwnership';
import type { ObservedServiceView } from '@/types/observedService';
import type { ProjectOsJob } from '@/types/jobs';

export {
  accessByAppId,
  appNeedsAttentionFromCanonicalState,
  applicationStateQueryKey,
  applicationStateUpdatedAt,
  catalogAppIsManaged,
  displayStatusFromCanonicalState,
  healthByAppId,
  managedRuntimeApps,
  removeManagedAppFromState,
  observedServices,
  ownershipViews,
  setProjectOsJobInState,
  setRuntimeAppInState,
  setRuntimeAppStatusInState,
  telemetryByAppId,
  updatesByAppId,
};

export const appUpdatesQueryKey = ['app-updates'];

export type ApplicationStateRepositoryView = {
  accessByAppId: Record<string, AppAccessCheck>;
  apps: AppRuntimeView[];
  healthByAppId: Record<string, AppHealthSnapshot>;
  observedServices: ObservedServiceView[];
  ownershipViews: AppOwnershipView[];
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

export function useAppUpdatesQuery() {
  return useQuery({
    queryKey: appUpdatesQueryKey,
    queryFn: () => InstalledAppsAPIClient.updates(),
    refetchInterval: 30_000,
    staleTime: 30_000,
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
    healthByAppId: healthByAppId(state),
    isFetching: query.isFetching || refreshMutation.isPending,
    isLoading: query.isLoading,
    observedServices: observedServices(state),
    ownershipViews: ownershipViews(state),
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

export function invalidateApplicationState(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: applicationStateQueryKey });
}

export function setProjectOsJobInApplicationStateCache(queryClient: QueryClient, job?: ProjectOsJob | null) {
  if (!job) {
    return;
  }
  queryClient.setQueryData<ApplicationState | undefined>(applicationStateQueryKey, (current) => setProjectOsJobInState(current, job));
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

export function invalidateAppUpdates(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: appUpdatesQueryKey });
}
