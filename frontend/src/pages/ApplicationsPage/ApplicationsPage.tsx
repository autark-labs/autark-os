import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BackupAPIClient } from '@/api/BackupAPIClient';
import { InstalledAppsAPIClient } from '@/api/InstalledAppsAPIClient';
import { ObservedServicesAPIClient } from '@/api/ObservedServicesAPIClient';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageShell } from '@/components/layout/PageShell';
import { MetricCard } from '@/components/primitives/MetricCard';
import { ProjectDarkControlButton } from '@/components/primitives/ProjectButtons';
import { SearchFilterBar } from '@/components/primitives/SearchFilterBar';
import { Surface } from '@/components/primitives/Surface';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { showActionErrorNotification, showActionNotification } from '@/lib/actionNotifications';
import {
  applicationStateQueryKey,
  invalidateApplicationState,
  setRuntimeAppInApplicationStateCache,
  useApplicationStateRepository,
} from '@/repositories/applicationStateRepository';
import { syncCanonicalAppMutationResult } from '@/repositories/canonicalAppMutationRepository';
import { terminalJob, useAutarkOsJobsQuery } from '@/repositories/jobRepository';
import { invalidateNetworkQueries } from '@/repositories/networkRepository';
import { invalidateBackupQueries } from '@/repositories/backupRepository';
import type { AppRuntimeView, AppSettingsChangePlan, InstallSettings } from '@/types/app';
import type { ApplicationState } from '@/types/applicationState';
import type { ObservedServiceActionResult, ObservedServiceAdoptionPlan } from '@/types/observedService';
import { ApplicationDetailsRail } from './ApplicationDetailsRail';
import { BasicApplicationsView } from './BasicApplicationsView';
import { AdvancedApplicationsView } from './AdvancedApplicationsView';
import { mapUninstallPlanToDestructiveActionPlan } from './extensions/ApplicationsPage.destructiveActions';
import {
  applicationDeepLinkForSurfaceItem,
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

type ManagedLifecycleAction = Exclude<ApplicationRuntimeAction, 'repair' | 'backup'>;

export const ApplicationsPage = () => {
  const { viewMode } = useProjectSettings();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const appState = useApplicationStateRepository();
  const jobsQuery = useAutarkOsJobsQuery();
  const [query, setQuery] = useState('');
  const [managementOpen, setManagementOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [actionLoadingByAppId, setActionLoadingByAppId] = useState<Record<string, ApplicationRuntimeAction | null>>({});
  const [settingsLoadingByAppId, setSettingsLoadingByAppId] = useState<Record<string, ApplicationSettingsAction | null>>({});
  const [settingsDirtyByAppId, setSettingsDirtyByAppId] = useState<Record<string, boolean>>({});
  const [trackedAppJobIds, setTrackedAppJobIds] = useState<string[]>([]);
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
  const foundServices = appState.foundServices;
  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return managedItems.filter((item) => {
      if (!normalizedQuery) {
        return true;
      }

      return [item.name, item.managementState, item.readinessState, item.attentionState, item.access, item.backup, item.nextAction?.label ?? '', item.description]
        .some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [managedItems, query]);

  const selectedItem = managedItems.find((item) => item.id === selectedId) ?? null;
  const selectedItemIsVisible = Boolean(selectedItem && visibleItems.some((item) => item.id === selectedItem.id));
  const managedCount = managedItems.length;
  const attentionCount = managedItems.filter((item) => item.attentionState !== 'none').length;
  const emptyState = emptyStateForManagedApps(query);
  const managedAppById = useMemo(() => new Map(appState.apps.map((app) => [app.appId, app])), [appState.apps]);
  const selectedHasUnsavedSettings = Boolean(selectedItem && settingsDirtyByAppId[selectedItem.id]);
  const canCloseManagement = useCallback(() => !selectedHasUnsavedSettings || window.confirm('Discard unsaved app settings?'), [selectedHasUnsavedSettings]);

  const focusApplicationItem = useCallback((item: ApplicationSurfaceItem, managementOpen = false) => {
    setSelectedId(item.id);
    setManagementOpen(managementOpen);
    navigate(applicationDeepLinkForSurfaceItem(item, { panel: managementOpen ? 'manage' : null }), { replace: true });
  }, [navigate]);

  const handleSelectItem = useCallback((id: string) => {
    const item = managedItems.find((candidate) => candidate.id === id);
    if (item) {
      focusApplicationItem(item);
    }
  }, [focusApplicationItem, managedItems]);

  const clearApplicationFocus = useCallback(() => {
    appliedDeepLinkKeyRef.current = '';
    setSelectedId('');
    setManagementOpen(false);
    navigate('/apps', { replace: true });
  }, [navigate]);

  const handleManagementOpenChange = useCallback((open: boolean) => {
    if (!open) {
      clearApplicationFocus();
      return;
    }
    if (selectedItem) {
      focusApplicationItem(selectedItem, true);
      return;
    }
    setManagementOpen(true);
  }, [clearApplicationFocus, focusApplicationItem, selectedItem]);

  useEffect(() => {
    if (!deepLinkTarget.kind || !deepLinkTarget.id) {
      appliedDeepLinkKeyRef.current = '';
      return;
    }

    if (deepLinkTarget.kind === 'service' || deepLinkTarget.kind === 'catalog') {
      const serviceQuery = deepLinkTarget.kind === 'service' ? `?service=${encodeURIComponent(deepLinkTarget.id)}` : '';
      navigate(`/apps/found${serviceQuery}`, { replace: true });
      return;
    }

    if (!managedItems.length || appliedDeepLinkKeyRef.current === deepLinkTarget.key) {
      return;
    }

    const targetItem = findApplicationDeepLinkTarget(managedItems, deepLinkTarget);
    if (!targetItem || !canCloseManagement()) {
      return;
    }

    setQuery('');
    setSelectedId(targetItem.id);
    setManagementOpen(deepLinkTarget.panel === 'manage');
    appliedDeepLinkKeyRef.current = deepLinkTarget.key;
  }, [canCloseManagement, deepLinkTarget, managedItems, navigate]);

  useEffect(() => {
    if (!selectedId) {
      return;
    }

    if (!managedItems.length) {
      clearApplicationFocus();
      return;
    }

    if (!managedItems.some((item) => item.id === selectedId)) {
      clearApplicationFocus();
    }
  }, [clearApplicationFocus, managedItems, selectedId]);

  useEffect(() => {
    if (!managementOpen) {
      return undefined;
    }

    const ensureRailVisible = () => {
      const rail = railRef.current;
      if (!rail) {
        return;
      }

      const margin = 20;
      const rect = rail.getBoundingClientRect();
      const availableHeight = window.innerHeight - margin * 2;
      let scrollDelta = 0;

      if (rect.height <= availableHeight) {
        if (rect.bottom > window.innerHeight - margin) {
          scrollDelta = rect.bottom - window.innerHeight + margin;
        } else if (rect.top < margin) {
          scrollDelta = rect.top - margin;
        }
      } else if (rect.top > margin || rect.top < margin) {
        scrollDelta = rect.top - margin;
      }

      if (Math.abs(scrollDelta) > 1) {
        window.scrollTo({ behavior: 'smooth', top: window.scrollY + scrollDelta });
      }
    };

    const scrollTimers = [0, 160, 340].map((delay) => window.setTimeout(ensureRailVisible, delay));

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && railRef.current?.contains(target)) {
        return;
      }
      if (target instanceof HTMLElement && target.closest('[data-slot="dialog-content"], [data-slot="dialog-overlay"]')) {
        return;
      }

      if (canCloseManagement()) {
        clearApplicationFocus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      scrollTimers.forEach((timer) => window.clearTimeout(timer));
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [canCloseManagement, clearApplicationFocus, managementOpen]);

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

    if (item?.managementState === 'managed') {
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

  return (
    <PageShell>
      <PageHeader
        description="Open and manage the apps owned by this Autark-OS installation."
        title="My Apps"
      >
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <MetricCard label="Managed" value={managedCount} />
          <MetricCard label="Needs review" tone={attentionCount > 0 ? 'attention' : 'default'} value={attentionCount} />
        </div>
      </PageHeader>

      {foundServices.length > 0 && (
        <Surface className="flex flex-col gap-4 border-orange-400/35 bg-orange-500/10 p-4 sm:flex-row sm:items-center sm:justify-between" tone="panel">
          <div>
            <h2 className="text-sm font-black text-white">Found on this server</h2>
            <p className="mt-1 text-sm leading-6 text-orange-100/80">Autark-OS found {foundServices.length} service{foundServices.length === 1 ? '' : 's'} that this installation does not manage.</p>
          </div>
          <ProjectDarkControlButton asChild className="shrink-0">
            <Link to="/apps/found">Review existing apps</Link>
          </ProjectDarkControlButton>
        </Surface>
      )}

      <div className="grid gap-3">
        <SearchFilterBar
          filterAriaLabel="Managed app filters"
          onSearchChange={setQuery}
          searchAriaLabel="Search managed apps"
          searchPlaceholder="Search managed apps"
          searchValue={query}
        />

        {(appState.isLoading || Boolean(appState.error)) && (
          <Surface className="px-3 py-2 text-sm text-sky-100/80" tone="muted">
            {appState.isLoading ? 'Loading managed apps.' : 'Could not load the current managed apps list.'}
          </Surface>
        )}
      </div>

      <section className="grid min-h-[44rem] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {viewMode === 'basic' ? (
          <BasicApplicationsView
            emptyState={emptyState}
            items={visibleItems}
            managementOpen={managementOpen}
            onSelect={handleSelectItem}
            selectedId={selectedItemIsVisible ? selectedItem?.id : undefined}
          />
        ) : (
          <div className="max-h-[44rem] min-h-[44rem] overflow-y-auto pr-1">
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

function settingsWithDefaults(app: AppRuntimeView): InstallSettings {
  return {
    accessUrl: app.settings?.accessUrl ?? app.accessUrl ?? null,
    autoRepairEnabled: app.settings?.autoRepairEnabled ?? true,
    backup: {
      enabled: app.settings?.backup?.enabled ?? true,
      frequency: app.settings?.backup?.frequency || 'daily',
      retention: app.settings?.backup?.retention ?? 7,
    },
    desiredAccessMode: app.settings?.desiredAccessMode || app.desiredAccess?.mode || 'local',
    expectedLocalPort: app.settings?.expectedLocalPort ?? app.desiredAccess?.expectedLocalPort ?? app.observedAccess?.localPort ?? null,
    expectedProtocol: app.settings?.expectedProtocol ?? app.desiredAccess?.expectedProtocol ?? app.observedAccess?.protocol ?? null,
    lastAccessCheckAt: app.settings?.lastAccessCheckAt ?? app.observedAccess?.lastAccessCheckAt ?? null,
    lastRepairAttemptAt: app.settings?.lastRepairAttemptAt ?? app.observedAccess?.lastRepairAttemptAt ?? null,
    lastRepairStatus: app.settings?.lastRepairStatus ?? app.observedAccess?.lastRepairStatus ?? null,
    lastSuccessfulAccessAt: app.settings?.lastSuccessfulAccessAt ?? app.observedAccess?.lastSuccessfulAccessAt ?? null,
    privateAccessRequirement: app.settings?.privateAccessRequirement || app.desiredAccess?.privateAccessRequirement || 'optional',
    privateAccessUrl: app.settings?.privateAccessUrl ?? app.accessRoute?.privateUrl ?? app.observedAccess?.privateUrl ?? null,
    storageSubfolders: app.settings?.storageSubfolders ?? {},
    tailscaleEnabled: Boolean(app.settings?.tailscaleEnabled),
  };
}

function settingsFromFormValues(app: AppRuntimeView, values: ApplicationSettingsFormValues): InstallSettings {
  const currentSettings = settingsWithDefaults(app);
  const protocol = values.expectedProtocol || currentSettings.expectedProtocol || 'http';
  const accessUrl = accessUrlWithPort(currentSettings.accessUrl ?? app.accessUrl, protocol, values.localPort ?? currentSettings.expectedLocalPort);

  return {
    ...currentSettings,
    autoRepairEnabled: values.autoRepairEnabled,
    accessUrl,
    backup: {
      enabled: values.backupEnabled,
      frequency: values.backupFrequency,
      retention: values.backupRetention,
    },
    expectedLocalPort: values.localPort,
    expectedProtocol: protocol,
  };
}

function settingsImpactFromPlan(plan: AppSettingsChangePlan): ApplicationSettingsImpact {
  return {
    blockedReasons: plan.blockedReasons,
    changes: plan.changes,
    headline: plan.headline,
    redeployRequired: plan.redeployRequired,
    restartRequired: Boolean(plan.restartRequired || plan.redeployRequired),
    saveAllowed: plan.saveAllowed,
    summary: plan.summary || plan.headline,
    warnings: [...plan.warnings, ...plan.blockedReasons],
  };
}

function accessUrlWithPort(currentUrl: string | null | undefined, protocol: string, port: number | null | undefined) {
  if (!port) {
    return currentUrl ?? null;
  }

  try {
    const parsed = new URL(currentUrl || `${protocol}://localhost:${port}`);
    parsed.protocol = `${protocol}:`;
    parsed.port = String(port);
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return `${protocol}://localhost:${port}`;
  }
}

function appActionLabel(action: ApplicationRuntimeAction) {
  if (action === 'start') return 'Start';
  if (action === 'stop') return 'Pause';
  if (action === 'restart') return 'Restart';
  if (action === 'repair') return 'Repair';
  if (action === 'backup') return 'Backup';
  return 'App action';
}

function emptyStateForManagedApps(query: string) {
  if (query.trim()) {
    return {
      title: 'No matching managed apps',
      description: 'Adjust the search or clear it to see the apps managed by this Autark-OS installation.',
    };
  }

  return {
    title: 'No managed apps installed',
    description: 'Install an app from Discover to have Autark-OS manage its runtime, access, and backups.',
  };
}
