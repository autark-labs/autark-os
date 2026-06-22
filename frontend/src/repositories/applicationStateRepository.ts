import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ApplicationStateAPIClient } from '@/api/ApplicationStateAPIClient';
import { InstalledAppsAPIClient } from '@/api/InstalledAppsAPIClient';
import type { ApplicationState } from '@/types/applicationState';
import {
  accessByAppId,
  appNeedsAttentionFromCanonicalState,
  applicationStateQueryKey,
  applicationStateUpdatedAt,
  displayStatusFromCanonicalState,
  healthByAppId,
  managedRuntimeApps,
  observedServices,
  ownershipViews,
  setObservedServicePinnedInState,
  telemetryByAppId,
  updatesByAppId,
} from './applicationStateRepository.logic';
import type { AppAccessCheck, AppHealthSnapshot, AppRuntimeView, AppTelemetry, AppUpdateStatus } from '@/types/app';
import type { AppOwnershipView } from '@/types/appOwnership';
import type { ObservedServiceView } from '@/types/observedService';

export {
  accessByAppId,
  appNeedsAttentionFromCanonicalState,
  applicationStateQueryKey,
  applicationStateUpdatedAt,
  displayStatusFromCanonicalState,
  healthByAppId,
  managedRuntimeApps,
  observedServices,
  ownershipViews,
  setObservedServicePinnedInState,
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

export function invalidateApplicationState(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: applicationStateQueryKey });
}

export function setObservedServicePinnedInApplicationStateCache(queryClient: QueryClient, serviceId: string, pinned: boolean) {
  queryClient.setQueryData<ApplicationState | undefined>(applicationStateQueryKey, (current) => setObservedServicePinnedInState(current, serviceId, pinned));
}

export function invalidateAppUpdates(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: appUpdatesQueryKey });
}
