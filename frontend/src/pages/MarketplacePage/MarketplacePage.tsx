import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bell, Info, RefreshCw, Sparkles, X } from 'lucide-react';
import { PageShell } from '@/components/layout/PageShell';
import { ProjectDarkControlButton, ProjectPrimaryButton } from '@/components/primitives/ProjectButtons';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { JobProgress } from '@/components/autark-os/JobProgress';
import { PageLoadError } from '@/components/autark-os/PageLoadError';
import { PageLoadingState } from '@/components/autark-os/PageLoadingState';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiErrorMessage } from '@/api/httpClient';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { cn } from '@/lib/utils';
import {
  useDiscoverAppsQuery,
  useDiscoverBackupMutation,
  useDiscoverInstallMutation,
  useDiscoverInstallPreviewQuery,
  useDiscoverReadinessQuery,
  useMarketplaceActivityQuery,
} from '@/repositories/discoverRepository';
import { terminalJob } from '@/repositories/jobRepository';
import type { ActivityLog } from '@/types/activity';
import type { DiscoverAppView } from '@/types/discover';
import type { AutarkOsJob } from '@/types/jobs';
import type { InstallOptions, MarketplaceApp } from '@/types/marketplace';
import { categories } from './extensions/MarketplacePage.constants';
import {
  START_HERE_DISMISSAL_KEY,
  formatMarketplaceActivityTime,
  marketplaceActivityTone,
  marketplaceVisibleAppViews,
  safeBasicCatalogForDiscover,
  starterCatalogForDiscover,
  shouldShowStartHereSection,
  starterAppsForMarketplace,
} from './extensions/MarketplacePage.logic';
import { MarketplaceAppDetail } from './MarketplaceAppDetail';
import { hasAppSpecificSetup, MarketplaceAppSettingsDialog } from './MarketplaceAppSettingsDialog';
import { MarketplaceAppList, MarketplaceCatalogToolbar } from './MarketplaceAppList';
import { MarketplaceAppRail } from './MarketplaceAppRail';
import { defaultAnswersFromSchema } from './MarketplaceSetupPanel';
import {
  marketplaceDetailId,
  marketplaceSearchWithDetail,
  marketplaceSearchWithoutDetail,
} from './extensions/MarketplacePage.detailRoute';
import { useDiscoverJobTracking } from './useDiscoverJobTracking';

type StarterRecommendation = {
  app: MarketplaceApp;
  installed: boolean;
  notes: string[];
  readiness: 'ready' | 'blocked' | 'review';
};

function DiscoverLoadingState() {
  return (
    <PageShell>
      <PageLoadingState model={{ description: 'Checking the catalog, installed apps, and recent marketplace activity.', title: 'Loading Discover' }} />
    </PageShell>
  );
}

function DiscoverErrorState({ message, onRetry, title = 'Discover needs attention', className }: { message: string; onRetry: () => void; title?: string; className?: string }) {
  return <PageLoadError className={className} model={{ actionLabel: 'Retry', message, title }} onRetry={onRetry} />;
}

