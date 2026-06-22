import { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { RefreshStatus } from '@/components/RefreshStatus';
import { PageErrorState, PageLoadingState } from '@/components/project-os/PageState';
import { PageShell } from '@/components/project-os/ProjectOSComponents';
import { Button } from '@/components/ui/button';
import { InstalledAppsAPIClient } from '@/api/InstalledAppsAPIClient';
import {
  applicationStateQueryKey,
  invalidateAppUpdates,
  invalidateApplicationState,
  removeManagedAppFromApplicationStateCache,
  setRuntimeAppInApplicationStateCache,
  setRuntimeAppStatusInApplicationStateCache,
  useAppUpdatesQuery,
  useApplicationStateRepository,
  updatesByAppId as buildUpdatesByAppId,
} from '@/repositories/applicationStateRepository';
import { usePrivateAccessReconciliationQuery } from '@/repositories/networkRepository';
import type { AppActionResult, AppRuntimeView, AppUpdateResult, InstallSettings } from '@/types/app';
import type { ApplicationState } from '@/types/applicationState';
import type { ObservedServiceActionResult, ObservedServiceView } from '@/types/observedService';
import { ApplicationsDashboard, EmptyState } from './ApplicationsDashboard';
import { ManageAppDialog } from './ApplicationsPageModal';
import { ObservedServiceDetailsSheet } from './ObservedServiceDetailsSheet';
import {
  appNeedsAttention,
  appPriority,
  displayStatus,
  errorMessage,
} from './extensions/ApplicationsPage.logic';
import { pinnedExternalViewsFromObservedServices } from './extensions/ApplicationsPage.ownershipModel';
import type { AppAction } from './extensions/ApplicationsPage.types';

function ApplicationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const appState = useApplicationStateRepository();
  const updatesQuery = useAppUpdatesQuery();
  const reconciliationQuery = usePrivateAccessReconciliationQuery();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<AppAction | 'uninstall' | 'update' | 'rollback' | null>(null);
  const [manageAppId, setManageAppId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<AppActionResult | null>(null);
  const [updateResult, setUpdateResult] = useState<AppUpdateResult | null>(null);

  const apps = appState.apps;
  const observedServices = appState.observedServices;
  const telemetryByAppId = appState.telemetryByAppId;
  const accessByAppId = appState.accessByAppId;
  const healthByAppId = appState.healthByAppId;
  const updates = updatesQuery.data ?? [];
  const reconciliation = reconciliationQuery.data ?? null;
  const loading = appState.isLoading;
  const refreshing = appState.isFetching || updatesQuery.isFetching || reconciliationQuery.isFetching;
  const error = localError || (appState.error ? errorMessage(appState.error) : null);
  const managedApp = useMemo(() => apps.find((app) => app.appId === manageAppId) || null, [apps, manageAppId]);
  const managedAppReconciliation = useMemo(() => reconciliation?.apps.find((item) => item.appId === manageAppId) || null, [manageAppId, reconciliation?.apps]);
  const visibleApps = useMemo(() => apps.filter((app) => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return true;
    }
    return [app.appName, app.category, app.description, app.friendlyStatus].some((value) => value?.toLowerCase().includes(query));
  }).sort((left, right) => appPriority(left, telemetryByAppId[left.appId], accessByAppId[left.appId], healthByAppId[left.appId] || left.healthSnapshot) - appPriority(right, telemetryByAppId[right.appId], accessByAppId[right.appId], healthByAppId[right.appId] || right.healthSnapshot) || left.appName.localeCompare(right.appName)), [accessByAppId, apps, healthByAppId, search, telemetryByAppId]);
  const appSummary = useMemo(() => ({
    installed: apps.length,
    running: apps.filter((app) => displayStatus(app, healthByAppId[app.appId] || app.healthSnapshot) === 'Ready').length,
    stopped: apps.filter((app) => displayStatus(app, healthByAppId[app.appId] || app.healthSnapshot) === 'Paused').length,
    unhealthy: apps.filter((app) => appNeedsAttention(app, telemetryByAppId[app.appId], accessByAppId[app.appId], healthByAppId[app.appId] || app.healthSnapshot)).length,
  }), [accessByAppId, apps, healthByAppId, telemetryByAppId]);
  const updatesByAppId = useMemo(() => buildUpdatesByAppId(updates), [updates]);
  const pinnedExternalViews = useMemo(() => pinnedExternalViewsFromObservedServices(observedServices), [observedServices]);
  const selectedServiceId = searchParams.get('service');
  const selectedObservedService = useMemo(() => observedServices.find((service) => service.id === selectedServiceId) || null, [observedServices, selectedServiceId]);

  const refreshApps = useCallback(async () => {
    setLocalError(null);
    await Promise.all([
      appState.refresh(),
      updatesQuery.refetch(),
      reconciliationQuery.refetch(),
    ]);
  }, [appState, reconciliationQuery, updatesQuery]);

  const refreshAfterMutation = useCallback((options: { updates?: boolean } = {}) => {
    void invalidateApplicationState(queryClient);
    void reconciliationQuery.refetch();
    if (options.updates) {
      void invalidateAppUpdates(queryClient);
    }
  }, [queryClient, reconciliationQuery]);

  function restoreApplicationState(previousState: ApplicationState | undefined) {
    queryClient.setQueryData<ApplicationState | undefined>(applicationStateQueryKey, previousState);
  }

  async function runAction(appId: string, action: AppAction) {
    const previousState = queryClient.getQueryData<ApplicationState | undefined>(applicationStateQueryKey);
    setActionLoading(action);
    setLocalError(null);
    setActionResult(null);
    setUpdateResult(null);
    setRuntimeAppStatusInApplicationStateCache(queryClient, appId, optimisticStatusForAction(action));
    try {
      const data = await InstalledAppsAPIClient.runAction(appId, action);
      if (data.app) {
        setRuntimeAppInApplicationStateCache(queryClient, data.app);
      }
      setActionResult(data);
      refreshAfterMutation();
    } catch (err) {
      restoreApplicationState(previousState);
      const message = errorMessage(err);
      setLocalError(message);
      toast.error('App action failed', { description: message, duration: Infinity });
    } finally {
      setActionLoading(null);
    }
  }

  async function uninstall(appId: string) {
    setActionLoading('uninstall');
    setLocalError(null);
    setActionResult(null);
    setUpdateResult(null);
    try {
      const data = await InstalledAppsAPIClient.uninstall(appId);
      removeManagedAppFromApplicationStateCache(queryClient, appId);
      setActionResult(data);
      refreshAfterMutation({ updates: true });
    } catch (err) {
      const message = errorMessage(err);
      setLocalError(message);
      toast.error('Uninstall failed', { description: message, duration: Infinity });
    } finally {
      setActionLoading(null);
    }
  }

  async function updateApp(appId: string) {
    setActionLoading('update');
    setLocalError(null);
    setActionResult(null);
    setUpdateResult(null);
    try {
      const data = await InstalledAppsAPIClient.updateApp(appId);
      setUpdateResult(data);
      refreshAfterMutation({ updates: true });
    } catch (err) {
      const message = errorMessage(err);
      setLocalError(message);
      toast.error('Update failed', { description: message, duration: Infinity });
    } finally {
      setActionLoading(null);
    }
  }

  async function rollbackApp(appId: string) {
    setActionLoading('rollback');
    setLocalError(null);
    setActionResult(null);
    setUpdateResult(null);
    try {
      const data = await InstalledAppsAPIClient.rollbackApp(appId);
      setUpdateResult(data);
      refreshAfterMutation({ updates: true });
    } catch (err) {
      const message = errorMessage(err);
      setLocalError(message);
      toast.error('Rollback failed', { description: message, duration: Infinity });
    } finally {
      setActionLoading(null);
    }
  }

  async function saveSettings(appId: string, settings: InstallSettings) {
    const previousState = queryClient.getQueryData<ApplicationState | undefined>(applicationStateQueryKey);
    const existingApp = appState.apps.find((app) => app.appId === appId);
    setLocalError(null);
    if (existingApp) {
      setRuntimeAppInApplicationStateCache(queryClient, appWithOptimisticSettings(existingApp, settings));
    }
    try {
      const data = await InstalledAppsAPIClient.updateSettings(appId, settings);
      setRuntimeAppInApplicationStateCache(queryClient, data);
      refreshAfterMutation();
      setActionResult({ message: data.appName + ' settings were saved.' });
      return data;
    } catch (err) {
      restoreApplicationState(previousState);
      const message = errorMessage(err);
      setLocalError(message);
      toast.error('Settings were not saved', { description: message, duration: Infinity });
      throw err;
    }
  }

  async function refreshObservedServices() {
    await refreshApps();
  }

  function reviewObservedService(id: string) {
    const next = new URLSearchParams(searchParams);
    next.set('service', id);
    setSearchParams(next);
  }

  function closeObservedServiceSheet() {
    const next = new URLSearchParams(searchParams);
    next.delete('service');
    setSearchParams(next);
  }

  function handleObservedServiceResult(result: ObservedServiceActionResult) {
    setActionResult({ message: result.message || result.title });
  }

  return (
    <PageShell>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold leading-none text-white md:text-3xl">My Apps</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">Open apps, review issues, and manage safe repair actions from one place.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RefreshStatus intervalLabel="Auto-updates every 10s" onRefresh={refreshApps} refreshing={refreshing} updatedAt={appState.updatedAt} />
          <Button asChild className="bg-gradient-to-br from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500">
            <Link to="/discover">Add app</Link>
          </Button>
        </div>
      </div>

      {error && <PageErrorState message={error} onRetry={refreshApps} />}

      {actionResult && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          <CheckCircle2 className="size-4" />
          {actionResult.message}
        </div>
      )}

      {updateResult && (
        <div className="flex items-center gap-3 rounded-lg border border-sky-400/25 bg-sky-500/10 p-4 text-sm text-sky-100">
          <CheckCircle2 className="size-4" />
          {updateResult.message}
        </div>
      )}

      {loading ? (
        <PageLoadingState label="Loading your apps" sublabel="Checking installed apps, health, private access, and available actions." />
      ) : apps.length === 0 && pinnedExternalViews.length === 0 && observedServices.length === 0 ? (
        <EmptyState />
      ) : (
        <ApplicationsDashboard
          accessByAppId={accessByAppId}
          actionLoading={actionLoading}
          apps={visibleApps}
          onAction={runAction}
          onManage={setManageAppId}
          onSearch={setSearch}
          onSelect={(appId) => setSelectedId((current) => current === appId ? null : appId)}
          onUninstall={uninstall}
          onUpdate={updateApp}
          onRollback={rollbackApp}
          search={search}
          selectedId={selectedId}
          summary={appSummary}
          healthByAppId={healthByAppId}
          observedServices={observedServices}
          onReviewService={reviewObservedService}
          pinnedApps={pinnedExternalViews}
          reconciliation={reconciliation}
          telemetryByAppId={telemetryByAppId}
          updatesByAppId={updatesByAppId}
        />
      )}

      {managedApp && (
        <ManageAppDialog
          access={accessByAppId[managedApp.appId]}
          app={managedApp}
          health={healthByAppId[managedApp.appId] || managedApp.healthSnapshot}
          onAction={(action) => runAction(managedApp.appId, action)}
          onOpenChange={(open) => !open && setManageAppId(null)}
          onSave={saveSettings}
          open={Boolean(managedApp)}
          reconciliation={managedAppReconciliation}
        />
      )}
      <ObservedServiceDetailsSheet
        onActionComplete={handleObservedServiceResult}
        onOpenChange={(open) => !open && closeObservedServiceSheet()}
        onRefresh={refreshObservedServices}
        open={Boolean(selectedServiceId)}
        service={selectedObservedService}
      />
    </PageShell>
  );
}

export default ApplicationsPage;

function optimisticStatusForAction(action: AppAction) {
  return action === 'stop' ? 'Paused' : 'Starting';
}

function appWithOptimisticSettings(app: AppRuntimeView, settings: InstallSettings): AppRuntimeView {
  return {
    ...app,
    accessUrl: settings.accessUrl ?? app.accessUrl,
    observedAccess: app.observedAccess ? {
      ...app.observedAccess,
      localUrl: settings.accessUrl ?? app.observedAccess.localUrl,
      privateUrl: settings.privateAccessUrl ?? app.observedAccess.privateUrl,
      privateLinkStatus: settings.tailscaleEnabled ? app.observedAccess.privateLinkStatus : 'not_enabled',
    } : app.observedAccess,
    settings,
  };
}
