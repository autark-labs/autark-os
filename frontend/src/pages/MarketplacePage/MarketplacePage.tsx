import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Bell, CheckCircle2, Filter, RefreshCw, Search, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageErrorState, PageLoadingState } from '@/components/project-os/PageState';
import { PageShell } from '@/components/project-os/ProjectOSComponents';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ActivityAPIClient } from '@/api/ActivityAPIClient';
import { BackupAPIClient } from '@/api/BackupAPIClient';
import { HostInventoryAPIClient } from '@/api/HostInventoryAPIClient';
import { InstalledAppsAPIClient } from '@/api/InstalledAppsAPIClient';
import { JobsAPIClient } from '@/api/JobsAPIClient';
import { MarketplaceAPIClient } from '@/api/MarketplaceAPIClient';
import { MarketplaceInstallClient } from '@/api/MarketplaceInstallClient';
import { SystemAPIClient } from '@/api/SystemAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { poButtonClass, poCardClass } from '@/lib/projectOsStyleKit';
import { cn } from '@/lib/utils';
import type { AppRuntimeView, InstallSettings } from '@/types/app';
import type { ActivityLog } from '@/types/activity';
import type { HostInventoryResource } from '@/types/host';
import type { ProjectOsJob } from '@/types/jobs';
import type { InstallOptions, InstallPlan, MarketplaceApp } from '@/types/marketplace';
import type { OnboardingState, StorageReport, SystemDoctorStatus } from '@/types/system';
import { categories } from './extensions/MarketplacePage.constants';
import { defaultInstallOptions } from './extensions/MarketplacePage.installation';
import {
  formatMarketplaceActivityTime,
  marketplaceActivityTone,
  marketplaceVisibleApps,
  starterCatalogForDiscover,
  optionsFromInstalledSettings,
  starterAppsForMarketplace,
} from './extensions/MarketplacePage.logic';
import { MarketplaceAppDetail } from './MarketplaceAppDetail';
import { MarketplaceAppList } from './MarketplaceAppList';

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
  const [apps, setApps] = useState<MarketplaceApp[]>([]);
  const [installedApps, setInstalledApps] = useState<AppRuntimeView[]>([]);
  const [hostInventory, setHostInventory] = useState<HostInventoryResource[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [doctor, setDoctor] = useState<SystemDoctorStatus | null>(null);
  const [storage, setStorage] = useState<StorageReport | null>(null);
  const [hideInstalled, setHideInstalled] = useState(false);
  const [marketplaceError, setMarketplaceError] = useState('');
  const [installPlan, setInstallPlan] = useState<InstallPlan | null>(null);
  const [installOptions, setInstallOptions] = useState<InstallOptions | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [installJob, setInstallJob] = useState<ProjectOsJob | null>(null);
  const [backupJob, setBackupJob] = useState<ProjectOsJob | null>(null);
  const [marketplaceActivity, setMarketplaceActivity] = useState<ActivityLog[]>([]);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  const recoveryAppId = searchParams.get('app');
  const recoveryMode = searchParams.get('mode');
  const installedById = useMemo(() => new Map(installedApps.map((app) => [app.appId, app])), [installedApps]);
  const foundResourcesByAppId = useMemo(() => new Map(hostInventory
    .filter((resource) => resource.catalogAppId && resource.ownershipState !== 'owned_managed' && !resource.ignored)
    .map((resource) => [resource.catalogAppId, resource])), [hostInventory]);
  const catalogApps = useMemo(() => showAdvancedMetrics ? apps : starterCatalogForDiscover(apps), [apps, showAdvancedMetrics]);
  const selectedApp = useMemo(() => apps.find((app) => app.id === selectedAppId) ?? catalogApps[0] ?? apps[0], [apps, catalogApps, selectedAppId]);
  const selectedInstalledApp = selectedApp ? installedById.get(selectedApp.id) ?? null : null;

  const loadApps = useCallback(async () => {
    try {
      const [nextApps, nextInstalledApps, nextActivity, nextHostInventory] = await Promise.all([
        MarketplaceAPIClient.listApps(),
        InstalledAppsAPIClient.listApps(),
        ActivityAPIClient.recent({ category: 'marketplace', limit: 8 }),
        HostInventoryAPIClient.list(false),
      ]);
      const [nextOnboarding, nextDoctor, nextStorage] = await Promise.all([
        SystemAPIClient.onboarding().catch((error) => {
          console.warn('Unable to load starter app recommendations.', error);
          return null;
        }),
        SystemAPIClient.doctor().catch((error) => {
          console.warn('Unable to load install readiness.', error);
          return null;
        }),
        SystemAPIClient.storage().catch((error) => {
          console.warn('Unable to load storage readiness.', error);
          return null;
        }),
      ]);
      setApps(nextApps);
      setInstalledApps(nextInstalledApps);
      setHostInventory(nextHostInventory);
      setOnboarding(nextOnboarding);
      setDoctor(nextDoctor);
      setStorage(nextStorage);
      setMarketplaceActivity(nextActivity);
      setLastRefreshAt(new Date());
      setMarketplaceError('');
      setSelectedAppId((currentAppId) => {
        if (nextApps.length > 0 && !nextApps.some((app) => app.id === currentAppId)) {
          return nextApps[0].id;
        }
        return currentAppId;
      });
    } catch (error) {
      setMarketplaceError(apiErrorMessage(error));
    }
  }, []);

  const requestPlan = useCallback(async (appId = selectedApp?.id, options: InstallOptions | null = null) => {
    if (!appId) {
      return;
    }
    setPlanLoading(true);
    try {
      setInstallPlan(await MarketplaceInstallClient.plan(appId, options ?? {}));
      setMarketplaceError('');
    } catch (error) {
      setMarketplaceError(apiErrorMessage(error));
    } finally {
      setPlanLoading(false);
    }
  }, [selectedApp?.id]);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

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
    setInstallPlan(null);
    const app = apps.find((nextApp) => nextApp.id === selectedAppId);
    if (app) {
      const defaults = defaultInstallOptions(app);
      setInstallOptions(defaults);
      requestPlan(selectedAppId, defaults);
    }
  }, [apps, requestPlan, selectedAppId]);

  useEffect(() => {
    if (!installJob || terminalJob(installJob)) {
      return undefined;
    }
    const interval = window.setInterval(async () => {
      try {
        const nextJob = await JobsAPIClient.get(installJob.jobId);
        setInstallJob(nextJob);
        if (terminalJob(nextJob)) {
          setInstalledApps(await InstalledAppsAPIClient.listApps());
          setMarketplaceActivity(await ActivityAPIClient.recent({ category: 'marketplace', limit: 8 }));
        }
      } catch (error) {
        setMarketplaceError(apiErrorMessage(error, 'Install progress could not be refreshed.'));
      }
    }, 1200);
    return () => window.clearInterval(interval);
  }, [installJob]);

  useEffect(() => {
    if (!backupJob || terminalJob(backupJob)) {
      return undefined;
    }
    const interval = window.setInterval(async () => {
      try {
        const nextJob = await JobsAPIClient.get(backupJob.jobId);
        setBackupJob(nextJob);
        if (terminalJob(nextJob)) {
          setInstalledApps(await InstalledAppsAPIClient.listApps());
        }
      } catch (error) {
        setMarketplaceError(apiErrorMessage(error, 'Backup progress could not be refreshed.'));
      }
    }, 1200);
    return () => window.clearInterval(interval);
  }, [backupJob]);

  async function installApp(appId = selectedApp?.id, options = installOptions, mode: 'install' | 'reinstall' | 'reset-reinstall' = 'install') {
    if (!appId) {
      return;
    }
    const app = apps.find((candidate) => candidate.id === appId);
    const foundResource = foundResourcesByAppId.get(appId);
    if (foundResource) {
      setMarketplaceError(`${app?.name || appId} already exists on this server but is not managed by this Project OS installation. Review existing apps before installing a duplicate.`);
      return;
    }
    if (installJob && !terminalJob(installJob) && installJob.subjectId !== appId) {
      setMarketplaceError(`${appNameForJob(installJob, apps)} is installing. Finish that install before starting ${app?.name || appId}.`);
      return;
    }
    try {
      setInstallJob(await MarketplaceInstallClient.install(appId, options ?? {}));
      setMarketplaceError('');
    } catch (error) {
      const message = apiErrorMessage(error);
      setMarketplaceError(message);
    }
  }

  async function createFirstBackup(appId: string) {
    try {
      setBackupJob(await BackupAPIClient.run(appId));
      setMarketplaceError('');
    } catch (error) {
      setMarketplaceError(apiErrorMessage(error, 'Backup could not be started.'));
    }
  }

  function reinstallWithCurrentSettings() {
    if (!selectedApp || !selectedInstalledApp) {
      return;
    }
    return installApp(selectedApp.id, { ...optionsFromInstalledSettings(selectedInstalledApp.settings, installOptions ?? defaultInstallOptions(selectedApp)), reinstall: true }, 'reinstall');
  }

  function resetAndReinstall() {
    if (!selectedApp) {
      return;
    }
    return installApp(selectedApp.id, { ...defaultInstallOptions(selectedApp), reinstall: true }, 'reset-reinstall');
  }

  const visibleApps = marketplaceVisibleApps({
    apps: catalogApps,
    hideInstalled,
    installedAppIds: new Set(installedById.keys()),
    searchQuery,
    selectedCategory,
    sortBy,
  }) as MarketplaceApp[];
  const selectedAppInstalling = Boolean(installJob && !terminalJob(installJob) && installJob.subjectId === selectedApp?.id);
  const selectedAppInstallLocked = Boolean(selectedApp && installJob && !terminalJob(installJob) && installJob.subjectId !== selectedApp.id);
  const installStatusMessage = selectedAppInstallLocked && installJob ? `${appNameForJob(installJob, apps)} is installing. Finish that install before starting another app.` : '';
  const starterRecommendations = useMemo(
    () => onboarding?.status === 'complete' ? starterAppsForMarketplace(apps, onboarding.recommendedApps, installedById, doctor, storage) as StarterRecommendation[] : [],
    [apps, doctor, installedById, onboarding?.recommendedApps, onboarding?.status, storage],
  );

  function selectRecommendedApp(appId: string) {
    setSearchQuery('');
    setSelectedCategory('All');
    setSelectedAppId(appId);
    const app = apps.find((candidate) => candidate.id === appId);
    if (app) {
      const defaults = defaultInstallOptions(app);
      setInstallOptions(defaults);
      requestPlan(appId, defaults);
    }
  }

  if (!selectedApp) {
    return (
      <PageShell>
        {marketplaceError ? (
          <PageErrorState message={marketplaceError} onRetry={loadApps} title="Discover catalog could not load" />
        ) : (
          <PageLoadingState label="Loading marketplace" sublabel="Checking the catalog, installed apps, and recent marketplace activity." />
        )}
      </PageShell>
    );
  }

  return (
    <PageShell>
      <header className="mb-2 overflow-hidden rounded-2xl border border-violet-300/18 bg-po-hero-marketplace p-6 shadow-po-brand-glow">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
        <div className="flex gap-4">
          <span className="hidden size-12 shrink-0 place-items-center rounded-2xl border border-violet-300/20 bg-violet-500/15 text-violet-100 shadow-po-brand-glow sm:grid">
            <Sparkles className="size-6" />
          </span>
          <div>
          <h2 className="text-3xl font-bold leading-none text-white md:text-4xl">Discover</h2>
          <p className="mt-3 max-w-3xl text-slate-300">
            Start with a short list of ready self-hosted apps. Advanced mode shows the broader catalog when you want more choices.
          </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 xl:justify-end">
          <Button className={poButtonClass('quiet', 'bg-slate-900/80 text-slate-100')} onClick={loadApps} type="button" variant="outline">
            <RefreshCw className="size-4" />
            Refresh
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button aria-label="Notifications" className={poButtonClass('quietIcon', 'bg-slate-900/80 text-slate-100')} size="icon" type="button" variant="outline">
                <Bell className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 border-slate-700 bg-slate-950 text-slate-100">
              <DropdownMenuLabel>Discover activity</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-slate-800" />
              <div className="grid max-h-80 gap-2 overflow-y-auto px-2 py-1.5 text-sm">
                <div className="rounded-md border border-slate-800 bg-slate-900/60 p-2 text-xs text-slate-400">
                  {catalogApps.length} apps shown - Last checked {lastRefreshAt ? lastRefreshAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'not yet'}
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
      </header>

      {marketplaceError && <PageErrorState className="mb-5" message={marketplaceError} onRetry={loadApps} title="Discover action needs attention" />}
      <InstallJobBanner apps={apps} installJob={installJob} selectedAppId={selectedApp.id} />

      {starterRecommendations.length > 0 && (
        <StarterAppHandoff
          recommendations={starterRecommendations}
          onSelect={selectRecommendedApp}
        />
      )}

      <div className="mb-6 grid gap-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <Input className="h-13 border-slate-700/40 bg-slate-900/70 pl-11 text-white placeholder:text-slate-500 focus-visible:border-violet-300 focus-visible:ring-violet-700/30" onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search by name, purpose, or category..." type="search" value={searchQuery} />
        </label>
        <div aria-label="Discover filters" className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 text-sm text-slate-500">
            <Filter className="size-4" />
            {showAdvancedMetrics ? 'Show' : 'Starter catalog'}
          </span>
          {showAdvancedMetrics && categories.map((category) => (
            <Button className={cn('h-9 border-slate-700/40 bg-slate-900/65 px-4 text-slate-300 hover:bg-slate-800 hover:text-white', selectedCategory === category && 'border-violet-300/40 bg-violet-600/20 text-violet-200 hover:bg-violet-600/25')} key={category} onClick={() => setSelectedCategory(category)} type="button" variant="outline">
              {category}
            </Button>
          ))}
          <Button className={cn('h-9 border-slate-700/40 bg-slate-900/65 px-4 text-slate-300 hover:bg-slate-800 hover:text-white', hideInstalled && 'border-emerald-300/40 bg-emerald-600/15 text-emerald-200 hover:bg-emerald-600/20')} onClick={() => setHideInstalled((value) => !value)} type="button" variant="outline">
            {hideInstalled ? 'Showing new apps only' : 'Hide installed'}
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-6 2xl:grid-cols-[minmax(620px,1fr)_minmax(420px,560px)]">
        <MarketplaceAppList apps={visibleApps} foundResourcesByAppId={foundResourcesByAppId} installedAppIds={new Set(installedById.keys())} modeLabel={showAdvancedMetrics ? 'All apps' : 'Starter apps'} onSelect={setSelectedAppId} onSortChange={setSortBy} selectedAppId={selectedApp.id} sortBy={sortBy} />
        <MarketplaceAppDetail app={selectedApp} backupJob={backupJob?.subjectId === selectedApp.id ? backupJob : null} foundResource={foundResourcesByAppId.get(selectedApp.id) ?? null} installJob={installJob?.subjectId === selectedApp.id ? installJob : null} installLocked={selectedAppInstallLocked} installOptions={installOptions ?? defaultInstallOptions(selectedApp)} installResult={null} installStatusMessage={installStatusMessage} installing={selectedAppInstalling} installPlan={installPlan} installedApp={selectedInstalledApp} onBack={() => { setSearchQuery(''); setSelectedCategory('All'); }} onCreateBackup={createFirstBackup} onInstall={(options) => installApp(selectedApp.id, options)} onOptionsChange={setInstallOptions} onReinstallCurrent={reinstallWithCurrentSettings} onRequestPlan={(options) => requestPlan(selectedApp.id, options)} onResetReinstall={resetAndReinstall} planLoading={planLoading} recoveryMode={recoveryAppId === selectedApp.id ? recoveryMode : null} />
      </div>
    </PageShell>
  );
}

