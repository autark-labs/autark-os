import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useBlocker, useLocation, useNavigate } from 'react-router-dom';
import { LayoutGrid, List } from 'lucide-react';
import { BackupAPIClient } from '@/api/BackupAPIClient';
import { InstalledAppsAPIClient } from '@/api/InstalledAppsAPIClient';
import { ApplicationStateContent } from '@/components/autark-os/ApplicationStateNotice';
import { ContextChip } from '@/components/autark-os/ContextChip';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { JobProgress } from '@/components/autark-os/JobProgress';
import { PageShell } from '@/components/layout/PageShell';
import { ExtensionActionTarget } from '@/extensions/ExtensionActionTarget';
import { SearchFilterBar } from '@/components/primitives/SearchFilterBar';
import { MultiSelect } from '@/components/ui/multi-select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { showActionErrorNotification, showActionNotification } from '@/lib/actionNotifications';
import {
  invalidateApplicationState,
  useApplicationStateRepository,
} from '@/repositories/applicationStateRepository';
import { invalidateBackupQueries } from '@/repositories/backupRepository';
import { syncCanonicalAppMutationResult } from '@/repositories/canonicalAppMutationRepository';
import { terminalJob, useAutarkOsJobsQuery } from '@/repositories/jobRepository';
import { invalidateNetworkQueries } from '@/repositories/networkRepository';
import { ApplicationManagementPanel } from './ApplicationManagementPanel';
import { ApplicationReviewDialog } from './ApplicationReviewDialog';
import { BasicApplicationsView } from './BasicApplicationsView';
import { AdvancedApplicationsView } from './AdvancedApplicationsView';
import { AppsPageHeader } from './components/AppsPageHeader';
import { mapUninstallPlanToDestructiveActionPlan } from './extensions/ApplicationsPage.destructiveActions';
import {
  applicationDeepLinkForSurfaceItem,
  filterForApplicationDeepLinkTarget,
  findApplicationDeepLinkTarget,
  parseApplicationsDeepLink,
} from './extensions/ApplicationsPage.deepLinks';
import { buildApplicationSurfaceItems } from './extensions/ApplicationsPage.liveModel';
import type {
  ApplicationRuntimeAction,
  ApplicationSettingsAction,
  ApplicationSettingsFormValues,
  ApplicationSettingsImpact,
  ApplicationSurfaceItem,
} from './extensions/ApplicationsPage.types';
import {
  emptyStateForApplicationCollection,
  matchesCollectionFilters,
  settingsFromFormValues,
  settingsImpactFromPlan,
  type ApplicationCollectionFilter,
} from './extensions/ApplicationsPage.presentation';

type ManagedLifecycleAction = Extract<ApplicationRuntimeAction, 'start' | 'stop' | 'restart'>;
const appLayoutStorageKey = 'autark-os.appsLayout';

