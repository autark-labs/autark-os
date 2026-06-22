import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { NetworkAPIClient } from '@/api/NetworkAPIClient';
import type { NetworkDiagnosticsReport, PrivateAccessReconciliationReport, SystemSetupStatus, TailscaleConnectGuide, TailscaleDevice, TailscaleStatus } from '@/types/network';

const liveNetworkQueryOptions = {
  refetchInterval: 10_000,
  staleTime: 10_000,
};

const setupNetworkQueryOptions = {
  refetchInterval: 60_000,
  staleTime: 60_000,
};

export const networkQueryKeys = {
  all: ['network'] as const,
  tailscaleStatus: ['network', 'tailscale-status'] as const,
  tailscaleDevices: ['network', 'tailscale-devices'] as const,
  diagnostics: ['network', 'diagnostics'] as const,
  connectGuide: ['network', 'connect-guide'] as const,
  setupStatus: ['network', 'setup-status'] as const,
  privateAccessReconciliation: ['network', 'private-access-reconciliation'] as const,
};

export const privateAccessReconciliationQueryKey = networkQueryKeys.privateAccessReconciliation;

export type AccessNetworkRepositoryView = {
  diagnostics: NetworkDiagnosticsReport | null;
  error: unknown;
  guide: TailscaleConnectGuide | null;
  isFetching: boolean;
  isLoading: boolean;
  reconciliation: PrivateAccessReconciliationReport | null;
  refresh: () => Promise<void>;
  setupStatus: SystemSetupStatus | null;
  tailnetDevices: TailscaleDevice[];
  tailscale: TailscaleStatus | null;
  updatedAt: Date | null;
};

export function useAccessNetworkRepository(): AccessNetworkRepositoryView {
  const queryClient = useQueryClient();
  const tailscaleQuery = useQuery({
    queryKey: networkQueryKeys.tailscaleStatus,
    queryFn: () => NetworkAPIClient.tailscaleStatus(),
    ...liveNetworkQueryOptions,
  });
  const devicesQuery = useQuery({
    queryKey: networkQueryKeys.tailscaleDevices,
    queryFn: () => NetworkAPIClient.tailscaleDevices(),
    ...liveNetworkQueryOptions,
  });
  const diagnosticsQuery = useQuery({
    queryKey: networkQueryKeys.diagnostics,
    queryFn: () => NetworkAPIClient.diagnostics(),
    ...liveNetworkQueryOptions,
  });
  const guideQuery = useQuery({
    queryKey: networkQueryKeys.connectGuide,
    queryFn: () => NetworkAPIClient.connectGuide(),
    ...setupNetworkQueryOptions,
  });
  const setupQuery = useQuery({
    queryKey: networkQueryKeys.setupStatus,
    queryFn: () => NetworkAPIClient.setupStatus(),
    ...setupNetworkQueryOptions,
  });
  const reconciliationQuery = useQuery({
    queryKey: networkQueryKeys.privateAccessReconciliation,
    queryFn: () => NetworkAPIClient.privateAccessReconciliation(),
    ...liveNetworkQueryOptions,
  });
  const queries = [tailscaleQuery, devicesQuery, diagnosticsQuery, guideQuery, setupQuery, reconciliationQuery];

  return {
    diagnostics: diagnosticsQuery.data ?? null,
    error: queries.find((query) => query.error)?.error ?? null,
    guide: guideQuery.data ?? null,
    isFetching: queries.some((query) => query.isFetching),
    isLoading: queries.some((query) => query.isLoading),
    reconciliation: reconciliationQuery.data ?? null,
    refresh: () => invalidateNetworkQueries(queryClient),
    setupStatus: setupQuery.data ?? null,
    tailnetDevices: devicesQuery.data ?? [],
    tailscale: tailscaleQuery.data ?? null,
    updatedAt: latestUpdatedAt(queries.map((query) => query.dataUpdatedAt)),
  };
}

export function usePrivateAccessReconciliationQuery() {
  return useQuery({
    queryKey: privateAccessReconciliationQueryKey,
    queryFn: () => NetworkAPIClient.privateAccessReconciliation(),
    ...liveNetworkQueryOptions,
  });
}

export function useRemoveStalePrivateAccessMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (port: number) => NetworkAPIClient.removeStalePrivateAccess(port),
    onSuccess: () => invalidateNetworkQueries(queryClient),
  });
}

export function invalidateNetworkQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: networkQueryKeys.all });
}

function latestUpdatedAt(timestamps: number[]) {
  const latest = Math.max(...timestamps);
  return Number.isFinite(latest) && latest > 0 ? new Date(latest) : null;
}
