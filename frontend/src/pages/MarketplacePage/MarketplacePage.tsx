import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Bell, CheckCircle2, Filter, Info, RefreshCw, Search, Sparkles, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageErrorState, PageLoadingState } from '@/components/project-os/PageState';
import { PageShell } from '@/components/project-os/ProjectOSComponents';
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
import { Input } from '@/components/ui/input';
import { apiErrorMessage } from '@/api/httpClient';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { poButtonClass, poCardClass } from '@/lib/projectOsStyleKit';
import { cn } from '@/lib/utils';
import {
  useDiscoverAppsQuery,
  useDiscoverBackupMutation,
  useDiscoverInstallMutation,
  useDiscoverInstallPreviewQuery,
  useDiscoverJobQuery,
  useDiscoverJobsQuery,
  useDiscoverReadinessQuery,
  useMarketplaceActivityQuery,
  latestActiveDiscoverJob,
} from '@/repositories/discoverRepository';
import type { ActivityLog } from '@/types/activity';
import type { DiscoverAppView } from '@/types/discover';
import type { ProjectOsJob } from '@/types/jobs';
import type { InstallOptions, InstallPlan, MarketplaceApp } from '@/types/marketplace';
import { categories } from './extensions/MarketplacePage.constants';
import {
  START_HERE_DISMISSAL_KEY,
  formatMarketplaceActivityTime,
  marketplaceActivityTone,
  marketplaceVisibleAppViews,
  starterCatalogForDiscover,
  shouldShowStartHereSection,
  starterAppsForMarketplace,
} from './extensions/MarketplacePage.logic';
import { MarketplaceAppDetail } from './MarketplaceAppDetail';
import { MarketplaceAppList } from './MarketplaceAppList';
import { defaultAnswersFromSchema } from './MarketplaceSetupPanel';

type StarterRecommendation = {
  app: MarketplaceApp;
  installed: boolean;
  notes: string[];
  readiness: 'ready' | 'blocked' | 'review';
};