function InstallJobBanner({ apps, installJob, selectedAppId }: { apps: MarketplaceApp[]; installJob: ProjectOsJob | null; selectedAppId: string }) {
  if (!installJob || installJob.subjectId !== selectedAppId) {
    return null;
  }
  if (!terminalJob(installJob)) {
    return (
      <div className="mb-5 rounded-lg border border-violet-300/25 bg-violet-500/10 p-4 text-sm text-violet-100">
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
      <div className="mb-5 rounded-lg border border-emerald-300/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">
        <p className="font-semibold text-white">{appNameForJob(installJob, apps)} is ready</p>
        <p className="mt-1">Open the app or create a first restore point before experimenting.</p>
      </div>
    );
  }
  return null;
}

function StarterAppHandoff({ onSelect, recommendations }: { onSelect: (appId: string) => void; recommendations: StarterRecommendation[] }) {
  const blocked = recommendations.some((recommendation) => recommendation.readiness === 'blocked');
  return (
    <section className="mb-1 rounded-2xl border border-emerald-300/18 bg-po-hero-marketplace-handoff p-5 shadow-po-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-normal text-emerald-300">First install handoff</p>
          <h3 className="mt-2 text-2xl font-black text-white">Start with these apps</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            These are the apps selected during onboarding. Project OS has not installed them yet; choose one to review the existing install wizard before anything changes.
          </p>
        </div>
        <Badge className={blocked ? 'border-amber-300/25 bg-amber-500/10 text-amber-100' : 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100'} variant="outline">
          {blocked ? 'Readiness review needed' : 'Ready to review'}
        </Badge>
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
                <Badge className="border-emerald-300/25 bg-emerald-500/10 text-emerald-100" variant="outline">Installed</Badge>
              ) : (
                <Badge className={recommendation.readiness === 'ready' ? 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100' : recommendation.readiness === 'blocked' ? 'border-amber-300/25 bg-amber-500/10 text-amber-100' : 'border-sky-300/25 bg-sky-500/10 text-sky-100'} variant="outline">
                  {recommendation.readiness === 'ready' ? 'Ready' : recommendation.readiness === 'blocked' ? 'Needs setup' : 'Review'}
                </Badge>
              )}
            </div>
            <div className="mt-3 grid gap-2 text-sm text-slate-300">
              {recommendation.notes.map((note) => (
                <div className="flex gap-2" key={note}>
                  {recommendation.readiness === 'ready' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" />}
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

function appNameForJob(job: ProjectOsJob, apps: MarketplaceApp[]) {
  return apps.find((app) => app.id === job.subjectId)?.name || job.subjectId || 'this app';
}
