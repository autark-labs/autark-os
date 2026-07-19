import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutGrid, List } from 'lucide-react';
import { BackupAPIClient } from '@/api/BackupAPIClient';
import { InstalledAppsAPIClient } from '@/api/InstalledAppsAPIClient';
import { ObservedServicesAPIClient } from '@/api/ObservedServicesAPIClient';
import { FoundAppsPrompt } from '@/components/autark-os/FoundAppsPrompt';
import { PageShell } from '@/components/layout/PageShell';
import { SearchFilterBar } from '@/components/primitives/SearchFilterBar';
import { Surface } from '@/components/primitives/Surface';
import { MultiSelect } from '@/components/ui/multi-select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { showActionErrorNotification, showActionNotification } from '@/lib/actionNotifications';
import {
  applicationStateQueryKey,
  invalidateApplicationState,
  setRuntimeAppInApplicationStateCache,
  useApplicationStateRepository,
} from '@/repositories/applicationStateRepository';
import { invalidateBackupQueries } from '@/repositories/backupRepository';
import { syncCanonicalAppMutationResult } from '@/repositories/canonicalAppMutationRepository';
import { terminalJob, useAutarkOsJobsQuery } from '@/repositories/jobRepository';
import { invalidateNetworkQueries } from '@/repositories/networkRepository';
import type { ApplicationState } from '@/types/applicationState';
import type { ObservedServiceActionResult, ObservedServiceAdoptionPlan } from '@/types/observedService';
import { ApplicationDetailsRail } from './ApplicationDetailsRail';
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
import { operationStateForItem } from './extensions/ApplicationsPage.operations';
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
  appActionLabel,
  settingsFromFormValues,
  settingsImpactFromPlan,
  type ApplicationCollectionFilter,
} from './extensions/ApplicationsPage.presentation';

type ManagedLifecycleAction = Exclude<ApplicationRuntimeAction, 'repair' | 'backup'>;
const foundAppsPromptDismissalKey = 'autark-os.my-apps.found-apps-prompt-dismissed.v1';

function readFoundAppsPromptDismissal() {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    return window.sessionStorage.getItem(foundAppsPromptDismissalKey) || '';
  } catch {
    return '';
  }
}

