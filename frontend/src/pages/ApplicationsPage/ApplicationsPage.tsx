import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshStatus } from '@/components/RefreshStatus';
import { CanonicalRecommendedAction } from '@/components/project-os/CanonicalRecommendedAction';
import { PageErrorState, PageLoadingState } from '@/components/project-os/PageState';
import { PageShell } from '@/components/project-os/ProjectOSComponents';
import { Button } from '@/components/ui/button';
import { InstalledAppsAPIClient } from '@/api/InstalledAppsAPIClient';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { showActionErrorNotification, showActionNotification, showJobNotification } from '@/lib/actionNotifications';
import {
  invalidateAppUpdates,
  invalidateApplicationState,
  useAppUpdatesQuery,
  useApplicationStateRepository,
  updatesByAppId as buildUpdatesByAppId,
} from '@/repositories/applicationStateRepository';
import { setProjectOsJobCache, terminalJob, useProjectOsJobsQuery } from '@/repositories/jobRepository';
import { usePrivateAccessReconciliationQuery } from '@/repositories/networkRepository';
import type { AppRuntimeView } from '@/types/app';
import type { ProjectOsJob } from '@/types/jobs';
import type { ObservedServiceActionResult, ObservedServiceView } from '@/types/observedService';
import { ApplicationsDashboard, EmptyState } from './ApplicationsDashboard';
import { AppManagementSheet } from './ApplicationsPageDrawer';
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
  const { showAdvancedMetrics } = useProjectSettings();
  const updatesQuery = useAppUpdatesQuery();
  const reconciliationQuery = usePrivateAccessReconciliationQuery();
  const jobsQuery = useProjectOsJobsQuery();
  const [actionLoadingByAppId, setActionLoadingByAppId] = useState<Record<string, AppAction | 'update' | 'rollback' | null>>({});
  const [manageAppId, setManageAppId] = useState<string | null>(null);
  const [locallyUninstallingAppIds, setLocallyUninstallingAppIds] = useState<Set<string>>(() => new Set());
  const [trackedUninstallJobIds, setTrackedUninstallJobIds] = useState<string[]>([]);
  const [trackedLifecycleJobIds, setTrackedLifecycleJobIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

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
  const activeUninstallJobs = useMemo(() => (jobsQuery.data ?? []).filter((job) => job.type === 'uninstall_app' && !terminalJob(job)), [jobsQuery.data]);
  
  const uninstallJobsByAppId = useMemo(() => {
    const jobs = new Map<string, ProjectOsJob>();
    for (const job of activeUninstallJobs) {
      if (job.subjectId) {
        jobs.set(job.subjectId, job);
      }
    }
    return jobs;
  }, [activeUninstallJobs]);

  const uninstallingAppIds = useMemo(() => {
    const ids = new Set(locallyUninstallingAppIds);
    for (const job of activeUninstallJobs) {
      if (job.subjectId) {
        ids.add(job.subjectId);
      }
    }
    return ids;
  }, [activeUninstallJobs, locallyUninstallingAppIds]);

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

  useEffect(() => {
    setLocallyUninstallingAppIds((current) => {
      const next = new Set([...current].filter((appId) => apps.some((app) => app.appId === appId)));
      return next.size === current.size ? current : next;
    });
  }, [apps]);

  useEffect(() => {
    if (!trackedUninstallJobIds.length) {
      return;
    }
    const jobs = jobsQuery.data ?? [];
    const completedJobs = jobs.filter((job) => trackedUninstallJobIds.includes(job.jobId) && terminalJob(job));
    if (!completedJobs.length) {
      return;
    }

    for (const job of completedJobs) {
      showJobNotification(job);
      if (job.status === 'failed') {
        const message = job.error?.message || 'Project OS could not uninstall this app. The app is still visible.';
        setLocalError(message);
        if (job.subjectId) {
          setLocallyUninstallingAppIds((current) => {
            const next = new Set(current);
            next.delete(job.subjectId || '');
            return next;
          });
        }
      } else if (job.status === 'succeeded') {
        void invalidateApplicationState(queryClient);
        void invalidateAppUpdates(queryClient);
      }
    }
    setTrackedUninstallJobIds((current) => current.filter((jobId) => !completedJobs.some((job) => job.jobId === jobId)));
  }, [jobsQuery.data, queryClient, trackedUninstallJobIds]);

  useEffect(() => {
    if (!trackedLifecycleJobIds.length) {
      return;
    }
    const jobs = jobsQuery.data ?? [];
    const completedJobs = jobs.filter((job) => trackedLifecycleJobIds.includes(job.jobId) && terminalJob(job));
    if (!completedJobs.length) {
      return;
    }
    void invalidateApplicationState(queryClient);
    setTrackedLifecycleJobIds((current) => current.filter((jobId) => !completedJobs.some((job) => job.jobId === jobId)));
  }, [jobsQuery.data, queryClient, trackedLifecycleJobIds]);

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

  function setAppActionLoading(appId: string, action: AppAction | 'update' | 'rollback' | null) {
    setActionLoadingByAppId((current) => ({ ...current, [appId]: action }));
  }

  async function runAction(appId: string, action: AppAction) {
    setAppActionLoading(appId, action);
    setLocalError(null);
    try {
      if (action === 'repair') {
        const result = await InstalledAppsAPIClient.repair(appId);
        showActionNotification(result, 'Repair finished');
        refreshAfterMutation();
        return;
      }

      const job = await InstalledAppsAPIClient.runAction(appId, action);
      setProjectOsJobCache(queryClient, job);
      setTrackedLifecycleJobIds((current) => current.includes(job.jobId) ? current : [...current, job.jobId]);
      showActionNotification({
        ok: true,
        severity: 'info',
        title: 'App action started',
        message: `${appActionLabel(action)} is running. Project OS will update the app state when the app reports its real status.`,
      });
      void jobsQuery.refetch();
      refreshAfterMutation();
    } catch (err) {
      const message = errorMessage(err);
      setLocalError(message);
      showActionErrorNotification(err, 'App action failed');
    } finally {
      setAppActionLoading(appId, null);
    }
  }

  async function uninstall(appId: string) {
    setLocalError(null);
    setLocallyUninstallingAppIds((current) => new Set(current).add(appId));
    try {
      const job = await InstalledAppsAPIClient.uninstall(appId);
      setProjectOsJobCache(queryClient, job);
      setTrackedUninstallJobIds((current) => current.includes(job.jobId) ? current : [...current, job.jobId]);
      showJobNotification(job);
      void jobsQuery.refetch();
    } catch (err) {
      const message = errorMessage(err);
      setLocalError(message);
      setLocallyUninstallingAppIds((current) => {
        const next = new Set(current);
        next.delete(appId);
        return next;
      });
      showActionErrorNotification(err, 'Uninstall failed');
    }
  }

  async function updateApp(appId: string) {
    setAppActionLoading(appId, 'update');
    setLocalError(null);
    try {
      const data = await InstalledAppsAPIClient.updateApp(appId);
      showActionNotification({ ok: true, severity: 'success', title: 'App updated', message: data.message }, 'App updated');
      refreshAfterMutation({ updates: true });
    } catch (err) {
      const message = errorMessage(err);
      setLocalError(message);
      showActionErrorNotification(err, 'Update failed');
    } finally {
      setAppActionLoading(appId, null);
    }
  }

  async function rollbackApp(appId: string) {
    setAppActionLoading(appId, 'rollback');
    setLocalError(null);
    try {
      const data = await InstalledAppsAPIClient.rollbackApp(appId);
      showActionNotification({ ok: true, severity: 'success', title: 'Rollback completed', message: data.message }, 'Rollback completed');
      refreshAfterMutation({ updates: true });
    } catch (err) {
      const message = errorMessage(err);
      setLocalError(message);
      showActionErrorNotification(err, 'Rollback failed');
    } finally {
      setAppActionLoading(appId, null);
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
    showActionNotification(result, result.title || 'Service action finished');
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

      <CanonicalRecommendedAction />

      {error && <PageErrorState message={error} onRetry={refreshApps} />}

      {loading ? (
        <PageLoadingState label="Loading your apps" sublabel="Checking installed apps, health, private access, and available actions." />
      ) : apps.length === 0 && pinnedExternalViews.length === 0 && observedServices.length === 0 ? (
        <EmptyState />
      ) : (
        <ApplicationsDashboard
          accessByAppId={accessByAppId}
          actionLoadingByAppId={actionLoadingByAppId}
          apps={visibleApps}
          onAction={runAction}
          onManage={setManageAppId}
          onSearch={setSearch}
          onUpdate={updateApp}
          search={search}
          summary={appSummary}
          healthByAppId={healthByAppId}
          observedServices={observedServices}
          onReviewService={reviewObservedService}
          pinnedApps={pinnedExternalViews}
          reconciliation={reconciliation}
          telemetryByAppId={telemetryByAppId}
          uninstallingAppIds={uninstallingAppIds}
          updatesByAppId={updatesByAppId}
        />
      )}

      {managedApp && (
        <AppManagementSheet
          access={accessByAppId[managedApp.appId]}
          actionLoading={actionLoadingByAppId[managedApp.appId]}
          app={managedApp}
          health={healthByAppId[managedApp.appId] || managedApp.healthSnapshot}
          onAction={runAction}
          onOpenChange={(open) => !open && setManageAppId(null)}
          onRollback={rollbackApp}
          onUninstall={uninstall}
          onUpdate={updateApp}
          open={Boolean(managedApp)}
          reconciliation={managedAppReconciliation}
          showAdvanced={showAdvancedMetrics}
          telemetry={telemetryByAppId[managedApp.appId] || managedApp.telemetry}
          uninstallJob={uninstallJobsByAppId.get(managedApp.appId) || null}
          update={updatesByAppId[managedApp.appId] || null}
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

function appActionLabel(action: AppAction) {
  if (action === 'start') return 'Start';
  if (action === 'stop') return 'Pause';
  if (action === 'restart') return 'Restart';
  if (action === 'repair') return 'Repair';
  return 'App action';
}
