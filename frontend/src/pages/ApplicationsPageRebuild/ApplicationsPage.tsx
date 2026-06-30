import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Search } from 'lucide-react';
import { InstalledAppsAPIClient } from '@/api/InstalledAppsAPIClient';
import { ObservedServicesAPIClient } from '@/api/ObservedServicesAPIClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { showActionErrorNotification, showActionNotification } from '@/lib/actionNotifications';
import {
  applicationStateQueryKey,
  invalidateApplicationState,
  setApplicationStateFromActionResultCache,
  setProjectOsJobInApplicationStateCache,
  setRuntimeAppInApplicationStateCache,
  useApplicationStateRepository,
} from '@/repositories/applicationStateRepository';
import { invalidateProjectOsJobs, setProjectOsJobCache, terminalJob, useProjectOsJobsQuery } from '@/repositories/jobRepository';
import { invalidateNetworkQueries } from '@/repositories/networkRepository';
import type { AppRuntimeView, AppSettingsChangePlan, InstallSettings } from '@/types/app';
import type { ApplicationState } from '@/types/applicationState';
import { ApplicationDetailsRail } from './ApplicationDetailsRail';
import { BasicApplicationsView } from './BasicApplicationsView';
import { AdvancedApplicationsView } from './AdvancedApplicationsView';
import { mapUninstallPlanToDestructiveActionPlan } from './extensions/ApplicationsPage.destructiveActions';
import { buildApplicationSurfaceItems } from './extensions/ApplicationsPage.liveModel';
import { operationStateForItem } from './extensions/ApplicationsPage.operations';
import type {
  ApplicationRuntimeAction,
  ApplicationSettingsAction,
  ApplicationSettingsFormValues,
  ApplicationSettingsImpact,
} from './extensions/ApplicationsPage.types';

type ApplicationFilter = 'all' | 'managed' | 'pinned' | 'found' | 'needs_review';

