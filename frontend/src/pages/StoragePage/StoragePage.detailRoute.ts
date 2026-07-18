import type { AppStorageUsage } from '@/types/system';

export type StorageWorkspaceTab = 'overview' | 'apps' | 'backups' | 'cleanup' | 'advanced';

type StorageWorkspaceSelection = {
  appId?: string | null;
  tab?: StorageWorkspaceTab;
};

const workspaceTabs = new Set<StorageWorkspaceTab>(['overview', 'apps', 'backups', 'cleanup', 'advanced']);

export function parseStorageWorkspaceRoute(
  searchParams: URLSearchParams,
  apps: AppStorageUsage[],
  showAdvancedMetrics: boolean,
): Required<StorageWorkspaceSelection> {
  const requestedAppId = searchParams.get('app');
  const appId = requestedAppId && apps.some((app) => app.appId === requestedAppId) ? requestedAppId : null;
  const requestedTab = searchParams.get('tab');
  const tab = requestedTab && workspaceTabs.has(requestedTab as StorageWorkspaceTab)
    ? requestedTab as StorageWorkspaceTab
    : appId
      ? 'apps'
      : 'overview';

  if (tab === 'advanced' && !showAdvancedMetrics) {
    return { appId: null, tab: 'overview' };
  }

  return { appId: tab === 'apps' ? appId : null, tab };
}

export function storageWorkspaceSearchWithSelection(
  searchParams: URLSearchParams,
  { appId = null, tab = 'overview' }: StorageWorkspaceSelection,
) {
  const next = new URLSearchParams(searchParams);
  next.delete('app');
  next.delete('tab');

  if (tab !== 'overview') {
    next.set('tab', tab);
  }
  if (tab === 'apps' && appId) {
    next.set('app', appId);
  }

  return next;
}

export function storageWorkspaceLink(selection: StorageWorkspaceSelection) {
  const search = storageWorkspaceSearchWithSelection(new URLSearchParams(), selection).toString();
  return search ? `/storage?${search}` : '/storage';
}
