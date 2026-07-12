import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bell, Info, RefreshCw, Sparkles, X } from 'lucide-react';
import { MetadataBadge } from '@/components/autark-os/MetadataBadge';
import { StatusBadge } from '@/components/autark-os/StatusBadge';
import { PageShell } from '@/components/layout/PageShell';
import { SearchFilterBar } from '@/components/primitives/SearchFilterBar';
import { ProjectDarkControlButton, ProjectPrimaryButton } from '@/components/primitives/ProjectButtons';
import { CanonicalRecommendedAction } from '@/components/autark-os/CanonicalRecommendedAction';
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
import { MarketplaceAppList } from './MarketplaceAppList';
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

  function openAppDetails(appId: string) {
    detailTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    catalogScrollPositionRef.current = window.scrollY;
    setSelectedAppId(appId);
    setSearchParams(marketplaceSearchWithDetail(searchParams, appId));
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
    <PageShell>
      <DiscoverGuidedHeader
        appCount={catalogApps.length}
        lastRefreshAt={lastRefreshAt}
        marketplaceActivity={marketplaceActivity}
        onRefresh={refreshDiscover}
      />

      {!showStartHere && <CanonicalRecommendedAction className="mb-4" />}

      {discoverError && <DiscoverErrorState className="mb-5" message={discoverError} onRetry={refreshDiscover} title="Discover action needs attention" />}
      <InstallJobBanner apps={apps} installJob={installJob} selectedAppId={selectedApp.id} />

      {showStartHere && (
        <StarterAppHandoff
          recommendations={starterRecommendations}
          onDismiss={dismissStartHere}
          onSelect={openAppDetails}
        />
      )}

      <SearchFilterBar
        actions={(
          <>
            <ProjectDarkControlButton
              className={cn(hideInstalled && 'border-cyan-300/35 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/15')}
              onClick={() => setHideInstalled((value) => !value)}
              type="button"
            >
              {hideInstalled ? 'Showing new apps only' : 'Hide installed'}
            </ProjectDarkControlButton>
            {canRestoreStartHere && (
              <ProjectDarkControlButton onClick={restoreStartHere} type="button">
                Show Start here
              </ProjectDarkControlButton>
            )}
          </>
        )}
        className="mb-4"
        filterAriaLabel="Discover filters"
        filterValue={discoverFilterValue}
        filters={discoverFilters}
        onFilterChange={changeDiscoverFilter}
        onSearchChange={setSearchQuery}
        searchAriaLabel="Search Discover apps"
        searchPlaceholder="Search by name, purpose, or category..."
        searchValue={searchQuery}
      />

      <div className="grid items-start gap-6 2xl:grid-cols-[minmax(620px,1fr)_minmax(420px,560px)]">
        <MarketplaceAppList apps={visibleApps} density={showAdvancedMetrics ? 'full' : 'basic'} installingAppId={installJob && !terminalJob(installJob) ? installJob.subjectId ?? null : null} modeLabel={showAdvancedMetrics ? 'All apps' : basicCatalogMode === 'all-safe' ? 'Ready apps' : 'Starter apps'} onSelect={openAppDetails} onSortChange={setSortBy} selectedAppId={detailAppId ?? ''} sortBy={sortBy} />
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
            onReinstallCurrent={reinstallWithCurrentSettings}
            onRequestPlan={(options) => requestPlan(detailView.id, options)}
            onSetupAnswersChange={changeSetupAnswers}
            planLoading={planLoading}
            recoveryMode={recoveryAppId === detailView.id ? recoveryMode : null}
            setupAnswers={setupAnswers}
            setupReady={installPreview?.valid ?? true}
            setupSchema={detailView.setupSchema}
          />
        )}
      </div>
    </PageShell>
  );
}

function InstallJobBanner({ apps, installJob, selectedAppId }: { apps: DiscoverAppView[]; installJob: AutarkOsJob | null; selectedAppId: string }) {
  if (!installJob || installJob.subjectId !== selectedAppId) {
    return null;
  }
  if (!terminalJob(installJob)) {
    return <JobProgress className="mb-5" job={installJob} subjectLabel={appNameForJob(installJob, apps)} />;
  }
  if (installJob.status === 'failed') {
    return (
      <div className="mb-5 rounded-lg border border-red-400/35 bg-red-500/10 p-4 text-sm text-red-200">
        <p className="font-semibold text-current">Install failed for {appNameForJob(installJob, apps)}</p>
        <p className="mt-1">{installJob.error?.message || 'Autark-OS could not finish the install.'}</p>
      </div>
    );
  }
  if (installJob.status === 'succeeded') {
    return (
      <div className="mb-5 rounded-lg border border-emerald-300/35 bg-emerald-500/10 p-4 text-sm text-emerald-200">
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
    <header className="mb-4 rounded-2xl border border-sky-400/25 bg-slate-900 p-4 text-slate-50 shadow-lg shadow-slate-950/20">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex max-w-3xl gap-3">
          <span className="hidden size-10 shrink-0 place-items-center rounded-xl border border-cyan-300/35 bg-cyan-400/10 text-cyan-200 sm:grid">
            <Sparkles className="size-5" />
          </span>
          <div>
            <MetadataBadge tone="info">Discover</MetadataBadge>
            <h2 className="mt-2 text-2xl font-bold leading-none text-slate-50 md:text-3xl">Discover Apps</h2>
            <p className="mt-2 max-w-2xl text-sm leading-5 text-slate-400">
              Install useful self-hosted apps without managing Docker by hand.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 md:justify-end">
          <Dialog>
            <DialogTrigger asChild>
              <ProjectDarkControlButton type="button">
                <Info className="size-4" />
                How installs work
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

          <ProjectDarkControlButton onClick={onRefresh} type="button">
            <RefreshCw className="size-4" />
            Refresh
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

function StarterAppHandoff({ onDismiss, onSelect, recommendations }: { onDismiss: () => void; onSelect: (appId: string) => void; recommendations: StarterRecommendation[] }) {
  const recommendation = recommendations.find((item) => !item.installed) ?? recommendations[0];
  if (!recommendation) {
    return null;
  }

  return (
    <section className="mb-4 rounded-2xl border border-cyan-300/35 bg-cyan-400/10 p-4 shadow-lg shadow-slate-950/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-normal text-cyan-200">Start here</p>
          <h3 className="mt-1 text-lg font-bold text-slate-50">Start with {recommendation.app.name}</h3>
          <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-300">
            {recommendation.notes[0] || 'A safe first app to review before installing.'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge tone={recommendation.readiness === 'blocked' ? 'warning' : 'info'}>
              {recommendation.readiness === 'blocked' ? 'Readiness review needed' : recommendation.readiness === 'review' ? 'Review first' : 'Ready to review'}
            </StatusBadge>
            <DisabledAction disabled={recommendation.installed} reason="This recommended app is already installed. Open it from My Apps.">
              <ProjectPrimaryButton disabled={recommendation.installed} onClick={() => onSelect(recommendation.app.id)} size="sm" type="button">
                <Sparkles className="size-4" />
                {recommendation.installed ? 'Already installed' : 'Review install'}
              </ProjectPrimaryButton>
            </DisabledAction>
          </div>
        </div>
        <ProjectDarkControlButton aria-label="Hide Start here" onClick={onDismiss} size="icon" type="button">
            <X className="size-4" />
        </ProjectDarkControlButton>
      </div>
    </section>
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
