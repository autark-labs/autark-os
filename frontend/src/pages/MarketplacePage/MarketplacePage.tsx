import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Info, Sparkles } from 'lucide-react';
import { PageShell } from '@/components/layout/PageShell';
import { ProjectDarkControlButton } from '@/components/primitives/ProjectButtons';
import { RefreshStatus } from '@/components/RefreshStatus';
import { PageLoadError } from '@/components/autark-os/PageLoadError';
import { PageLoadingState } from '@/components/autark-os/PageLoadingState';
import { ExtensionActionTarget } from '@/extensions/ExtensionActionTarget';
import { ExtensionSlot } from '@/extensions/ExtensionSlot';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { apiErrorMessage } from '@/api/httpClient';
import { showActionErrorNotification, showActionNotification, showJobNotification } from '@/lib/actionNotifications';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { cn } from '@/lib/utils';
import { useApplicationStateRepository } from '@/repositories/applicationStateRepository';
import {
  useDiscoverAppsQuery,
  useDiscoverBackupMutation,
  useDiscoverInstallMutation,
  useDiscoverInstallPreviewQuery,
  useDiscoverReadinessQuery,
} from '@/repositories/discoverRepository';
import { terminalJob } from '@/repositories/jobRepository';
import type { DiscoverAppView } from '@/types/discover';
import type { AutarkOsJob } from '@/types/jobs';
import type { InstallOptions, MarketplaceApp } from '@/types/marketplace';
import { categories, type MarketplaceStatusFilter } from './extensions/MarketplacePage.constants';
import {
  START_HERE_DISMISSAL_KEY,
  defaultDiscoverAppId,
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
import { InstallWizard } from './MarketplaceInstallWizard';
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
  const applicationState = useApplicationStateRepository();
  const wideRailLayout = useDiscoverRailLayout();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedAppId, setSelectedAppId] = useState(defaultDiscoverAppId);
  const [sortBy, setSortBy] = useState('Recommended');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<MarketplaceStatusFilter>('all');
  const [basicCatalogMode, setBasicCatalogMode] = useState<'starter' | 'all-safe'>('starter');
  const [setupAnswers, setSetupAnswers] = useState<Record<string, unknown>>({});
  const [setupAnswersAppId, setSetupAnswersAppId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [installReviewOpen, setInstallReviewOpen] = useState(false);
  const [duplicateAcknowledgedAppId, setDuplicateAcknowledgedAppId] = useState<string | null>(null);
  const [startHereDismissed, setStartHereDismissed] = useState(() => readStartHereDismissed());
  const detailTriggerRef = useRef<HTMLElement | null>(null);
  const catalogScrollPositionRef = useRef(0);
  const previousDetailAppIdRef = useRef<string | null>(null);
  const recoveryAppId = searchParams.get('app');
  const recoveryMode = searchParams.get('mode');
  const explicitDetailAppId = marketplaceDetailId(searchParams);
  const detailAppId = explicitDetailAppId ?? recoveryAppId;
  const appsQuery = useDiscoverAppsQuery(applicationState.freshness.hasUsableData);
  const readinessQuery = useDiscoverReadinessQuery();
  const installMutation = useDiscoverInstallMutation();
  const backupMutation = useDiscoverBackupMutation();
  const { refetch: refetchApps } = appsQuery;
  const { refetch: refetchReadiness } = readinessQuery;
  const apps = useMemo<DiscoverAppView[]>(() => appsQuery.data ?? [], [appsQuery.data]);
  const onboarding = readinessQuery.data?.onboarding ?? null;
  const doctor = readinessQuery.data?.doctor ?? null;
  const storage = readinessQuery.data?.storage ?? null;
  const lastRefreshAt = appsQuery.dataUpdatedAt > 0 ? new Date(appsQuery.dataUpdatedAt) : null;
  const installedById = useMemo(() => new Map(apps
    .filter((view) => view.application.relationship === 'managed' && view.application.runtime)
    .map((view) => [view.application.id, view.application])), [apps]);
  const starterCatalogApps = useMemo(() => {
    const starterIds = new Set(starterCatalogForDiscover(apps.map((view) => view.app)).map((app: MarketplaceApp) => app.id));
    return apps.filter((view) => starterIds.has(view.application.id));
  }, [apps]);
  const safeBasicCatalogApps = useMemo(() => {
    const safeIds = new Set(safeBasicCatalogForDiscover(apps.map((view) => view.app)).map((app: MarketplaceApp) => app.id));
    return apps.filter((view) => safeIds.has(view.application.id));
  }, [apps]);
  const catalogApps = useMemo(() => {
    if (showAdvancedMetrics) {
      return apps;
    }
    return basicCatalogMode === 'all-safe' ? safeBasicCatalogApps : starterCatalogApps;
  }, [apps, basicCatalogMode, safeBasicCatalogApps, showAdvancedMetrics, starterCatalogApps]);
  const detailView = useMemo(() => detailAppId ? apps.find((view) => view.application.id === detailAppId) ?? null : null, [apps, detailAppId]);
  const selectedView = useMemo(() => detailView ?? apps.find((view) => view.application.id === selectedAppId) ?? catalogApps[0] ?? apps[0], [apps, catalogApps, detailView, selectedAppId]);
  const selectedApp = selectedView?.app;
  const selectedInstalledApp = selectedView?.application.relationship === 'managed' ? selectedView.application : null;
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

  const discoverError = (appsQuery.error ? apiErrorMessage(appsQuery.error) : '');

  const refreshDiscover = useCallback(async () => {
    await Promise.all([
      refetchApps(),
      refetchReadiness(),
    ]);
  }, [refetchApps, refetchReadiness]);
  const {
    progressError,
    retryProgress,
    backupJob,
    installJob,
    setBackupJob,
    setInstallJob,
  } = useDiscoverJobTracking({
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
    if (recoveryAppId && apps.some((view) => view.application.id === recoveryAppId)) {
      setSearchQuery('');
      setSelectedCategory('All');
      setSelectedAppId(recoveryAppId);
    }
  }, [apps, recoveryAppId]);

  useEffect(() => {
    if (detailAppId && apps.some((view) => view.application.id === detailAppId)) {
      setSelectedAppId(detailAppId);
    }
  }, [apps, detailAppId]);

  useEffect(() => {
    if (wideRailLayout) {
      setDetailsOpen(Boolean(detailView));
    }
  }, [detailView, wideRailLayout]);

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
      setSelectedAppId((currentAppId) => catalogApps.some((view) => view.application.id === currentAppId) ? currentAppId : catalogApps[0]?.application.id ?? currentAppId);
    }
  }, [catalogApps, showAdvancedMetrics]);

  useEffect(() => {
    setDuplicateAcknowledgedAppId(null);
    setInstallReviewOpen(false);
  }, [selectedAppId]);

  useEffect(() => {
    const view = apps.find((nextApp) => nextApp.application.id === selectedAppId);
    if (!view || setupAnswersAppId === selectedAppId) {
      return;
    }
    setSetupAnswers(defaultAnswersFromSchema(view.setupSchema));
    setSetupAnswersAppId(selectedAppId);
  }, [apps, selectedAppId, setupAnswersAppId]);

  async function installApp(appId = selectedApp?.id, _options = installOptions, mode: 'install' | 'reinstall' = 'install') {
    if (!appId) {
      return;
    }
    if (!applicationState.freshness.isCurrent) {
      showActionNotification({ ok: false, severity: 'warning', title: 'App information needs refreshing', message: 'Refresh app information before reviewing or starting an install.' });
      return;
    }
    const app = apps.find((candidate) => candidate.application.id === appId);
    if (mode === 'install' && appId === selectedApp?.id && installPreview && !installPreview.valid) {
      showActionNotification({ ok: false, severity: 'warning', title: 'Check app settings', message: installPreview.blockingIssues[0]?.message || 'Finish setup choices before installing.' });
      return;
    }
    if (installJob && !terminalJob(installJob) && installJob.subjectId !== appId) {
      showActionNotification({ ok: false, severity: 'info', title: 'An install is already running', message: `${appNameForJob(installJob, apps)} is installing. Finish that install before starting ${app?.application.name || appId}.` });
      return;
    }
    try {
      const job = await installMutation.mutateAsync({
        appId,
        answers: setupAnswers,
        options: {
          reinstall: mode !== 'install',
          duplicateAcknowledged: mode === 'install' && duplicateAcknowledgedAppId === appId,
        },
      });
      setInstallJob(job);
      showJobNotification(job);
    } catch (error) {
      showActionErrorNotification(error, 'Install could not start');
    }
  }

  async function createFirstBackup(appId: string) {
    try {
      const job = await backupMutation.mutateAsync(appId);
      setBackupJob(job);
      showJobNotification(job);
    } catch (error) {
      showActionErrorNotification(error, 'Backup could not start');
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
    searchQuery,
    selectedCategory,
    sortBy,
    statusFilter,
  }) as DiscoverAppView[], [catalogApps, searchQuery, selectedCategory, sortBy, statusFilter]);
  const selectedAppInstalling = Boolean(installJob && !terminalJob(installJob) && installJob.subjectId === selectedApp?.id);
  const selectedAppInstallLocked = !applicationState.freshness.isCurrent
    || Boolean(selectedApp && installJob && !terminalJob(installJob) && installJob.subjectId !== selectedApp.id);
  const selectedAppHasSettings = hasAppSpecificSetup(selectedView?.setupSchema ?? { appId: '', version: 1, inputs: [] }, setupAnswers);
  const installStatusMessage = !applicationState.freshness.isCurrent
    ? 'Refresh app information before reviewing or starting an install.'
    : selectedAppInstallLocked && installJob
      ? `${appNameForJob(installJob, apps)} is installing. Finish that install before starting another app.`
      : '';
  const starterRecommendations = useMemo(
    () => apps.length ? starterAppsForMarketplace(apps.map((view) => view.app), onboarding?.recommendedApps ?? [], installedById, doctor, storage) as StarterRecommendation[] : [],
    [apps, doctor, installedById, onboarding?.recommendedApps, storage],
  );
  const showStartHere = shouldShowStartHereSection(starterRecommendations, startHereDismissed);
  const starterRecommendation = useMemo(
    () => starterRecommendations.find((recommendation) => !recommendation.installed) ?? null,
    [starterRecommendations],
  );
  const starterGuidanceVisible = Boolean(
    !showAdvancedMetrics
    && basicCatalogMode === 'starter'
    && !searchQuery.trim()
    && statusFilter === 'all'
    && showStartHere
    && starterRecommendation,
  );
  const canRestoreStarterGuidance = Boolean(
    !showAdvancedMetrics
    && basicCatalogMode === 'starter'
    && !searchQuery.trim()
    && statusFilter === 'all'
    && startHereDismissed
    && starterRecommendation,
  );
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
    setSelectedAppId((currentAppId) => visibleApps.some((view) => view.application.id === currentAppId) ? currentAppId : visibleApps[0].application.id);
  }, [detailAppId, visibleApps]);

  function openAppDetails(appId: string) {
    detailTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    catalogScrollPositionRef.current = window.scrollY;
    setSelectedAppId(appId);
    setDetailsOpen(true);
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
    setDetailsOpen(false);
    setSearchParams(marketplaceSearchWithoutDetail(searchParams, Boolean(recoveryAppId)), { replace: true });
  }

  function openInstallReview() {
    if (!selectedView || selectedView.application.relationship === 'managed') {
      return;
    }
    setInstallReviewOpen(true);
    void requestPlan(selectedView.application.id);
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
      discoverError || applicationState.freshness.phase === 'unavailable' ? (
        <PageShell>
          <DiscoverErrorState message={discoverError || 'Current app information is unavailable. Refresh it before installing apps.'} onRetry={() => void Promise.all([applicationState.refresh(), refreshDiscover()]).catch(() => {})} title="Discover catalog could not load" />
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
        error={discoverError || (progressError ? 'Job progress could not refresh. This does not mean the operation failed.' : '')}
        lastRefreshAt={lastRefreshAt}
        onRefresh={() => void Promise.all([applicationState.refresh(), refreshDiscover(), retryProgress()]).catch(() => {})}
        refreshing={appsQuery.isFetching}
      />

      <ExtensionSlot
        className="shrink-0"
        extensionId="autark-pro"
        surface="discover.insights"
      />


      <ExtensionActionTarget actionId="review-app" className="min-h-0 flex-1" routeId="discover">
        <section className="relative grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-2xl border border-sky-300/20 bg-slate-900 shadow-lg shadow-slate-950/20 xl:grid-cols-[12rem_minmax(0,1fr)_19rem] xl:grid-rows-1">
        <MarketplaceBrowseSidebar
          filterValue={discoverFilterValue}
          filters={discoverFilters}
          onFilterChange={changeDiscoverFilter}
        />

        <section className="flex min-h-0 flex-col border-b border-sky-300/15 xl:border-b-0">
          <MarketplaceCatalogToolbar
            onSearchChange={setSearchQuery}
            onSortChange={setSortBy}
            onStatusFilterChange={setStatusFilter}
            searchValue={searchQuery}
            sortBy={sortBy}
            statusFilter={statusFilter}
          />
          <MarketplaceAppList
            apps={visibleApps}
            installingAppId={installJob && !terminalJob(installJob) ? installJob.subjectId ?? null : null}
            onRestoreStarterGuidance={canRestoreStarterGuidance ? restoreStartHere : undefined}
            onSelect={selectApp}
            selectedAppId={selectedView?.application.id ?? ''}
            starterGuidance={starterGuidanceVisible && starterRecommendation ? {
              appName: starterRecommendation.app.name,
              onDismiss: dismissStartHere,
              onReview: () => openAppDetails(starterRecommendation.app.id),
            } : null}
          />
        </section>

        {detailsOpen && (
          <button
            aria-label="Close app details backdrop"
            className="absolute inset-0 z-20 bg-slate-950/35 backdrop-blur-sm"
            onClick={closeAppDetails}
            type="button"
          />
        )}

        {selectedView && (
          <MarketplaceAppRail
            appView={selectedView}
            detailsOpen={detailsOpen}
            hasAppSettings={selectedAppHasSettings}
            installLocked={selectedAppInstallLocked}
            installStatusMessage={installStatusMessage}
            installing={selectedAppInstalling}
            onConfigureSettings={() => setSettingsOpen(true)}
            onDetailsOpenChange={(open) => open ? openAppDetails(selectedView.application.id) : closeAppDetails()}
            onInstallSecondCopy={() => {
              setDuplicateAcknowledgedAppId(selectedView.application.id);
              openInstallReview();
            }}
            onReviewInstall={openInstallReview}
          />
        )}
        </section>
      </ExtensionActionTarget>

      {selectedView && selectedAppHasSettings && (
        <MarketplaceAppSettingsDialog
          appName={selectedView.application.name}
          answers={setupAnswers}
          issues={installPreview?.blockingIssues}
          onAnswersChange={changeSetupAnswers}
          onOpenChange={setSettingsOpen}
          open={settingsOpen}
          schema={selectedView.setupSchema}
        />
      )}

      {detailView && !wideRailLayout && (
        <MarketplaceAppDetail
          app={detailView.app}
          appView={detailView}
          backupJob={backupJob?.subjectId === detailView.application.id ? backupJob : null}
          installJob={installJob?.subjectId === detailView.application.id ? installJob : null}
          installLocked={selectedAppInstallLocked}
          installOptions={installOptions ?? fallbackInstallOptions}
          installPlan={installPlan}
          installPreview={installPreview}
          installStatusMessage={installStatusMessage}
          installing={selectedAppInstalling}
          installedApp={detailView.application.relationship === 'managed' ? detailView.application : null}
          onBack={closeAppDetails}
          onCreateBackup={createFirstBackup}
          onDuplicateInstallAcknowledged={() => setDuplicateAcknowledgedAppId(detailView.application.id)}
          onInstall={(options) => installApp(detailView.application.id, options)}
          onOpenSettings={() => setSettingsOpen(true)}
          onReinstallCurrent={reinstallWithCurrentSettings}
          onRequestPlan={(options) => requestPlan(detailView.application.id, options)}
          recoveryMode={recoveryAppId === detailView.application.id ? recoveryMode : null}
          hasAppSettings={selectedAppHasSettings}
          setupAnswers={setupAnswers}
          setupReady={installPreview?.valid ?? true}
          setupSchema={detailView.setupSchema}
        />
      )}

      {selectedView && wideRailLayout && selectedView.application.relationship !== 'managed' && (
        <InstallWizard
          app={selectedView.app}
          hasAppSettings={selectedAppHasSettings}
          hideTrigger
          installLocked={selectedAppInstallLocked || !(installPreview?.valid ?? true)}
          installOptions={installOptions ?? fallbackInstallOptions}
          installPlan={installPlan}
          installPreview={installPreview}
          installStatusMessage={!(installPreview?.valid ?? true) ? 'Finish the required app settings before installing.' : installStatusMessage}
          installing={selectedAppInstalling}
          onInstall={(options) => installApp(selectedView.application.id, options)}
          onOpenChange={setInstallReviewOpen}
          onOpenSettings={() => setSettingsOpen(true)}
          open={installReviewOpen}
          setupAnswers={setupAnswers}
          setupSchema={selectedView.setupSchema}
        />
      )}
    </PageShell>
  );
}