function MarketplacePage() {
  const { showAdvancedMetrics } = useProjectSettings();
  const wideRailLayout = useDiscoverRailLayout();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedAppId, setSelectedAppId] = useState('vaultwarden');
  const [sortBy, setSortBy] = useState('Recommended');
  const [searchQuery, setSearchQuery] = useState('');
  const [hideInstalled, setHideInstalled] = useState(false);
  const [basicCatalogMode, setBasicCatalogMode] = useState<'starter' | 'all-safe'>('starter');
  const [marketplaceError, setMarketplaceError] = useState('');
  const [setupAnswers, setSetupAnswers] = useState<Record<string, unknown>>({});
  const [setupAnswersAppId, setSetupAnswersAppId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [duplicateAcknowledgedAppId, setDuplicateAcknowledgedAppId] = useState<string | null>(null);
  const [startHereDismissed, setStartHereDismissed] = useState(() => readStartHereDismissed());
  const detailTriggerRef = useRef<HTMLElement | null>(null);
  const catalogScrollPositionRef = useRef(0);
  const previousDetailAppIdRef = useRef<string | null>(null);
  const recoveryAppId = searchParams.get('app');
  const recoveryMode = searchParams.get('mode');
  const explicitDetailAppId = marketplaceDetailId(searchParams);
  const detailAppId = explicitDetailAppId ?? recoveryAppId;
  const appsQuery = useDiscoverAppsQuery();
  const activityQuery = useMarketplaceActivityQuery();
  const readinessQuery = useDiscoverReadinessQuery();
  const installMutation = useDiscoverInstallMutation();
  const backupMutation = useDiscoverBackupMutation();
  const { refetch: refetchApps } = appsQuery;
  const { refetch: refetchMarketplaceActivity } = activityQuery;
  const { refetch: refetchReadiness } = readinessQuery;
  const apps = useMemo<DiscoverAppView[]>(() => appsQuery.data ?? [], [appsQuery.data]);
  const marketplaceActivity = activityQuery.data ?? [];
  const onboarding = readinessQuery.data?.onboarding ?? null;
  const doctor = readinessQuery.data?.doctor ?? null;
  const storage = readinessQuery.data?.storage ?? null;
  const lastRefreshAt = appsQuery.dataUpdatedAt > 0 ? new Date(appsQuery.dataUpdatedAt) : null;
  const installedById = useMemo(() => new Map(apps.filter((app) => app.state === 'installed_managed' && app.installedApp).map((app) => [app.id, app.installedApp])), [apps]);
  const starterCatalogApps = useMemo(() => {
    const starterIds = new Set(starterCatalogForDiscover(apps.map((view) => view.app)).map((app: MarketplaceApp) => app.id));
    return apps.filter((view) => starterIds.has(view.id));
  }, [apps]);
  const safeBasicCatalogApps = useMemo(() => {
    const safeIds = new Set(safeBasicCatalogForDiscover(apps.map((view) => view.app)).map((app: MarketplaceApp) => app.id));
    return apps.filter((view) => safeIds.has(view.id));
  }, [apps]);
  const catalogApps = useMemo(() => {
    if (showAdvancedMetrics) {
      return apps;
    }
    return basicCatalogMode === 'all-safe' ? safeBasicCatalogApps : starterCatalogApps;
  }, [apps, basicCatalogMode, safeBasicCatalogApps, showAdvancedMetrics, starterCatalogApps]);
  const detailView = useMemo(() => detailAppId ? apps.find((app) => app.id === detailAppId) ?? null : null, [apps, detailAppId]);
  const selectedView = useMemo(() => detailView ?? apps.find((app) => app.id === selectedAppId) ?? catalogApps[0] ?? apps[0], [apps, catalogApps, detailView, selectedAppId]);
  const selectedApp = selectedView?.app;
  const selectedInstalledApp = selectedView?.installedApp ?? null;
  const fallbackInstallOptions: InstallOptions = {
    ports: { hostPort: null },
    access: { tailscaleEnabled: false },
    storage: { subfolders: {}, hostPaths: {} },
    backup: { enabled: true, frequency: 'daily', retention: 7 },
  };
  const previewEnabled = Boolean(selectedApp?.id && setupAnswersAppId === selectedApp.id);
  const installPreviewQuery = useDiscoverInstallPreviewQuery(selectedApp?.id ?? null, setupAnswers, previewEnabled);
  const installPreview = installPreviewQuery.data ?? null;
  const installPlan = installPreview?.technicalDetails ?? null;
  const installOptions = installPreview?.installOptions ?? null;
  const planLoading = installPreviewQuery.isFetching;

  const discoverError = marketplaceError || (appsQuery.error ? apiErrorMessage(appsQuery.error) : '');

  const refreshDiscover = useCallback(async () => {
    await Promise.all([
      refetchApps(),
      refetchMarketplaceActivity(),
      refetchReadiness(),
    ]);
  }, [refetchApps, refetchMarketplaceActivity, refetchReadiness]);
  const handleJobError = useCallback((message: string) => setMarketplaceError(message), []);
  const {
    backupJob,
    installJob,
    setBackupJob,
    setInstallJob,
  } = useDiscoverJobTracking({
    onError: handleJobError,
    onInstallSubjectRecovered: setSelectedAppId,
    refreshDiscover,
  });

  async function requestPlan(appId = selectedApp?.id, _options: InstallOptions | null = null) {
    if (!appId) {
      return;
    }
    if (appId !== selectedApp?.id) {
      setSelectedAppId(appId);
      return;
    }
    await installPreviewQuery.refetch();
  }

  useEffect(() => {
    if (recoveryAppId && apps.some((app) => app.id === recoveryAppId)) {
      setSearchQuery('');
      setSelectedCategory('All');
      setSelectedAppId(recoveryAppId);
    }
  }, [apps, recoveryAppId]);

  useEffect(() => {
    if (detailAppId && apps.some((app) => app.id === detailAppId)) {
      setSelectedAppId(detailAppId);
    }
  }, [apps, detailAppId]);

  useEffect(() => {
    if (previousDetailAppIdRef.current && !detailAppId) {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: catalogScrollPositionRef.current });
        detailTriggerRef.current?.focus();
      });
    }
    previousDetailAppIdRef.current = detailAppId;
  }, [detailAppId]);

  useEffect(() => {
    if (!showAdvancedMetrics) {
      setSelectedCategory('All');
      setSelectedAppId((currentAppId) => catalogApps.some((app) => app.id === currentAppId) ? currentAppId : catalogApps[0]?.id ?? currentAppId);
    }
  }, [catalogApps, showAdvancedMetrics]);

  useEffect(() => {
    setDuplicateAcknowledgedAppId(null);
    const view = apps.find((nextApp) => nextApp.id === selectedAppId);
    if (view) {
      setSetupAnswers(defaultAnswersFromSchema(view.setupSchema));
      setSetupAnswersAppId(selectedAppId);
    }
  }, [apps, selectedAppId]);

  async function installApp(appId = selectedApp?.id, _options = installOptions, mode: 'install' | 'reinstall' = 'install') {
    if (!appId) {
      return;
    }
    const app = apps.find((candidate) => candidate.id === appId);
    if (mode === 'install' && appId === selectedApp?.id && installPreview && !installPreview.valid) {
      setMarketplaceError(installPreview.blockingIssues[0]?.message || 'Finish setup choices before installing.');
      return;
    }
    if (installJob && !terminalJob(installJob) && installJob.subjectId !== appId) {
      setMarketplaceError(`${appNameForJob(installJob, apps)} is installing. Finish that install before starting ${app?.name || appId}.`);
      return;
    }
    try {
      setInstallJob(await installMutation.mutateAsync({
        appId,
        answers: setupAnswers,
        options: {
          reinstall: mode !== 'install',
          duplicateAcknowledged: mode === 'install' && duplicateAcknowledgedAppId === appId,
        },
      }));
      setMarketplaceError('');
    } catch (error) {
      const message = apiErrorMessage(error);
      setMarketplaceError(message);
    }
  }

  async function createFirstBackup(appId: string) {
    try {
      setBackupJob(await backupMutation.mutateAsync(appId));
      setMarketplaceError('');
    } catch (error) {
      setMarketplaceError(apiErrorMessage(error, 'Backup could not be started.'));
    }
  }

  function reinstallWithCurrentSettings() {
    if (!selectedApp || !selectedInstalledApp) {
      return;
    }
    return installApp(selectedApp.id, installOptions ?? undefined, 'reinstall');
  }

  const visibleApps = useMemo(() => marketplaceVisibleAppViews({
    views: catalogApps,
    hideInstalled,
    searchQuery,
    selectedCategory,
    sortBy,
  }) as DiscoverAppView[], [catalogApps, hideInstalled, searchQuery, selectedCategory, sortBy]);
  const selectedAppInstalling = Boolean(installJob && !terminalJob(installJob) && installJob.subjectId === selectedApp?.id);
  const selectedAppInstallLocked = Boolean(selectedApp && installJob && !terminalJob(installJob) && installJob.subjectId !== selectedApp.id);
  const selectedAppHasSettings = hasAppSpecificSetup(selectedView?.setupSchema ?? { appId: '', version: 1, inputs: [] }, setupAnswers);
  const installStatusMessage = selectedAppInstallLocked && installJob ? `${appNameForJob(installJob, apps)} is installing. Finish that install before starting another app.` : '';
  const starterRecommendations = useMemo(
    () => apps.length ? starterAppsForMarketplace(apps.map((view) => view.app), onboarding?.recommendedApps ?? [], installedById, doctor, storage) as StarterRecommendation[] : [],
    [apps, doctor, installedById, onboarding?.recommendedApps, storage],
  );
  const showStartHere = shouldShowStartHereSection(starterRecommendations, startHereDismissed);
  const canRestoreStartHere = startHereDismissed && shouldShowStartHereSection(starterRecommendations, false);
  const discoverFilters = useMemo(
    () => showAdvancedMetrics
      ? categories.map((category) => ({ label: category, value: category }))
      : [
          { label: 'Starter apps', value: 'starter' },
          { label: 'Safe apps', value: 'all-safe' },
        ],
    [showAdvancedMetrics],
  );
  const discoverFilterValue = showAdvancedMetrics ? selectedCategory : basicCatalogMode;

  useEffect(() => {
    if (detailAppId || !visibleApps.length) {
      return;
    }
    setSelectedAppId((currentAppId) => visibleApps.some((app) => app.id === currentAppId) ? currentAppId : visibleApps[0].id);
  }, [detailAppId, visibleApps]);

  function openAppDetails(appId: string) {
    detailTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    catalogScrollPositionRef.current = window.scrollY;
    setSelectedAppId(appId);
    setSearchParams(marketplaceSearchWithDetail(searchParams, appId));
  }

  function selectApp(appId: string) {
    if (wideRailLayout) {
      setSelectedAppId(appId);
      return;
    }
    openAppDetails(appId);
  }

  function closeAppDetails() {
    setSearchParams(marketplaceSearchWithoutDetail(searchParams, Boolean(recoveryAppId)), { replace: true });
  }

  function changeDiscoverFilter(nextFilter: string) {
    if (!nextFilter) {
      return;
    }
    if (showAdvancedMetrics) {
      setSelectedCategory(nextFilter);
      return;
    }
    setBasicCatalogMode(nextFilter as 'starter' | 'all-safe');
  }

  function changeSetupAnswers(nextAnswers: Record<string, unknown>) {
    if (!selectedApp) {
      return;
    }
    setSetupAnswers(nextAnswers);
    setSetupAnswersAppId(selectedApp.id);
  }

  function dismissStartHere() {
    setStartHereDismissed(true);
    window.localStorage.setItem(START_HERE_DISMISSAL_KEY, 'true');
  }

  function restoreStartHere() {
    setStartHereDismissed(false);
    window.localStorage.removeItem(START_HERE_DISMISSAL_KEY);
  }

  if (!selectedApp) {
    return (
      discoverError ? (
        <PageShell>
          <DiscoverErrorState message={discoverError} onRetry={refreshDiscover} title="Discover catalog could not load" />
        </PageShell>
      ) : (
        <DiscoverLoadingState />
      )
    );
  }

  return (
    <PageShell
      className="lg:h-[calc(100dvh-7.25rem)] lg:min-h-0"
      contained
      contentClassName="gap-3 lg:h-full lg:min-h-0 lg:!overflow-hidden"
    >
      <DiscoverGuidedHeader
        appCount={catalogApps.length}
        lastRefreshAt={lastRefreshAt}
        marketplaceActivity={marketplaceActivity}
        onRefresh={refreshDiscover}
      />

      {discoverError && <DiscoverErrorState message={discoverError} onRetry={refreshDiscover} title="Discover action needs attention" />}
      <InstallJobBanner apps={apps} installJob={installJob} selectedAppId={selectedApp.id} />

      <section className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-2xl border border-sky-300/15 bg-[#07142b]/90 shadow-xl shadow-slate-950/20 xl:grid-cols-[12rem_minmax(0,1fr)_19rem] xl:grid-rows-1">
        <MarketplaceBrowseSidebar
          canRestoreStartHere={canRestoreStartHere}
          filterValue={discoverFilterValue}
          filters={discoverFilters}
          hideInstalled={hideInstalled}
          onDismissStartHere={dismissStartHere}
          onFilterChange={changeDiscoverFilter}
          onRestoreStartHere={restoreStartHere}
          onSelectRecommendation={openAppDetails}
          onToggleHideInstalled={() => setHideInstalled((value) => !value)}
          recommendations={starterRecommendations}
          showStartHere={showStartHere}
        />

        <section className="flex min-h-0 flex-col border-b border-sky-300/15 xl:border-b-0">
          <MarketplaceCatalogToolbar
            onSearchChange={setSearchQuery}
            onSortChange={setSortBy}
            searchValue={searchQuery}
            sortBy={sortBy}
          />
          <MarketplaceAppList apps={visibleApps} installingAppId={installJob && !terminalJob(installJob) ? installJob.subjectId ?? null : null} onSelect={selectApp} selectedAppId={selectedView?.id ?? ''} />
        </section>

        {selectedView && (
          <MarketplaceAppRail
            appView={selectedView}
            hasAppSettings={selectedAppHasSettings}
            installLocked={selectedAppInstallLocked}
            installStatusMessage={installStatusMessage}
            installing={selectedAppInstalling}
            onConfigureSettings={() => setSettingsOpen(true)}
            onReviewDetails={() => openAppDetails(selectedView.id)}
          />
        )}
      </section>

      {selectedView && selectedAppHasSettings && (
        <MarketplaceAppSettingsDialog
          appName={selectedView.name}
          answers={setupAnswers}
          issues={installPreview?.blockingIssues}
          onAnswersChange={changeSetupAnswers}
          onOpenChange={setSettingsOpen}
          open={settingsOpen}
          schema={selectedView.setupSchema}
        />
      )}

      {detailView && (
        <MarketplaceAppDetail
          app={detailView.app}
          appView={detailView}
          backupJob={backupJob?.subjectId === detailView.id ? backupJob : null}
          installJob={installJob?.subjectId === detailView.id ? installJob : null}
          installLocked={selectedAppInstallLocked}
          installOptions={installOptions ?? fallbackInstallOptions}
          installPlan={installPlan}
          installPreview={installPreview}
          installStatusMessage={installStatusMessage}
          installing={selectedAppInstalling}
          installedApp={detailView.installedApp ?? null}
          onBack={closeAppDetails}
          onCreateBackup={createFirstBackup}
          onDuplicateInstallAcknowledged={() => setDuplicateAcknowledgedAppId(detailView.id)}
          onInstall={(options) => installApp(detailView.id, options)}
          onOpenSettings={() => setSettingsOpen(true)}
          onReinstallCurrent={reinstallWithCurrentSettings}
          onRequestPlan={(options) => requestPlan(detailView.id, options)}
          planLoading={planLoading}
          recoveryMode={recoveryAppId === detailView.id ? recoveryMode : null}
          hasAppSettings={selectedAppHasSettings}
          setupAnswers={setupAnswers}
          setupReady={installPreview?.valid ?? true}
          setupSchema={detailView.setupSchema}
        />
      )}
    </PageShell>
  );
}