export const ApplicationsPage = () => {
  const [layout, setLayout] = useState<'grid' | 'list'>(() => window.localStorage.getItem(appLayoutStorageKey) === 'list' ? 'list' : 'grid');
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const appState = useApplicationStateRepository();
  const jobsQuery = useAutarkOsJobsQuery();
  const [query, setQuery] = useState('');
  const [collectionFilters, setCollectionFilters] = useState<ApplicationCollectionFilter[]>([]);
  const [actionLoadingByAppId, setActionLoadingByAppId] = useState<Record<string, ApplicationRuntimeAction | null>>({});
  const [settingsLoadingByAppId, setSettingsLoadingByAppId] = useState<Record<string, ApplicationSettingsAction | null>>({});
  const [settingsDirtyByAppId, setSettingsDirtyByAppId] = useState<Record<string, boolean>>({});
  const [trackedAppJobIds, setTrackedAppJobIds] = useState<string[]>([]);
  const appliedDeepLinkKeyRef = useRef('');
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const discardFocusRef = useRef<HTMLElement | null>(null);
  const deepLinkTarget = useMemo(() => parseApplicationsDeepLink(location.search), [location.search]);

  const items = useMemo(() => (
    buildApplicationSurfaceItems({
      applications: appState.applications,
    })
  ), [appState.applications]);

  const managedItems = items;
  const reviewApplications = useMemo(
    () => appState.applications
      .filter((application) => application.relationship === 'recovery_required'),
    [appState.applications],
  );
  const installingApplications = appState.applications.filter((app) => app.operation.kind === 'installing' && !app.runtime);
  const reviewAppId = useMemo(() => new URLSearchParams(location.search).get('review'), [location.search]);
  const reviewedApplication = appState.applications.find((application) => (
    application.id === reviewAppId
    && (application.relationship === 'recovery_required' || application.relationship === 'blocked')
  )) ?? null;
  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      if (!matchesCollectionFilters(item, collectionFilters)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [item.name, item.relationship, item.state, item.issues.map((issue) => issue.title).join(' '), item.access, item.backup, item.nextAction?.label ?? '', item.description]
        .some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [collectionFilters, items, query]);

  const selectedItem = findApplicationDeepLinkTarget(items, deepLinkTarget) ?? null;
  const selectedItemIsVisible = Boolean(selectedItem && visibleItems.some((item) => item.id === selectedItem.id));
  const managedCount = managedItems.length;
  const attentionCount = items.filter((item) => item.issues.length > 0 || ['degraded', 'missing', 'unknown'].includes(item.state)).length;
  const emptyState = emptyStateForApplicationCollection(collectionFilters, query);
  const managedAppById = useMemo(() => new Map(appState.applications.flatMap((application) => (
    application.relationship === 'managed' && application.runtime ? [[application.id, application.runtime] as const] : []
  ))), [appState.applications]);
  const selectedHasUnsavedSettings = Boolean(selectedItem && settingsDirtyByAppId[selectedItem.id]);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    const next = parseApplicationsDeepLink(nextLocation.search);
    return selectedHasUnsavedSettings && (currentLocation.pathname !== nextLocation.pathname
      || next.id !== deepLinkTarget.id || next.kind !== deepLinkTarget.kind);
  });

  const focusApplicationItem = useCallback((item: ApplicationSurfaceItem) => {
    navigate(applicationDeepLinkForSurfaceItem(item, { panel: 'manage' }), { replace: true });
  }, [navigate]);

  const handleSelectItem = useCallback((id: string) => {
    const item = visibleItems.find((candidate) => candidate.id === id);
    if (item) {
      focusApplicationItem(item);
    }
  }, [focusApplicationItem, visibleItems]);

  const closeManagement = useCallback(() => {
    navigate('/apps', { replace: true });
  }, [navigate]);

  const handleCollectionFilterChange = useCallback((nextFilters: string[]) => {
    const normalizedFilters = nextFilters.filter((filter): filter is ApplicationCollectionFilter => (
      filter === 'managed' || filter === 'attention'
    ));

    setCollectionFilters(normalizedFilters);
  }, []);

  useEffect(() => {
    if (!deepLinkTarget.kind || !deepLinkTarget.id) {
      appliedDeepLinkKeyRef.current = '';
      return;
    }

    if (!items.length || appliedDeepLinkKeyRef.current === deepLinkTarget.key) {
      return;
    }

    const targetItem = findApplicationDeepLinkTarget(items, deepLinkTarget);
    if (!targetItem) {
      navigate('/apps', { replace: true });
      return;
    }

    setQuery('');
    const requiredFilter = filterForApplicationDeepLinkTarget(targetItem);
    if (requiredFilter === 'managed') {
      setCollectionFilters((current) => current.length === 0 || current.includes(requiredFilter) ? current : [...current, requiredFilter]);
    }
    appliedDeepLinkKeyRef.current = deepLinkTarget.key;
  }, [deepLinkTarget, items, navigate]);

  useEffect(() => {
    if (!trackedAppJobIds.length) {
      return;
    }
    const jobs = jobsQuery.data ?? [];
    const completedJobs = jobs.filter((job) => trackedAppJobIds.includes(job.jobId) && terminalJob(job));
    if (!completedJobs.length) {
      return;
    }
    void invalidateApplicationState(queryClient);
    void invalidateNetworkQueries(queryClient);
    setTrackedAppJobIds((current) => current.filter((jobId) => !completedJobs.some((job) => job.jobId === jobId)));
  }, [jobsQuery.data, queryClient, trackedAppJobIds]);

  const setAppActionLoading = (appId: string, action: ApplicationRuntimeAction | null) => {
    setActionLoadingByAppId((current) => ({ ...current, [appId]: action }));
  };

  const setSettingsLoading = (appId: string, action: ApplicationSettingsAction | null) => {
    setSettingsLoadingByAppId((current) => ({ ...current, [appId]: action }));
  };

  const runManagedAction = async (appId: string, action: ManagedLifecycleAction) => {
    setAppActionLoading(appId, action);

    try {
      const data = await InstalledAppsAPIClient.runAction(appId, action);
      syncCanonicalAppMutationResult(queryClient, data);
      setTrackedAppJobIds((current) => current.includes(data.jobId) ? current : [...current, data.jobId]);
      showActionNotification(data);
    } catch (err) {
      showActionErrorNotification(err, 'App action failed');
    } finally {
      setAppActionLoading(appId, null);
    }
  };

  const runRepair = async (appId: string) => {
    setAppActionLoading(appId, 'repair');

    try {
      const job = await InstalledAppsAPIClient.repair(appId);
      syncCanonicalAppMutationResult(queryClient, job);
      setTrackedAppJobIds((current) => current.includes(job.jobId) ? current : [...current, job.jobId]);
      showActionNotification(job);
    } catch (err) {
      showActionErrorNotification(err, 'Repair could not start');
    } finally {
      setAppActionLoading(appId, null);
    }
  };

  const runBackup = async (appId: string) => {
    setAppActionLoading(appId, 'backup');

    try {
      const job = await BackupAPIClient.run(appId);
      syncCanonicalAppMutationResult(queryClient, job);
      setTrackedAppJobIds((current) => current.includes(job.jobId) ? current : [...current, job.jobId]);
      showActionNotification(job);
      void invalidateBackupQueries(queryClient);
    } catch (err) {
      showActionErrorNotification(err, 'Backup could not start');
    } finally {
      setAppActionLoading(appId, null);
    }
  };

  async function requestSettingsPlan(appId: string, values: ApplicationSettingsFormValues): Promise<ApplicationSettingsImpact | null> {
    const app = managedAppById.get(appId);
    if (!app) {
      return null;
    }

    setSettingsLoading(appId, 'planning');
    try {
      const nextSettings = settingsFromFormValues(app, values);
      const plan = await InstalledAppsAPIClient.settingsChangePlan(appId, nextSettings);
      return settingsImpactFromPlan(plan);
    } finally {
      setSettingsLoading(appId, null);
    }
  }

  async function saveApplicationSettings(appId: string, values: ApplicationSettingsFormValues) {
    const app = managedAppById.get(appId);
    if (!app) {
      return;
    }

    const nextSettings = settingsFromFormValues(app, values);

    setSettingsLoading(appId, 'saving');

    try {
      const plan = await InstalledAppsAPIClient.settingsChangePlan(appId, nextSettings);
      if (plan.saveAllowed === false) {
        throw new Error(plan.blockedReasons[0] || 'Autark-OS cannot safely apply these settings yet.');
      }
      const updatedApp = await InstalledAppsAPIClient.updateSettings(appId, nextSettings);
      syncCanonicalAppMutationResult(queryClient, updatedApp);
      setTrackedAppJobIds((current) => current.includes(updatedApp.jobId) ? current : [...current, updatedApp.jobId]);

      showActionNotification(updatedApp);
      void invalidateNetworkQueries(queryClient);
    } catch (err) {
      void invalidateApplicationState(queryClient);
      showActionErrorNotification(err, 'Settings update failed');
      throw err;
    } finally {
      setSettingsLoading(appId, null);
    }
  }

  async function runPrivateNetworkAccessChange(appId: string, enabled: boolean) {
    setSettingsLoading(appId, 'private_access');

    try {
      const result = enabled
        ? await InstalledAppsAPIClient.enablePrivateAccess(appId)
        : await InstalledAppsAPIClient.disablePrivateAccess(appId);
      syncCanonicalAppMutationResult(queryClient, result);
      showActionNotification(result, enabled ? 'Private network ready' : 'Private network turned off');
      void invalidateNetworkQueries(queryClient);
    } catch (err) {
      showActionErrorNotification(err, enabled ? 'Private network could not be enabled' : 'Private network could not be turned off');
      throw err;
    } finally {
      setSettingsLoading(appId, null);
    }
  }

  const loadUninstallPlan = useCallback(async (appId: string) => {
    const plan = await InstalledAppsAPIClient.uninstallPlan(appId);
    return mapUninstallPlanToDestructiveActionPlan(plan);
  }, []);

  async function runUninstall(appId: string) {
    try {
      const job = await InstalledAppsAPIClient.uninstall(appId);
      syncCanonicalAppMutationResult(queryClient, job);
      setTrackedAppJobIds((current) => current.includes(job.jobId) ? current : [...current, job.jobId]);
      showActionNotification(job);
    } catch (err) {
      showActionErrorNotification(err, 'Uninstall could not start');
      throw err;
    }
  }

  const handleStart = (id: string) => void runManagedAction(id, 'start');
  const handleStop = (id: string) => void runManagedAction(id, 'stop');
  const handleRestart = (id: string) => void runManagedAction(id, 'restart');
  const handleRepair = (id: string) => void runRepair(id);
  const handleDirtyChange = useCallback((id: string, dirty: boolean) => {
    setSettingsDirtyByAppId((current) => current[id] === dirty ? current : { ...current, [id]: dirty });
  }, []);
  const handleCreateBackup = (id: string) => void runBackup(id);

  const actions = {
    onCreateBackup: handleCreateBackup,
    onDirtyChange: handleDirtyChange,
    onLoadUninstallPlan: loadUninstallPlan,
    onRepair: handleRepair,
    onRestart: handleRestart,
    onRunUninstall: runUninstall,
    onSaveSettings: saveApplicationSettings,
    onSettingsPlanRequest: requestSettingsPlan,
    onSetPrivateNetworkAccess: runPrivateNetworkAccessChange,
    onStart: handleStart,
    onStop: handleStop,
  };

  const handleCardAction = (item: ApplicationSurfaceItem, actionId: string) => {
    const id = item.sourceId || item.id;
    if (actionId === 'start') return handleStart(id);
    if (actionId === 'stop') return handleStop(id);
    if (actionId === 'restart') return handleRestart(id);
    if (actionId === 'repair') return handleRepair(id);
    if (actionId === 'backup') return handleCreateBackup(id);
    return undefined;
  };

  return (
    <PageShell
      className="lg:h-[calc(100dvh-7.25rem)] lg:min-h-0"
      contained
      contentClassName="gap-3 lg:h-full lg:min-h-0 lg:!overflow-hidden"
    >
      <ExtensionActionTarget actionId="review-app" routeId="apps">
        <AppsPageHeader attentionCount={appState.freshness.hasUsableData ? attentionCount : null} managedCount={appState.freshness.hasUsableData ? managedCount : null}>
          <ContextChip className="w-44" busy={installingApplications.length > 0} label={!appState.freshness.hasUsableData ? 'App status unavailable' : reviewApplications.length ? `${reviewApplications.length} to recover` : installingApplications.length ? `${installingApplications[0].name} installing` : attentionCount ? `${attentionCount} need review` : 'App status'} title="My Apps / Current status" tone={reviewApplications.length || attentionCount ? 'warning' : 'muted'}>
            {reviewApplications.length > 0 && <p>Review apps from this installation before restoring management.</p>}
            {reviewApplications.map((app) => <Button asChild key={app.id} size="sm" variant="outline"><Link to={app.primaryAction.href || `/apps?review=${encodeURIComponent(app.id)}`}>Review {app.name}</Link></Button>)}
            {installingApplications.map((app) => {
              const job = jobsQuery.data?.find((candidate) => candidate.jobId === app.operation.jobId);
              return job ? <JobProgress compact job={job} key={app.id} subjectLabel={app.name} /> : <p key={app.id}>{app.name}: {app.operation.message || 'Preparing the app. Progress is also available in Activity.'}</p>;
            })}
            {attentionCount > 0 && <Button onClick={() => handleCollectionFilterChange(['attention'])} size="sm" type="button">Show apps needing review</Button>}
            {!appState.freshness.hasUsableData && <p>Waiting for confirmed app information.</p>}
            {appState.freshness.hasUsableData && !reviewApplications.length && !installingApplications.length && !attentionCount && <p>No apps need review.</p>}
          </ContextChip>
        </AppsPageHeader>
      </ExtensionActionTarget>

      <div className="grid gap-3">
        <SearchFilterBar
          className="p-2"
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <ApplicationCollectionFilterDropdown filters={collectionFilters} onChange={handleCollectionFilterChange} />
              <ToggleGroup
                aria-label="App view"
                onValueChange={(value) => {
                  if (value !== 'grid' && value !== 'list') return;
                  setLayout(value);
                  window.localStorage.setItem(appLayoutStorageKey, value);
                }}
                size="sm"
                type="single"
                value={layout}
                variant="outline"
              >
                <ToggleGroupItem aria-label="Grid view" className="border-sky-400/40 bg-slate-800 text-sky-50 data-[state=on]:bg-cyan-300 data-[state=on]:text-slate-950" value="grid">
                  <LayoutGrid className="size-4" />
                </ToggleGroupItem>
                <ToggleGroupItem aria-label="List view" className="border-sky-400/40 bg-slate-800 text-sky-50 data-[state=on]:bg-cyan-300 data-[state=on]:text-slate-950" value="list">
                  <List className="size-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}
          filterAriaLabel="Filter app types"
          onSearchChange={setQuery}
          searchAriaLabel="Search managed apps"
          searchPlaceholder="Search managed apps"
          searchValue={query}
        />
      </div>

      <ApplicationStateContent>
        <section className="grid min-h-0 flex-1 overflow-hidden">
          {layout === 'grid' ? (
            <BasicApplicationsView
              actionLoadingByItemId={actionLoadingByAppId}
              emptyState={emptyState}
              items={visibleItems}
              onAction={handleCardAction}
              onSelect={handleSelectItem}
              selectedId={selectedItemIsVisible ? selectedItem?.id : undefined}
            />
          ) : (
            <div className="min-h-0 overflow-hidden">
              <AdvancedApplicationsView
                actions={actions}
                actionLoadingByItemId={actionLoadingByAppId}
                emptyState={emptyState}
                items={visibleItems}
                onSelect={handleSelectItem}
                selectedId={selectedItemIsVisible ? selectedItem?.id : undefined}
              />
            </div>
          )}

        </section>
        <Dialog open={Boolean(selectedItem)} onOpenChange={(open) => !open && closeManagement()}>
          <DialogContent
            className="flex h-[min(42rem,calc(100dvh-3rem))] w-[calc(100%-3rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
            onOpenAutoFocus={() => { returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              const target = returnFocusRef.current;
              if (target?.isConnected && target !== document.body) target.focus();
              else document.querySelector<HTMLInputElement>('[aria-label="Search managed apps"]')?.focus();
            }}
          >
            {selectedItem && <ApplicationManagementPanel
              key={selectedItem.id}
              actions={actions}
              item={selectedItem}
              loadingAction={actionLoadingByAppId[selectedItem.id]}
              settingsLoadingAction={settingsLoadingByAppId[selectedItem.id]}
              tabValue={deepLinkTarget.tab ?? 'overview'}
              onTabValueChange={(tab) => navigate(applicationDeepLinkForSurfaceItem(selectedItem, { panel: 'manage', tab }), { replace: true })}
            />}
          </DialogContent>
        </Dialog>
      </ApplicationStateContent>

      <AlertDialog open={blocker.state === 'blocked'} onOpenChange={(open) => !open && blocker.state === 'blocked' && blocker.reset()}>
        <AlertDialogContent
          onOpenAutoFocus={() => { discardFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (discardFocusRef.current?.isConnected) discardFocusRef.current.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved app settings?</AlertDialogTitle>
            <AlertDialogDescription>Your changes have not been saved. Keep editing or discard them to continue.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => {
              event.preventDefault();
              if (blocker.state === 'blocked') blocker.proceed();
            }}>Discard changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ApplicationReviewDialog
        application={reviewedApplication}
        onOpenChange={(open) => !open && navigate('/apps', { replace: true })}
        onRefresh={appState.refresh}
        open={Boolean(reviewedApplication)}
      />
    </PageShell>
  );
};

function ApplicationCollectionFilterDropdown({
  filters,
  onChange,
}: {
  filters: ApplicationCollectionFilter[];
  onChange: (filters: string[]) => void;
}) {
  return (
    <MultiSelect
      onValueChange={onChange}
      options={[
        { label: 'Managed apps', value: 'managed' },
        { label: 'Needs attention', value: 'attention' },
      ]}
      placeholder="All app types"
      searchPlaceholder="Filter app types"
      value={filters}
    />
  );
}