function DiscoverGuidedHeader({ error, lastRefreshAt, onRefresh, refreshing }: {
  error: string;
  lastRefreshAt: Date | null;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <header className="rounded-2xl border border-sky-300/15 bg-app-header-surface/90 p-3 text-slate-50 shadow-xl shadow-slate-950/20 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="hidden size-10 shrink-0 place-items-center rounded-xl border border-cyan-300/35 bg-cyan-400/10 text-cyan-200 sm:grid">
            <Sparkles className="size-5" />
          </span>
          <h1 className="m-0 text-3xl font-semibold tracking-tight text-white sm:text-[2.1rem]">Discover</h1>
        </div>

        <div className="flex min-h-10 flex-wrap items-center gap-2">
          <Dialog>
            <DialogTrigger asChild>
          <ProjectDarkControlButton aria-label="How installs work" className="border-sky-300/15 bg-slate-950/25 text-sky-100/70 hover:border-cyan-300/30 hover:bg-slate-950/40 hover:text-white" size="icon" type="button">
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

          <RefreshStatus error={error} onRefresh={onRefresh} refreshing={refreshing} updatedAt={lastRefreshAt} />
        </div>
      </div>

    </header>
  );
}

function MarketplaceBrowseSidebar({
  filterValue,
  filters,
  onFilterChange,
}: {
  filterValue: string;
  filters: Array<{ label: string; value: string }>;
  onFilterChange: (filter: string) => void;
}) {
  return (
    <aside className="flex min-h-0 flex-col border-b border-sky-300/15 bg-slate-950/30 p-3 xl:border-b-0 xl:border-r">
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-sky-100/65">Browse</p>
      <div aria-label="Discover filters" className="mt-2 grid gap-1">
        {filters.map((filter) => (
          <button
            aria-pressed={filterValue === filter.value}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300',
              filterValue === filter.value ? 'bg-cyan-300/15 text-cyan-100' : 'text-sky-100/70 hover:bg-slate-800 hover:text-white',
            )}
            key={filter.value}
            onClick={() => onFilterChange(filter.value)}
            type="button"
          >
            <span className={cn('size-1.5 rounded-full', filterValue === filter.value ? 'bg-cyan-200' : 'bg-sky-100/55')} />
            <span className="truncate">{filter.label}</span>
          </button>
        ))}
      </div>

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
  return apps.find((view) => view.application.id === job.subjectId)?.application.name || job.subjectId || 'this app';
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