function InstallJobBanner({ apps, installJob, selectedAppId }: { apps: DiscoverAppView[]; installJob: AutarkOsJob | null; selectedAppId: string }) {
  if (!installJob || installJob.subjectId !== selectedAppId) {
    return null;
  }
  if (!terminalJob(installJob)) {
    return <JobProgress job={installJob} subjectLabel={appNameForJob(installJob, apps)} />;
  }
  if (installJob.status === 'failed') {
    return (
      <div className="rounded-lg border border-red-400/35 bg-red-500/10 p-4 text-sm text-red-200">
        <p className="font-semibold text-current">Install failed for {appNameForJob(installJob, apps)}</p>
        <p className="mt-1">{installJob.error?.message || 'Autark-OS could not finish the install.'}</p>
      </div>
    );
  }
  if (installJob.status === 'succeeded') {
    return (
      <div className="rounded-lg border border-emerald-300/35 bg-emerald-500/10 p-4 text-sm text-emerald-200">
        <p className="font-semibold text-current">{appNameForJob(installJob, apps)} is ready</p>
        <p className="mt-1">Open the app or create a first restore point before experimenting.</p>
      </div>
    );
  }
  return null;
}

function DiscoverGuidedHeader({
  appCount,
  lastRefreshAt,
  marketplaceActivity,
  onRefresh,
}: {
  appCount: number;
  lastRefreshAt: Date | null;
  marketplaceActivity: ActivityLog[];
  onRefresh: () => void;
}) {
  return (
    <header className="rounded-2xl border border-sky-300/15 bg-[#07142b]/90 p-3 text-slate-50 shadow-xl shadow-slate-950/20 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="hidden size-10 shrink-0 place-items-center rounded-xl border border-cyan-300/35 bg-cyan-400/10 text-cyan-200 sm:grid">
            <Sparkles className="size-5" />
          </span>
          <h1 className="m-0 text-3xl font-semibold tracking-tight text-white sm:text-[2.1rem]">Discover</h1>
        </div>

        <div className="flex shrink-0 gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <ProjectDarkControlButton aria-label="How installs work" size="icon" type="button">
                <Info className="size-4" />
                <span className="sr-only">How installs work</span>
              </ProjectDarkControlButton>
            </DialogTrigger>
            <DialogContent className="border-sky-400/30 bg-slate-900 text-slate-50 shadow-xl shadow-slate-950/30 sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>How Autark-OS installs apps</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Autark-OS shows a plan before anything changes, then prepares the app with managed storage, local access, health checks, and backup defaults.
                </DialogDescription>
              </DialogHeader>
              <ol className="grid gap-3 text-sm text-slate-300">
                {['Pick an app that fits what you want to do.', 'Review setup choices and any host readiness notes.', 'Confirm the install plan before Autark-OS changes this server.', 'Open the app from My Apps and create a first restore point.'].map((step, index) => (
                  <li className="grid grid-cols-[28px_1fr] gap-3" key={step}>
                    <span className="grid size-7 place-items-center rounded-full border border-cyan-300/35 bg-cyan-400/10 text-xs font-bold text-cyan-200">{index + 1}</span>
                    <span className="leading-6">{step}</span>
                  </li>
                ))}
              </ol>
            </DialogContent>
          </Dialog>

          <ProjectDarkControlButton aria-label="Refresh Discover" onClick={onRefresh} size="icon" type="button">
            <RefreshCw className="size-4" />
            <span className="sr-only">Refresh Discover</span>
          </ProjectDarkControlButton>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <ProjectDarkControlButton aria-label="Discover activity" size="icon" type="button">
                <Bell className="size-4" />
              </ProjectDarkControlButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 border-sky-400/30 bg-slate-900 text-slate-50 shadow-xl shadow-slate-950/30">
              <DropdownMenuLabel>Discover activity</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-sky-400/20" />
              <div className="grid max-h-80 gap-2 overflow-y-auto px-2 py-1.5 text-sm">
                <div className="rounded-md border border-sky-400/25 bg-slate-800 p-2 text-xs text-slate-400">
                  {appCount} apps shown - Last checked {lastRefreshAt ? lastRefreshAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'not yet'}
                </div>
                {marketplaceActivity.length ? marketplaceActivity.map((event) => (
                  <div className="rounded-md border border-sky-400/25 bg-slate-800 p-2" key={event.id}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn('text-xs font-semibold uppercase tracking-wide', marketplaceActivityTone(event.level))}>{event.outcome.replace('_', ' ')}</span>
                      <span className="text-xs text-slate-400">{formatMarketplaceActivityTime(event.createdAt)}</span>
                    </div>
                    <p className="mt-1 font-medium text-slate-50">{event.title}</p>
                    {event.message && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{event.message}</p>}
                  </div>
                )) : (
                  <div className="rounded-md border border-sky-400/25 bg-slate-800 p-3 text-sm text-slate-400">
                    No Discover activity has been recorded yet.
                  </div>
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

    </header>
  );
}

function MarketplaceBrowseSidebar({
  canRestoreStartHere,
  filterValue,
  filters,
  hideInstalled,
  onDismissStartHere,
  onFilterChange,
  onRestoreStartHere,
  onSelectRecommendation,
  onToggleHideInstalled,
  recommendations,
  showStartHere,
}: {
  canRestoreStartHere: boolean;
  filterValue: string;
  filters: Array<{ label: string; value: string }>;
  hideInstalled: boolean;
  onDismissStartHere: () => void;
  onFilterChange: (filter: string) => void;
  onRestoreStartHere: () => void;
  onSelectRecommendation: (appId: string) => void;
  onToggleHideInstalled: () => void;
  recommendations: StarterRecommendation[];
  showStartHere: boolean;
}) {
  const recommendation = recommendations.find((item) => !item.installed) ?? recommendations[0] ?? null;

  return (
    <aside className="flex min-h-0 flex-col border-b border-sky-300/15 bg-slate-950/10 p-3 xl:border-b-0 xl:border-r">
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Browse</p>
      <div aria-label="Discover filters" className="mt-2 grid gap-1">
        {filters.map((filter) => (
          <button
            aria-pressed={filterValue === filter.value}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300',
              filterValue === filter.value ? 'bg-cyan-400/15 text-cyan-100' : 'text-slate-300 hover:bg-slate-800/70 hover:text-white',
            )}
            key={filter.value}
            onClick={() => onFilterChange(filter.value)}
            type="button"
          >
            <span className={cn('size-1.5 rounded-full', filterValue === filter.value ? 'bg-cyan-300' : 'bg-slate-500')} />
            <span className="truncate">{filter.label}</span>
          </button>
        ))}
      </div>

      <ProjectDarkControlButton
        className={cn('mt-3 h-8 w-full justify-start px-2 text-xs', hideInstalled && 'border-cyan-300/45 bg-cyan-400/10 text-cyan-100')}
        onClick={onToggleHideInstalled}
        type="button"
      >
        {hideInstalled ? 'Showing new apps only' : 'Hide installed'}
      </ProjectDarkControlButton>

      {showStartHere && recommendation && (
        <section className="mt-3 rounded-xl border border-cyan-300/25 bg-cyan-400/8 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-cyan-100">Start with one app</p>
              <p className="mt-1 text-xs leading-5 text-slate-300">{recommendation.notes[0] || 'A safe first app to review before installing.'}</p>
            </div>
            <button aria-label="Hide Start here" className="grid size-6 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" onClick={onDismissStartHere} type="button"><X className="size-3.5" /></button>
          </div>
          <DisabledAction disabled={recommendation.installed} reason="This recommended app is already installed. Open it from My Apps.">
            <ProjectPrimaryButton className="mt-3 h-8 w-full px-2 text-xs" disabled={recommendation.installed} onClick={() => onSelectRecommendation(recommendation.app.id)} type="button">
              <Sparkles className="size-3.5" />
              {recommendation.installed ? 'Already installed' : `Review ${recommendation.app.name}`}
            </ProjectPrimaryButton>
          </DisabledAction>
        </section>
      )}

      {canRestoreStartHere && (
        <ProjectDarkControlButton className="mt-auto h-8 w-full px-2 text-xs" onClick={onRestoreStartHere} type="button">
          Show Start here
        </ProjectDarkControlButton>
      )}
    </aside>
  );
}

export default MarketplacePage;

function readStartHereDismissed() {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.localStorage.getItem(START_HERE_DISMISSAL_KEY) === 'true';
}

function appNameForJob(job: AutarkOsJob, apps: DiscoverAppView[]) {
  return apps.find((app) => app.id === job.subjectId)?.name || job.subjectId || 'this app';
}

function useDiscoverRailLayout() {
  const query = '(min-width: 1280px)';
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const update = () => setMatches(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  return matches;
}
