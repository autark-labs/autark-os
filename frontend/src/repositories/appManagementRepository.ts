import { useQuery } from '@tanstack/react-query';
import { InstalledAppsAPIClient } from '@/api/InstalledAppsAPIClient';
import type { AppTelemetry } from '@/types/app';

export const appManagementQueryKeys = {
  all: ['app-management'] as const,
  telemetry: (appId: string | null) => ['app-management', 'telemetry', appId] as const,
};

export function useAppTelemetryQuery(appId: string | null, open: boolean, initialData?: AppTelemetry | null) {
  return useQuery<AppTelemetry>({
    queryKey: appManagementQueryKeys.telemetry(appId),
    queryFn: () => InstalledAppsAPIClient.appTelemetry(appId || ''),
    enabled: open && Boolean(appId),
    initialData: initialData ?? undefined,
    refetchInterval: open ? 2_500 : false,
    staleTime: 2_500,
  });
}