export const ApplicationsPage = () => {
  const { setViewMode, viewMode } = useProjectSettings();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const appState = useApplicationStateRepository();
  const jobsQuery = useAutarkOsJobsQuery();
  const [query, setQuery] = useState('');
  const [collectionFilters, setCollectionFilters] = useState<ApplicationCollectionFilter[]>([]);
  const [managementOpen, setManagementOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [actionLoadingByAppId, setActionLoadingByAppId] = useState<Record<string, ApplicationRuntimeAction | null>>({});
  const [settingsLoadingByAppId, setSettingsLoadingByAppId] = useState<Record<string, ApplicationSettingsAction | null>>({});
  const [settingsDirtyByAppId, setSettingsDirtyByAppId] = useState<Record<string, boolean>>({});
  const [trackedAppJobIds, setTrackedAppJobIds] = useState<string[]>([]);
  const [dismissedFoundServicesSignature, setDismissedFoundServicesSignature] = useState(readFoundAppsPromptDismissal);
  const appliedDeepLinkKeyRef = useRef('');
  const railRef = useRef<HTMLDivElement | null>(null);
  const deepLinkTarget = useMemo(() => parseApplicationsDeepLink(location.search), [location.search]);

  const items = useMemo(() => {
    const liveItems = buildApplicationSurfaceItems({
      accessByAppId: appState.accessByAppId,
      apps: appState.apps,
      healthByAppId: appState.healthByAppId,
      observedServices: appState.observedServices,
      telemetryByAppId: appState.telemetryByAppId,
    });

    return liveItems.map((item) => {
      const itemId = item.sourceId || item.id;
      const operationState = operationStateForItem(
        item,
        actionLoadingByAppId[itemId] ?? null,
        settingsLoadingByAppId[itemId] ?? null,
        jobsQuery.data ?? [],
      );

      return {
        ...item,
        operationState,
      };
    });
  }, [
    actionLoadingByAppId,
    appState.accessByAppId,
    appState.apps,
    appState.healthByAppId,
    appState.observedServices,
    appState.telemetryByAppId,
    jobsQuery.data,
    settingsLoadingByAppId,
  ]);

  const managedItems = useMemo(() => items.filter((item) => item.managementState === 'managed'), [items]);
  const linkedItems = useMemo(() => items.filter((item) => item.managementState === 'linked'), [items]);
  const foundServices = appState.foundServices;
  const foundServicesSignature = useMemo(
    () => foundServices.map((service) => service.id).sort().join('|'),
    [foundServices],
  );
  const showFoundAppsPrompt = Boolean(foundServicesSignature && dismissedFoundServicesSignature !== foundServicesSignature);
  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      if (item.managementState === 'found') {
        return false;
      }

      if (!matchesCollectionFilters(item, collectionFilters)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [item.name, item.managementState, item.readinessState, item.attentionState, item.access, item.backup, item.nextAction?.label ?? '', item.description]
        .some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [collectionFilters, items, query]);

  const selectedItem = items.find((item) => item.id === selectedId) ?? null;
  const selectedItemIsVisible = Boolean(selectedItem && visibleItems.some((item) => item.id === selectedItem.id));
  const managedCount = managedItems.length;
  const linkedCount = linkedItems.length;
  const attentionCount = items.filter((item) => item.managementState !== 'found' && item.attentionState !== 'none').length;
  const emptyState = emptyStateForApplicationCollection(collectionFilters, query);
  const managedAppById = useMemo(() => new Map(appState.apps.map((app) => [app.appId, app])), [appState.apps]);
  const selectedHasUnsavedSettings = Boolean(selectedItem && settingsDirtyByAppId[selectedItem.id]);
  const canCloseManagement = useCallback(() => !selectedHasUnsavedSettings || window.confirm('Discard unsaved app settings?'), [selectedHasUnsavedSettings]);

  const dismissFoundAppsPrompt = useCallback(() => {
    if (!foundServicesSignature) {
      return;
    }

    setDismissedFoundServicesSignature(foundServicesSignature);
    try {
      window.sessionStorage.setItem(foundAppsPromptDismissalKey, foundServicesSignature);
    } catch {
      // The in-memory state still dismisses the prompt when session storage is unavailable.
    }
  }, [foundServicesSignature]);

  const focusApplicationItem = useCallback((item: ApplicationSurfaceItem, managementOpen = false) => {
    setSelectedId(item.id);
    setManagementOpen(managementOpen);
    navigate(applicationDeepLinkForSurfaceItem(item, { panel: managementOpen ? 'manage' : null }), { replace: true });
  }, [navigate]);

  const handleSelectItem = useCallback((id: string) => {
    const item = visibleItems.find((candidate) => candidate.id === id);
    if (item) {
      focusApplicationItem(item);
    }
  }, [focusApplicationItem, visibleItems]);

  const clearApplicationFocus = useCallback(() => {
    appliedDeepLinkKeyRef.current = '';
    setSelectedId('');
    setManagementOpen(false);
    navigate('/apps', { replace: true });
  }, [navigate]);

  const closeManagement = useCallback(() => {
    setManagementOpen(false);
    if (selectedItem) {
      navigate(applicationDeepLinkForSurfaceItem(selectedItem), { replace: true });
    }
  }, [navigate, selectedItem]);

  const handleManagementOpenChange = useCallback((open: boolean) => {
    if (!open) {
      closeManagement();
      return;
    }
    if (selectedItem) {
      focusApplicationItem(selectedItem, true);
      return;
    }
    setManagementOpen(true);
  }, [closeManagement, focusApplicationItem, selectedItem]);

  const handleCollectionFilterChange = useCallback((nextFilters: string[]) => {
    const normalizedFilters = nextFilters.filter((filter): filter is ApplicationCollectionFilter => (
      filter === 'managed' || filter === 'linked' || filter === 'attention'
    ));

    if (selectedItem && !matchesCollectionFilters(selectedItem, normalizedFilters)) {
      if (!canCloseManagement()) {
        return;
      }
      clearApplicationFocus();
    }

    setCollectionFilters(normalizedFilters);
  }, [canCloseManagement, clearApplicationFocus, selectedItem]);

  useEffect(() => {
    if (!deepLinkTarget.kind || !deepLinkTarget.id) {
      appliedDeepLinkKeyRef.current = '';
      return;
    }

    if (!items.length || appliedDeepLinkKeyRef.current === deepLinkTarget.key) {
      return;
    }

    const targetItem = findApplicationDeepLinkTarget(items, deepLinkTarget);
    if (!targetItem || targetItem.managementState === 'found') {
      const serviceQuery = deepLinkTarget.kind === 'service' ? `?service=${encodeURIComponent(deepLinkTarget.id)}` : '';
      navigate(`/apps/found${serviceQuery}`, { replace: true });
      return;
    }

    if (!canCloseManagement()) {
      return;
    }

    setQuery('');
    const requiredFilter = filterForApplicationDeepLinkTarget(targetItem);
    if (requiredFilter === 'managed' || requiredFilter === 'pinned') {
      const filter = requiredFilter === 'pinned' ? 'linked' : requiredFilter;
      setCollectionFilters((current) => current.length === 0 || current.includes(filter) ? current : [...current, filter]);
    }
    setSelectedId(targetItem.id);
    setManagementOpen(deepLinkTarget.panel === 'manage');
    appliedDeepLinkKeyRef.current = deepLinkTarget.key;
  }, [canCloseManagement, deepLinkTarget, items, navigate]);

  useEffect(() => {
    if (!selectedId) {
      return;
    }

    if (!items.length) {
      clearApplicationFocus();
      return;
    }

    if (!items.some((item) => item.id === selectedId)) {
      clearApplicationFocus();
    }
  }, [clearApplicationFocus, items, selectedId]);

  useEffect(() => {
    if (!managementOpen) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && railRef.current?.contains(target)) {
        return;
      }
      if (target instanceof HTMLElement && target.closest('[data-slot="dialog-content"], [data-slot="dialog-overlay"]')) {
        return;
      }

      if (canCloseManagement()) {
        closeManagement();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [canCloseManagement, closeManagement, managementOpen]);

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
    setTrackedAppJobIds((current) => current.filter((jobId) => !completedJobs.some((job) => job.jobId === jobId)));
  }, [jobsQuery.data, queryClient, trackedAppJobIds]);

  const setAppActionLoading = (appId: string, action: ApplicationRuntimeAction | null) => {
    setActionLoadingByAppId((current) => ({ ...current, [appId]: action }));
  };

  const setSettingsLoading = (appId: string, action: ApplicationSettingsAction | null) => {
    setSettingsLoadingByAppId((current) => ({ ...current, [appId]: action }));
  };

  const restoreApplicationState = (previousState: ApplicationState | undefined) => {
    queryClient.setQueryData<ApplicationState | undefined>(applicationStateQueryKey, previousState);
  };

  const runManagedAction = async (appId: string, action: ManagedLifecycleAction) => {
    setAppActionLoading(appId, action);

    try {
      const data = await InstalledAppsAPIClient.runAction(appId, action);
      syncCanonicalAppMutationResult(queryClient, data);
      setTrackedAppJobIds((current) => current.includes(data.jobId) ? current : [...current, data.jobId]);
      showActionNotification({
        ok: true,
        severity: 'info',
        title: 'App action started',
        message: `${appActionLabel(action)} is running. Autark-OS will keep showing progress until the app reports its real state.`,
      });
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
      showActionNotification({
        ok: true,
        severity: 'info',
        title: 'Repair started',
        message: 'Autark-OS is repairing this app and will keep showing progress until the app reports its real state.',
      });
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
      showActionNotification({
        ok: true,
        severity: 'info',
        title: 'Backup started',
        message: 'Autark-OS is creating a restore point for this app and will keep showing progress here.',
      });
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

    const previousState = queryClient.getQueryData<ApplicationState | undefined>(applicationStateQueryKey);
    const nextSettings = settingsFromFormValues(app, values);

    setSettingsLoading(appId, 'saving');
    setRuntimeAppInApplicationStateCache(queryClient, {
      ...app,
      settings: nextSettings,
    });

    try {
      const plan = await InstalledAppsAPIClient.settingsChangePlan(appId, nextSettings);
      if (plan.saveAllowed === false) {
        throw new Error(plan.blockedReasons[0] || 'Autark-OS cannot safely apply these settings yet.');
      }
      const updatedApp = await InstalledAppsAPIClient.updateSettings(appId, nextSettings);
      syncCanonicalAppMutationResult(queryClient, { app: updatedApp });

      showActionNotification({
        ok: true,
        severity: 'success',
        title: plan.restartRequired || plan.redeployRequired ? 'Settings saved and restart requested' : 'Settings saved',
        message: plan.summary,
      });
      setSettingsDirtyByAppId((current) => ({ ...current, [appId]: false }));
      void invalidateNetworkQueries(queryClient);
    } catch (err) {
      restoreApplicationState(previousState);
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

  async function loadUninstallPlan(appId: string) {
    const plan = await InstalledAppsAPIClient.uninstallPlan(appId);
    return mapUninstallPlanToDestructiveActionPlan(plan);
  }

  async function runUninstall(appId: string) {
    try {
      const job = await InstalledAppsAPIClient.uninstall(appId);
      syncCanonicalAppMutationResult(queryClient, job);
      setTrackedAppJobIds((current) => current.includes(job.jobId) ? current : [...current, job.jobId]);
      showActionNotification({
        ok: true,
        severity: 'info',
        title: 'Uninstall started',
        message: 'Autark-OS is removing this app safely and keeping it visible until the job finishes.',
      });
    } catch (err) {
      showActionErrorNotification(err, 'Uninstall could not start');
      throw err;
    }
  }

  async function pinObservedService(serviceId: string) {
    try {
      const result = await ObservedServicesAPIClient.pin(serviceId);
      syncCanonicalAppMutationResult(queryClient, result);
      showActionNotification(result, result.title || 'Service pinned');
    } catch (err) {
      showActionErrorNotification(err, 'Service could not be pinned');
      throw err;
    }
  }

  async function unpinObservedService(serviceId: string) {
    try {
      const result = await ObservedServicesAPIClient.unpin(serviceId);
      syncCanonicalAppMutationResult(queryClient, result);
      showActionNotification(result, result.title || 'Service unpinned');
    } catch (err) {
      showActionErrorNotification(err, 'Service could not be unpinned');
      throw err;
    }
  }

  async function matchObservedService(serviceId: string, catalogAppId: string | null) {
    try {
      const result = await ObservedServicesAPIClient.match(serviceId, catalogAppId);
      handleObservedServiceActionResult(result, result.title || 'Service match saved');
    } catch (err) {
      showActionErrorNotification(err, 'Service match could not be saved');
      throw err;
    }
  }

  async function loadObservedServiceAdoptionPlan(serviceId: string): Promise<ObservedServiceAdoptionPlan> {
    return ObservedServicesAPIClient.adoptionPlan(serviceId);
  }

  async function adoptObservedService(serviceId: string, confirmation: string) {
    try {
      const result = await ObservedServicesAPIClient.adopt(serviceId, confirmation);
      handleObservedServiceActionResult(result, result.title || 'Service adopted');
    } catch (err) {
      showActionErrorNotification(err, 'Service could not be adopted');
      throw err;
    }
  }

  function handleObservedServiceActionResult(result: ObservedServiceActionResult, fallbackTitle: string) {
    syncCanonicalAppMutationResult(queryClient, result);
    showActionNotification(result, fallbackTitle);
  }

  const handleStart = (id: string) => void runManagedAction(id, 'start');
  const handleStop = (id: string) => void runManagedAction(id, 'stop');
  const handleRestart = (id: string) => void runManagedAction(id, 'restart');
  const handleRepair = (id: string) => void runRepair(id);
  const handleDirtyChange = (id: string, dirty: boolean) => setSettingsDirtyByAppId((current) => ({ ...current, [id]: dirty }));
  const handleCreateBackup = (id: string) => void runBackup(id);

  const handleRunNextAction = (id: string) => {
    const item = items.find((candidate) => candidate.id === id);
    if (item?.managementState === 'managed' && item.nextAction?.id === 'start_app') {
      void runManagedAction(item.sourceId || item.id, 'start');
      return;
    }
    if (item?.managementState === 'managed' && item.nextAction?.id === 'create_backup') {
      void runBackup(item.sourceId || item.id);
      return;
    }

    if (item && item.managementState !== 'found') {
      focusApplicationItem(item, true);
    }
    void invalidateApplicationState(queryClient);
  };

  const actions = {
    onCreateBackup: handleCreateBackup,
    onAdoptObservedService: adoptObservedService,
    onDirtyChange: handleDirtyChange,
    onLoadObservedServiceAdoptionPlan: loadObservedServiceAdoptionPlan,
    onLoadUninstallPlan: loadUninstallPlan,
    onMatchObservedService: matchObservedService,
    onPinObservedService: pinObservedService,
    onRepair: handleRepair,
    onRestart: handleRestart,
    onRunNextAction: handleRunNextAction,
    onRunUninstall: runUninstall,
    onSaveSettings: saveApplicationSettings,
    onSettingsPlanRequest: requestSettingsPlan,
    onSetPrivateNetworkAccess: runPrivateNetworkAccessChange,
    onStart: handleStart,
    onStop: handleStop,
    onUnpinObservedService: unpinObservedService,
  };

  const handleCardAction = (item: ApplicationSurfaceItem, actionId: string) => {
    const id = item.sourceId || item.id;
    if (actionId === 'start') return handleStart(id);
    if (actionId === 'stop') return handleStop(id);
    if (actionId === 'restart') return handleRestart(id);
    if (actionId === 'repair') return handleRepair(id);
    if (actionId === 'backup') return handleCreateBackup(id);
    if (actionId === 'pin') return void pinObservedService(id);
    if (actionId === 'unpin') return void unpinObservedService(id);
    return undefined;
  };

  return (
    <PageShell
      className="lg:h-[calc(100dvh-7.25rem)] lg:min-h-0"
      contained
      contentClassName="gap-3 lg:h-full lg:min-h-0 lg:!overflow-hidden"
    >
      <AppsPageHeader attentionCount={attentionCount} linkedCount={linkedCount} managedCount={managedCount} />

      {showFoundAppsPrompt && (
        <FoundAppsPrompt className="gap-2 p-3" model={{ count: foundServices.length, reviewHref: '/apps/found' }} onDismiss={dismissFoundAppsPrompt} />
      )}

      <div className="grid gap-3">
        <SearchFilterBar
          className="p-2"
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <ApplicationCollectionFilterDropdown filters={collectionFilters} onChange={handleCollectionFilterChange} />
              <ToggleGroup
                aria-label="App view"
                onValueChange={(value) => {
                  if (value === 'basic' || value === 'advanced') setViewMode(value);
                }}
                size="sm"
                type="single"
                value={viewMode}
                variant="outline"
              >
                <ToggleGroupItem aria-label="Grid view" className="border-sky-400/40 bg-slate-800 text-sky-50 data-[state=on]:bg-cyan-300 data-[state=on]:text-slate-950" value="basic">
                  <LayoutGrid className="size-4" />
                </ToggleGroupItem>
                <ToggleGroupItem aria-label="List view" className="border-sky-400/40 bg-slate-800 text-sky-50 data-[state=on]:bg-cyan-300 data-[state=on]:text-slate-950" value="advanced">
                  <List className="size-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}
          filterAriaLabel="Filter app types"
          onSearchChange={setQuery}
          searchAriaLabel="Search managed and linked apps"
          searchPlaceholder="Search managed and linked apps"
          searchValue={query}
        />

        {(appState.isLoading || Boolean(appState.error)) && (
          <Surface className="px-3 py-2 text-sm text-sky-100/80" tone="muted">
            {appState.isLoading ? 'Loading managed and linked apps.' : 'Could not load the current app list.'}
          </Surface>
        )}
      </div>

      <section className="grid min-h-0 flex-1 items-stretch gap-3 overflow-hidden lg:grid-cols-[minmax(0,1fr)_19rem] 2xl:grid-cols-[minmax(0,1fr)_22rem]">
        {viewMode === 'basic' ? (
          <BasicApplicationsView
            actionLoadingByItemId={actionLoadingByAppId}
            emptyState={emptyState}
            items={visibleItems}
            managementOpen={managementOpen}
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
              managementOpen={managementOpen}
              onSelect={handleSelectItem}
              selectedId={selectedItemIsVisible ? selectedItem?.id : undefined}
            />
          </div>
        )}

        <ApplicationDetailsRail
          actions={actions}
          actionLoadingByItemId={actionLoadingByAppId}
          item={selectedItem}
          managementOpen={managementOpen}
          canCloseManagement={canCloseManagement}
          onManagementOpenChange={handleManagementOpenChange}
          settingsLoadingByItemId={settingsLoadingByAppId}
          ref={railRef}
        />
      </section>
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
        { label: 'Linked services', value: 'linked' },
        { label: 'Needs attention', value: 'attention' },
      ]}
      placeholder="All app types"
      searchPlaceholder="Filter app types"
      value={filters}
    />
  );
}