function MarketplacePage() {
  const { showAdvancedMetrics } = useProjectSettings();
  const [searchParams] = useSearchParams();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedAppId, setSelectedAppId] = useState('vaultwarden');
  const [sortBy, setSortBy] = useState('Recommended');
  const [searchQuery, setSearchQuery] = useState('');
  const [hideInstalled, setHideInstalled] = useState(false);
  const [marketplaceError, setMarketplaceError] = useState('');
  const [setupAnswers, setSetupAnswers] = useState<Record<string, unknown>>({});
  const [setupAnswersAppId, setSetupAnswersAppId] = useState<string | null>(null);
  const [installJob, setInstallJob] = useState<ProjectOsJob | null>(null);
  const [backupJob, setBackupJob] = useState<ProjectOsJob | null>(null);
  const [duplicateAcknowledgedAppId, setDuplicateAcknowledgedAppId] = useState<string | null>(null);
  const [startHereDismissed, setStartHereDismissed] = useState(() => readStartHereDismissed());
  const recoveryAppId = searchParams.get('app');
  const recoveryMode = searchParams.get('mode');
  const appsQuery = useDiscoverAppsQuery();
  const activityQuery = useMarketplaceActivityQuery();
  const readinessQuery = useDiscoverReadinessQuery();
  const jobsQuery = useDiscoverJobsQuery();
  const installMutation = useDiscoverInstallMutation();
  const backupMutation = useDiscoverBackupMutation();
  const apps = appsQuery.data ?? [];
  const marketplaceActivity = activityQuery.data ?? [];
  const onboarding = readinessQuery.data?.onboarding ?? null;
  const doctor = readinessQuery.data?.doctor ?? null;
  const storage = readinessQuery.data?.storage ?? null;
  const lastRefreshAt = appsQuery.dataUpdatedAt > 0 ? new Date(appsQuery.dataUpdatedAt) : null;
  const installedById = useMemo(() => new Map(apps.filter((app) => app.state === 'installed_managed' && app.installedApp).map((app) => [app.id, app.installedApp])), [apps]);
  const catalogApps = useMemo(() => {
    if (showAdvancedMetrics) {
      return apps;
    }
    const starterIds = new Set(starterCatalogForDiscover(apps.map((view) => view.app)).map((app) => app.id));
    return apps.filter((view) => starterIds.has(view.id));
  }, [apps, showAdvancedMetrics]);
  const selectedView = useMemo(() => apps.find((app) => app.id === selectedAppId) ?? catalogApps[0] ?? apps[0], [apps, catalogApps, selectedAppId]);
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
  const recoveredInstallJob = useMemo(() => latestActiveDiscoverJob(jobsQuery.data ?? [], ['install_app']), [jobsQuery.data]);
  const recoveredBackupJob = useMemo(() => latestActiveDiscoverJob(jobsQuery.data ?? [], ['backup']), [jobsQuery.data]);
  const trackedInstallJob = installJob && !terminalJob(installJob) ? installJob : recoveredInstallJob ?? installJob;
  const trackedBackupJob = backupJob && !terminalJob(backupJob) ? backupJob : recoveredBackupJob ?? backupJob;
  const activeInstallJobId = trackedInstallJob && !terminalJob(trackedInstallJob) ? trackedInstallJob.jobId : null;
  const activeBackupJobId = trackedBackupJob && !terminalJob(trackedBackupJob) ? trackedBackupJob.jobId : null;
  const installJobQuery = useDiscoverJobQuery(activeInstallJobId);
  const backupJobQuery = useDiscoverJobQuery(activeBackupJobId);
  const installPreview = installPreviewQuery.data ?? null;
  const installPlan = installPreview?.technicalDetails ?? null;
  const installOptions = installPreview?.installOptions ?? null;
  const planLoading = installPreviewQuery.isFetching;

  const discoverError = marketplaceError || (appsQuery.error ? apiErrorMessage(appsQuery.error) : '');

  const refreshDiscover = useCallback(async () => {
    await Promise.all([
      appsQuery.refetch(),
      activityQuery.refetch(),
      readinessQuery.refetch(),
    ]);
  }, [activityQuery.refetch, appsQuery.refetch, readinessQuery.refetch]);

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

  useEffect(() => {
    if (!recoveredInstallJob || (installJob && !terminalJob(installJob))) {
      return;
    }
    setInstallJob(recoveredInstallJob);
    if (recoveredInstallJob.subjectId) {
      setSelectedAppId(recoveredInstallJob.subjectId);
    }
  }, [installJob, recoveredInstallJob]);

  useEffect(() => {
    if (!recoveredBackupJob || (backupJob && !terminalJob(backupJob))) {
      return;
    }
    setBackupJob(recoveredBackupJob);
  }, [backupJob, recoveredBackupJob]);

  useEffect(() => {
    if (!installJobQuery.data) {
      return;
    }
    setInstallJob(installJobQuery.data);
    if (terminalJob(installJobQuery.data)) {
      void refreshDiscover();
    }
  }, [installJobQuery.data, refreshDiscover]);

  useEffect(() => {
    if (!installJobQuery.error) {
      return;
    }
    setMarketplaceError(apiErrorMessage(installJobQuery.error, 'Install progress could not be refreshed.'));
  }, [installJobQuery.error]);

  useEffect(() => {
    if (!backupJobQuery.data) {
      return;
    }
    setBackupJob(backupJobQuery.data);
    if (terminalJob(backupJobQuery.data)) {
      void refreshDiscover();
    }
  }, [backupJobQuery.data, refreshDiscover]);

  useEffect(() => {
    if (!backupJobQuery.error) {
      return;
    }
    setMarketplaceError(apiErrorMessage(backupJobQuery.error, 'Backup progress could not be refreshed.'));
  }, [backupJobQuery.error]);

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

  function selectRecommendedApp(appId: string) {
    setSearchQuery('');
    setSelectedCategory('All');
    setSelectedAppId(appId);
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
      <PageShell>
        {discoverError ? (
          <PageErrorState message={discoverError} onRetry={refreshDiscover} title="Discover catalog could not load" />
        ) : (
          <PageLoadingState label="Loading marketplace" sublabel="Checking the catalog, installed apps, and recent marketplace activity." />
        )}
      </PageShell>
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

      {discoverError && <PageErrorState className="mb-5" message={discoverError} onRetry={refreshDiscover} title="Discover action needs attention" />}
      <InstallJobBanner apps={apps} installJob={installJob} selectedAppId={selectedApp.id} />

      {showStartHere && (
        <StarterAppHandoff
          recommendations={starterRecommendations}
          onDismiss={dismissStartHere}
          onSelect={selectRecommendedApp}
        />
      )}

      <div className="mb-6 grid gap-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <Input className="h-13 border-slate-700/40 bg-slate-900/70 pl-11 text-white placeholder:text-slate-500 focus-visible:border-sky-300 focus-visible:ring-sky-700/30" onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search by name, purpose, or category..." type="search" value={searchQuery} />
        </label>
        <div aria-label="Discover filters" className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 text-sm text-slate-500">
            <Filter className="size-4" />
            {showAdvancedMetrics ? 'Show' : 'Starter catalog'}
          </span>
          {showAdvancedMetrics && categories.map((category) => (
            <Button className={cn('h-9 border-slate-700/40 bg-slate-900/65 px-4 text-slate-300 hover:bg-slate-800 hover:text-white', selectedCategory === category && 'border-sky-300/40 bg-sky-600/20 text-sky-100 hover:bg-sky-600/25')} key={category} onClick={() => setSelectedCategory(category)} type="button" variant="outline">
              {category}
            </Button>
          ))}
          <Button className={cn('h-9 border-slate-700/40 bg-slate-900/65 px-4 text-slate-300 hover:bg-slate-800 hover:text-white', hideInstalled && 'border-sky-300/40 bg-sky-600/15 text-sky-100 hover:bg-sky-600/20')} onClick={() => setHideInstalled((value) => !value)} type="button" variant="outline">
            {hideInstalled ? 'Showing new apps only' : 'Hide installed'}
          </Button>
          {canRestoreStartHere && (
            <Button className="h-9 border-slate-700/40 bg-slate-900/65 px-4 text-slate-300 hover:bg-slate-800 hover:text-white" onClick={restoreStartHere} type="button" variant="outline">
              Show Start here
            </Button>
          )}
        </div>
      </div>

      <div className="grid items-start gap-6 2xl:grid-cols-[minmax(620px,1fr)_minmax(420px,560px)]">
        <MarketplaceAppList apps={visibleApps} density={showAdvancedMetrics ? 'full' : 'basic'} modeLabel={showAdvancedMetrics ? 'All apps' : 'Starter apps'} onSelect={setSelectedAppId} onSortChange={setSortBy} selectedAppId={selectedApp.id} sortBy={sortBy} />
        <MarketplaceAppDetail app={selectedApp} appView={selectedView} backupJob={backupJob?.subjectId === selectedApp.id ? backupJob : null} installJob={installJob?.subjectId === selectedApp.id ? installJob : null} installLocked={selectedAppInstallLocked} installOptions={installOptions ?? fallbackInstallOptions} installPreview={installPreview} installStatusMessage={installStatusMessage} installing={selectedAppInstalling} installPlan={installPlan} installedApp={selectedInstalledApp} onBack={() => { setSearchQuery(''); setSelectedCategory('All'); }} onCreateBackup={createFirstBackup} onDuplicateInstallAcknowledged={() => setDuplicateAcknowledgedAppId(selectedApp.id)} onInstall={(options) => installApp(selectedApp.id, options)} onReinstallCurrent={reinstallWithCurrentSettings} onRequestPlan={(options) => requestPlan(selectedApp.id, options)} onSetupAnswersChange={changeSetupAnswers} planLoading={planLoading} recoveryMode={recoveryAppId === selectedApp.id ? recoveryMode : null} setupAnswers={setupAnswers} setupReady={installPreview?.valid ?? true} setupSchema={selectedView.setupSchema} />
      </div>
    </PageShell>
  );
}