export const ApplicationsPage = () => {
  const { viewMode } = useProjectSettings();
  const queryClient = useQueryClient();
  const appState = useApplicationStateRepository();
  const jobsQuery = useProjectOsJobsQuery();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ApplicationFilter>('all');
  const [managementOpen, setManagementOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [actionLoadingByAppId, setActionLoadingByAppId] = useState<Record<string, ApplicationRuntimeAction | null>>({});
  const [settingsLoadingByAppId, setSettingsLoadingByAppId] = useState<Record<string, ApplicationSettingsAction | null>>({});
  const [settingsDirtyByAppId, setSettingsDirtyByAppId] = useState<Record<string, boolean>>({});
  const [trackedAppJobIds, setTrackedAppJobIds] = useState<string[]>([]);
  const railRef = useRef<HTMLDivElement | null>(null);

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

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesFilter =
        filter === 'all'
        || (filter === 'managed' && item.managementState === 'managed')
        || (filter === 'pinned' && item.managementState === 'linked')
        || (filter === 'found' && item.managementState === 'found')
        || (filter === 'needs_review' && item.attentionState !== 'none');

      if (!matchesFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [item.name, item.managementState, item.readinessState, item.attentionState, item.access, item.backup, item.nextAction?.label ?? '', item.description]
        .some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [filter, items, query]);

  const selectedItem = items.find((item) => item.id === selectedId) ?? null;
  const selectedItemIsVisible = Boolean(selectedItem && visibleItems.some((item) => item.id === selectedItem.id));
  const managedCount = items.filter((item) => item.managementState === 'managed').length;
  const pinnedCount = items.filter((item) => item.managementState === 'linked').length;
  const attentionCount = items.filter((item) => item.attentionState !== 'none').length;
  const nextReviewItem = visibleItems.find((item) => item.nextAction) ?? items.find((item) => item.nextAction) ?? null;
  const managedAppById = useMemo(() => new Map(appState.apps.map((app) => [app.appId, app])), [appState.apps]);
  const selectedHasUnsavedSettings = Boolean(selectedItem && settingsDirtyByAppId[selectedItem.id]);
  const canCloseManagement = useCallback(() => !selectedHasUnsavedSettings || window.confirm('Discard unsaved app settings?'), [selectedHasUnsavedSettings]);

  useEffect(() => {
    if (!items.length) {
      if (selectedId) {
        setSelectedId('');
      }
      return;
    }

    if (!items.some((item) => item.id === selectedId)) {
      setSelectedId('');
    }
  }, [items, selectedId]);

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

      if (canCloseManagement()) {
        setManagementOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      scrollTimers.forEach((timer) => window.clearTimeout(timer));
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [canCloseManagement, managementOpen]);

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

  const handleFilterChange = (nextFilter: string) => {
    if (!nextFilter || nextFilter === filter) {
      return;
    }

    setFilter(nextFilter as ApplicationFilter);
  };

  const setAppActionLoading = (appId: string, action: ApplicationRuntimeAction | null) => {
    setActionLoadingByAppId((current) => ({ ...current, [appId]: action }));
  };

  const setSettingsLoading = (appId: string, action: ApplicationSettingsAction | null) => {
    setSettingsLoadingByAppId((current) => ({ ...current, [appId]: action }));
  };

  const restoreApplicationState = (previousState: ApplicationState | undefined) => {
    queryClient.setQueryData<ApplicationState | undefined>(applicationStateQueryKey, previousState);
  };

  const runManagedAction = async (appId: string, action: ApplicationRuntimeAction) => {
    setAppActionLoading(appId, action);

    try {
      const data = await InstalledAppsAPIClient.runAction(appId, action);
      setProjectOsJobCache(queryClient, data);
      setProjectOsJobInApplicationStateCache(queryClient, data);
      setTrackedAppJobIds((current) => current.includes(data.jobId) ? current : [...current, data.jobId]);
      showActionNotification({
        ok: true,
        severity: 'info',
        title: 'App action started',
        message: `${appActionLabel(action)} is running. Project OS will keep showing progress until the app reports its real state.`,
      });
      void invalidateProjectOsJobs(queryClient);
      void invalidateApplicationState(queryClient);
    } catch (err) {
      showActionErrorNotification(err, 'App action failed');
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
    const privateAccessChanged = values.tailscaleEnabled !== app.settings?.tailscaleEnabled;

    setSettingsLoading(appId, 'saving');
    setRuntimeAppInApplicationStateCache(queryClient, {
      ...appWithOptimisticPrivateAccess(app, values.tailscaleEnabled),
      settings: nextSettings,
    });

    try {
      const plan = await InstalledAppsAPIClient.settingsChangePlan(appId, nextSettings);
      if (plan.saveAllowed === false) {
        throw new Error(plan.blockedReasons[0] || 'Project OS cannot safely apply these settings yet.');
      }
      const updatedApp = await InstalledAppsAPIClient.updateSettings(appId, nextSettings);
      setRuntimeAppInApplicationStateCache(queryClient, updatedApp);

      if (privateAccessChanged) {
        const result = values.tailscaleEnabled
          ? await InstalledAppsAPIClient.repairPrivateAccess(appId)
          : await InstalledAppsAPIClient.disablePrivateAccess(appId);
        if (result.app) {
          setRuntimeAppInApplicationStateCache(queryClient, result.app);
        }
        showActionNotification(result, values.tailscaleEnabled ? 'Private access ready' : 'Private access turned off');
      }

      showActionNotification({
        ok: true,
        severity: 'success',
        title: plan.restartRequired || plan.redeployRequired ? 'Settings saved and restart requested' : 'Settings saved',
        message: plan.summary,
      });
      setSettingsDirtyByAppId((current) => ({ ...current, [appId]: false }));
      void invalidateApplicationState(queryClient);
      void invalidateNetworkQueries(queryClient);
    } catch (err) {
      restoreApplicationState(previousState);
      showActionErrorNotification(err, 'Settings update failed');
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
      setProjectOsJobCache(queryClient, job);
      setProjectOsJobInApplicationStateCache(queryClient, job);
      setTrackedAppJobIds((current) => current.includes(job.jobId) ? current : [...current, job.jobId]);
      showActionNotification({
        ok: true,
        severity: 'info',
        title: 'Uninstall started',
        message: 'Project OS is removing this app safely and keeping it visible until the job finishes.',
      });
      void invalidateProjectOsJobs(queryClient);
      void invalidateApplicationState(queryClient);
    } catch (err) {
      showActionErrorNotification(err, 'Uninstall could not start');
      throw err;
    }
  }

  async function pinObservedService(serviceId: string) {
    try {
      const result = await ObservedServicesAPIClient.pin(serviceId);
      const stateUpdated = setApplicationStateFromActionResultCache(queryClient, result);
      showActionNotification(result, result.title || 'Service pinned');
      if (!stateUpdated) {
        void invalidateApplicationState(queryClient);
      }
    } catch (err) {
      showActionErrorNotification(err, 'Service could not be pinned');
      throw err;
    }
  }

  async function unpinObservedService(serviceId: string) {
    try {
      const result = await ObservedServicesAPIClient.unpin(serviceId);
      const stateUpdated = setApplicationStateFromActionResultCache(queryClient, result);
      showActionNotification(result, result.title || 'Service unpinned');
      if (!stateUpdated) {
        void invalidateApplicationState(queryClient);
      }
    } catch (err) {
      showActionErrorNotification(err, 'Service could not be unpinned');
      throw err;
    }
  }

  const handleStart = (id: string) => void runManagedAction(id, 'start');
  const handleStop = (id: string) => void runManagedAction(id, 'stop');
  const handleRestart = (id: string) => void runManagedAction(id, 'restart');
  const handleDirtyChange = (id: string, dirty: boolean) => setSettingsDirtyByAppId((current) => ({ ...current, [id]: dirty }));
  const handleCreateBackup = (id: string) => {
    setSelectedId(id);
    setManagementOpen(true);
    void invalidateApplicationState(queryClient);
  };

  const handleRunNextAction = (id: string) => {
    const item = items.find((candidate) => candidate.id === id);
    if (item?.managementState === 'managed' && item.nextAction?.id === 'start_app') {
      void runManagedAction(item.sourceId || item.id, 'start');
      return;
    }

    setSelectedId(id);
    setManagementOpen(true);
    void invalidateApplicationState(queryClient);
  };

  const handleUninstall = (id: string) => {
    setSelectedId(id);
    setManagementOpen(true);
  };

  const actions = {
    onCreateBackup: handleCreateBackup,
    onDirtyChange: handleDirtyChange,
    onLoadUninstallPlan: loadUninstallPlan,
    onPinObservedService: pinObservedService,
    onRestart: handleRestart,
    onRunNextAction: handleRunNextAction,
    onRunUninstall: runUninstall,
    onSaveSettings: saveApplicationSettings,
    onSettingsPlanRequest: requestSettingsPlan,
    onStart: handleStart,
    onStop: handleStop,
    onUnpinObservedService: unpinObservedService,
  };

  return (
    <main className="min-h-full bg-slate-800 text-slate-50">
      <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-5 p-4 md:p-5 2xl:px-6">
        <header className="rounded-2xl border border-sky-400/30 bg-slate-900 shadow-xl shadow-slate-950/30">
          <div className="flex flex-col gap-2 p-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex max-w-3xl flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h1 className="text-3xl font-semibold tracking-tight text-white">Your apps and services</h1>
                <p className="max-w-2xl text-sm leading-6 text-sky-100/80">
                  Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer vitae arcu sed tortor facilisis
                  volutpat.
                </p>
              </div>
            </div>
          </div>

          <Separator className="bg-sky-400/20" />

          <div className="grid gap-3 p-4 sm:grid-cols-3">
            <PageMetric label="Managed" value={managedCount} />
            <PageMetric label="Pinned" value={pinnedCount} />
            <PageMetric label="Needs review" value={attentionCount} />
          </div>
        </header>

        <section className="rounded-2xl border border-sky-400/30 bg-slate-900 p-3 shadow-xl shadow-slate-950/20">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sky-200/70" />
              <Input
                aria-label="Search apps and services"
                className="h-9 border-sky-400/40 bg-slate-800 pl-9 text-white placeholder:text-sky-100/50 focus-visible:border-cyan-300"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search apps and services"
                value={query}
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between xl:justify-end">
              <ToggleGroup
                aria-label="Filter apps and services"
                className="flex-wrap"
                onValueChange={handleFilterChange}
                size="sm"
                type="single"
                value={filter}
                variant="outline"
              >
                <ToggleGroupItem className="border-sky-400/40 bg-slate-800 text-sky-50 data-[state=on]:bg-cyan-300 data-[state=on]:text-slate-950" value="all">
                  All
                </ToggleGroupItem>
                <ToggleGroupItem className="border-sky-400/40 bg-slate-800 text-sky-50 data-[state=on]:bg-cyan-300 data-[state=on]:text-slate-950" value="managed">
                  Managed
                </ToggleGroupItem>
                <ToggleGroupItem className="border-sky-400/40 bg-slate-800 text-sky-50 data-[state=on]:bg-cyan-300 data-[state=on]:text-slate-950" value="pinned">
                  Pinned
                </ToggleGroupItem>
                <ToggleGroupItem className="border-sky-400/40 bg-slate-800 text-sky-50 data-[state=on]:bg-cyan-300 data-[state=on]:text-slate-950" value="found">
                  Found
                </ToggleGroupItem>
                <ToggleGroupItem className="border-sky-400/40 bg-slate-800 text-sky-50 data-[state=on]:bg-cyan-300 data-[state=on]:text-slate-950" value="needs_review">
                  Needs review
                </ToggleGroupItem>
              </ToggleGroup>

              <Button
                className="bg-orange-500 text-white shadow-md shadow-orange-700/20 hover:bg-orange-400"
                disabled={!nextReviewItem}
                onClick={() => {
                  if (nextReviewItem) {
                    setQuery('');
                    setFilter('needs_review');
                    setSelectedId(nextReviewItem.id);
                  }
                }}
                type="button"
              >
                <AlertTriangle data-icon="inline-start" />
                Review next
              </Button>
            </div>
          </div>
          {(appState.isLoading || Boolean(appState.error)) && (
            <div className="mt-3 rounded-xl border border-sky-400/20 bg-slate-800 px-3 py-2 text-sm text-sky-100/80">
              {appState.isLoading ? 'Loading apps and found services.' : 'Could not load the current apps list.'}
            </div>
          )}
        </section>

        <section className="grid min-h-[44rem] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {viewMode === 'basic' ? (
            <BasicApplicationsView
              items={visibleItems}
              managementOpen={managementOpen}
              onSelect={setSelectedId}
              onUninstall={handleUninstall}
              selectedId={selectedItemIsVisible ? selectedItem?.id : undefined}
            />
          ) : (
            <div className="max-h-[44rem] min-h-[44rem] overflow-y-auto pr-1">
              <AdvancedApplicationsView
                actions={actions}
                actionLoadingByItemId={actionLoadingByAppId}
                items={visibleItems}
                managementOpen={managementOpen}
                onSelect={setSelectedId}
                selectedId={selectedItemIsVisible ? selectedItem?.id : undefined}
              />
            </div>
          )}

          <ApplicationDetailsRail
            actions={actions}
            actionLoadingByItemId={actionLoadingByAppId}
            item={selectedItemIsVisible ? selectedItem : null}
            managementOpen={managementOpen}
            canCloseManagement={canCloseManagement}
            onManagementOpenChange={setManagementOpen}
            settingsLoadingByItemId={settingsLoadingByAppId}
            ref={railRef}
          />
        </section>
      </div>
    </main>
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
    desiredAccessMode: values.tailscaleEnabled ? 'local-and-private' : 'local',
    expectedLocalPort: values.localPort,
    expectedProtocol: protocol,
    privateAccessRequirement: values.tailscaleEnabled ? currentSettings.privateAccessRequirement : 'disabled',
    privateAccessUrl: values.tailscaleEnabled ? currentSettings.privateAccessUrl : null,
    tailscaleEnabled: values.tailscaleEnabled,
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

function appWithOptimisticPrivateAccess(app: AppRuntimeView, enabled: boolean): AppRuntimeView {
  const currentSettings = settingsWithDefaults(app);

  return {
    ...app,
    canonicalAccessState: enabled ? 'private_ready' : 'local_ready',
    desiredAccess: app.desiredAccess ? {
      ...app.desiredAccess,
      mode: enabled ? 'local-and-private' : 'local',
      privateAccessRequired: enabled ? app.desiredAccess.privateAccessRequired : false,
      privateAccessRecommended: enabled ? app.desiredAccess.privateAccessRecommended : false,
    } : app.desiredAccess,
    observedAccess: app.observedAccess ? {
      ...app.observedAccess,
      privateLinkStatus: enabled ? 'configured' : 'not_enabled',
      privateUrl: enabled ? app.observedAccess.privateUrl : null,
    } : app.observedAccess,
    settings: {
      ...currentSettings,
      desiredAccessMode: enabled ? 'local-and-private' : 'local',
      privateAccessRequirement: enabled ? currentSettings.privateAccessRequirement : 'disabled',
      privateAccessUrl: enabled ? currentSettings.privateAccessUrl : null,
      tailscaleEnabled: enabled,
    },
  };
}

function appActionLabel(action: ApplicationRuntimeAction) {
  if (action === 'start') return 'Start';
  if (action === 'stop') return 'Pause';
  if (action === 'restart') return 'Restart';
  return 'App action';
}

function PageMetric({ label, value }: { label: string; value: number }) {
  const attention = label === 'Needs review' && value > 0;

  return (
    <div className={attention
      ? 'min-w-28 rounded-xl border border-orange-400 bg-orange-200 px-4 py-3 text-orange-950 shadow-lg shadow-orange-500/20'
      : 'min-w-28 rounded-xl border border-sky-400/25 bg-slate-800 px-4 py-3 text-sky-50'}
    >
      <div className="text-2xl font-semibold">{value}</div>
      <div className={attention ? 'text-sm text-orange-800' : 'text-sm text-sky-100/70'}>{label}</div>
    </div>
  );
}