function InstallJobBanner({ apps, installJob, selectedAppId }: { apps: DiscoverAppView[]; installJob: ProjectOsJob | null; selectedAppId: string }) {
  if (!installJob || installJob.subjectId !== selectedAppId) {
    return null;
  }
  if (!terminalJob(installJob)) {
    return (
      <div className="mb-5 rounded-lg border border-sky-300/25 bg-sky-500/10 p-4 text-sm text-sky-100">
        <p className="font-semibold text-white">Installing {appNameForJob(installJob, apps)}</p>
        <p className="mt-1">{currentJobStep(installJob) || 'Project OS is preparing this app.'}</p>
      </div>
    );
  }
  if (installJob.status === 'failed') {
    return (
      <div className="mb-5 rounded-lg border border-red-300/25 bg-red-500/10 p-4 text-sm text-red-100">
        <p className="font-semibold text-white">Install failed for {appNameForJob(installJob, apps)}</p>
        <p className="mt-1">{installJob.error?.message || 'Project OS could not finish the install.'}</p>
      </div>
    );
  }
  if (installJob.status === 'succeeded') {
    return (
      <div className="mb-5 rounded-lg border border-sky-300/25 bg-sky-500/10 p-4 text-sm text-sky-100">
        <p className="font-semibold text-white">{appNameForJob(installJob, apps)} is ready</p>
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
    <header className="mb-5 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/65 p-5 text-slate-100 shadow-po-panel">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex max-w-3xl gap-4">
          <span className="hidden size-12 shrink-0 place-items-center rounded-2xl border border-sky-300/20 bg-sky-500/15 text-sky-100 sm:grid">
            <Sparkles className="size-6" />
          </span>
          <div>
            <Badge className="border-sky-300/25 bg-sky-500/10 text-sky-100" variant="outline">Discover</Badge>
            <h2 className="mt-3 text-3xl font-bold leading-none text-white md:text-4xl">Discover Apps</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Install useful self-hosted apps without managing Docker by hand.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 xl:justify-end">
          <Dialog>
            <DialogTrigger asChild>
              <Button className={poButtonClass('quiet')} type="button" variant="outline">
                <Info className="size-4" />
                How installs work
              </Button>
            </DialogTrigger>
            <DialogContent className="border-slate-700 bg-slate-950 text-slate-100 sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>How Project OS installs apps</DialogTitle>
                <DialogDescription className="text-slate-400">
                  Project OS shows a plan before anything changes, then prepares the app with managed storage, local access, health checks, and backup defaults.
                </DialogDescription>
              </DialogHeader>
              <ol className="grid gap-3 text-sm text-slate-300">
                {['Pick an app that fits what you want to do.', 'Review setup choices and any host readiness notes.', 'Confirm the install plan before Project OS changes this server.', 'Open the app from My Apps and create a first restore point.'].map((step, index) => (
                  <li className="grid grid-cols-[28px_1fr] gap-3" key={step}>
                    <span className="grid size-7 place-items-center rounded-full border border-sky-300/25 bg-sky-500/10 text-xs font-bold text-sky-100">{index + 1}</span>
                    <span className="leading-6">{step}</span>
                  </li>
                ))}
              </ol>
            </DialogContent>
          </Dialog>

          <Button className={poButtonClass('quiet')} onClick={onRefresh} type="button" variant="outline">
            <RefreshCw className="size-4" />
            Refresh
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button aria-label="Discover activity" className={poButtonClass('quietIcon')} size="icon" type="button" variant="outline">
                <Bell className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 border-slate-700 bg-slate-950 text-slate-100">
              <DropdownMenuLabel>Discover activity</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-slate-800" />
              <div className="grid max-h-80 gap-2 overflow-y-auto px-2 py-1.5 text-sm">
                <div className="rounded-md border border-slate-800 bg-slate-900/60 p-2 text-xs text-slate-400">
                  {appCount} apps shown - Last checked {lastRefreshAt ? lastRefreshAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'not yet'}
                </div>
                {marketplaceActivity.length ? marketplaceActivity.map((event) => (
                  <div className="rounded-md border border-slate-800 bg-slate-900/50 p-2" key={event.id}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn('text-xs font-semibold uppercase tracking-wide', marketplaceActivityTone(event.level))}>{event.outcome.replace('_', ' ')}</span>
                      <span className="text-xs text-slate-500">{formatMarketplaceActivityTime(event.createdAt)}</span>
                    </div>
                    <p className="mt-1 font-medium text-slate-100">{event.title}</p>
                    {event.message && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{event.message}</p>}
                  </div>
                )) : (
                  <div className="rounded-md border border-slate-800 bg-slate-900/50 p-3 text-sm text-slate-400">
                    No Discover activity has been recorded yet.
                  </div>
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-sky-300/20 bg-sky-500/10 p-4">
        <p className="text-xs font-semibold uppercase tracking-normal text-sky-200">Recommended path</p>
        <p className="mt-2 text-sm leading-6 text-slate-200">
          Pick an app, review the setup, and Project OS will prepare storage, networking, health checks, and backups.
        </p>
      </div>
    </header>
  );
}

function StarterAppHandoff({ onDismiss, onSelect, recommendations }: { onDismiss: () => void; onSelect: (appId: string) => void; recommendations: StarterRecommendation[] }) {
  const blocked = recommendations.some((recommendation) => recommendation.readiness === 'blocked');
  return (
    <section className="mb-5 rounded-2xl border border-sky-300/20 bg-sky-500/10 p-5 shadow-po-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-normal text-sky-200">Start here</p>
          <h3 className="mt-2 text-2xl font-black text-white">Start with these apps</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            Reliable first installs based on your onboarding choices, with a few safe defaults when you have not picked starter apps yet.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={blocked ? 'border-amber-300/25 bg-amber-500/10 text-amber-100' : 'border-sky-300/25 bg-sky-500/10 text-sky-100'} variant="outline">
            {blocked ? 'Readiness review needed' : 'Ready to review'}
          </Badge>
          <Button aria-label="Hide Start here" className={poButtonClass('quietIcon')} onClick={onDismiss} size="icon" type="button" variant="outline">
            <X className="size-4" />
          </Button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {recommendations.map((recommendation) => (
          <article className={poCardClass('normal', 'bg-slate-950/55')} key={recommendation.app.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="font-bold text-white">{recommendation.app.name}</h4>
                <p className="mt-1 text-sm text-slate-400">{recommendation.app.shortValue || recommendation.app.plainLanguage}</p>
              </div>
              {recommendation.installed ? (
                <Badge className="border-sky-300/25 bg-sky-500/10 text-sky-100" variant="outline">Installed</Badge>
              ) : (
                <Badge className={recommendation.readiness === 'ready' ? 'border-sky-300/25 bg-sky-500/10 text-sky-100' : recommendation.readiness === 'blocked' ? 'border-amber-300/25 bg-amber-500/10 text-amber-100' : 'border-sky-300/25 bg-sky-500/10 text-sky-100'} variant="outline">
                  {recommendation.readiness === 'ready' ? 'Ready' : recommendation.readiness === 'blocked' ? 'Needs setup' : 'Review'}
                </Badge>
              )}
            </div>
            <div className="mt-3 grid gap-2 text-sm text-slate-300">
              {recommendation.notes.map((note) => (
                <div className="flex gap-2" key={note}>
                  {recommendation.readiness === 'ready' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-sky-300" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" />}
                  <span>{note}</span>
                </div>
              ))}
            </div>
            <Button className={poButtonClass('primary', 'mt-4 w-full')} disabled={recommendation.installed} onClick={() => onSelect(recommendation.app.id)} type="button">
              <Sparkles className="size-4" />
              {recommendation.installed ? 'Already installed' : 'Review install'}
            </Button>
          </article>
        ))}
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

function terminalJob(job: ProjectOsJob) {
  return ['succeeded', 'failed', 'cancelled'].includes(job.status);
}

function currentJobStep(job: ProjectOsJob) {
  const step = job.steps.find((candidate) => candidate.id === job.currentStep) ?? job.steps.find((candidate) => candidate.status === 'running') ?? job.steps.find((candidate) => candidate.status === 'pending');
  if (!step) {
    return '';
  }
  return step.message || step.label;
}

function appNameForJob(job: ProjectOsJob, apps: DiscoverAppView[]) {
  return apps.find((app) => app.id === job.subjectId)?.name || job.subjectId || 'this app';
}
