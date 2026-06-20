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
import { InstalledAppsAPIClient } from '@/api/InstalledAppsAPIClient';
import { MarketplaceAPIClient } from '@/api/MarketplaceAPIClient';
import { MarketplaceInstallClient } from '@/api/MarketplaceInstallClient';
import { SystemAPIClient } from '@/api/SystemAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { poButtonClass, poCardClass } from '@/lib/projectOsStyleKit';
import { cn } from '@/lib/utils';
import type { AppRuntimeView, InstallSettings } from '@/types/app';
import type { ActivityLog } from '@/types/activity';
import type { InstallOptions, InstallPlan, InstallResult, MarketplaceApp } from '@/types/marketplace';
import type { OnboardingState, StorageReport, SystemDoctorStatus } from '@/types/system';
import { categories } from './extensions/MarketplacePage.constants';
import { defaultInstallOptions } from './extensions/MarketplacePage.installation';
import { activeInstallMessage, canStartInstall, completeInstallJob, failInstallJob, modeLabel, startInstallJob } from './extensions/MarketplacePage.installQueue';
import { MarketplaceAppDetail } from './MarketplaceAppDetail';
import { MarketplaceAppList } from './MarketplaceAppList';

function MarketplacePage() {
  const [searchParams] = useSearchParams();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedAppId, setSelectedAppId] = useState('vaultwarden');
  const [sortBy, setSortBy] = useState('Recommended');
  const [searchQuery, setSearchQuery] = useState('');
  const [apps, setApps] = useState<MarketplaceApp[]>([]);
  const [installedApps, setInstalledApps] = useState<AppRuntimeView[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [doctor, setDoctor] = useState<SystemDoctorStatus | null>(null);
  const [storage, setStorage] = useState<StorageReport | null>(null);
  const [hideInstalled, setHideInstalled] = useState(false);
  const [marketplaceError, setMarketplaceError] = useState('');
  const [installPlan, setInstallPlan] = useState<InstallPlan | null>(null);
  const [installOptions, setInstallOptions] = useState<InstallOptions | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [installJob, setInstallJob] = useState<any>({ status: 'idle' });
  const [installResult, setInstallResult] = useState<InstallResult | null>(null);
  const [marketplaceActivity, setMarketplaceActivity] = useState<ActivityLog[]>([]);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  const selectedApp = useMemo(() => apps.find((app) => app.id === selectedAppId) ?? apps[0], [apps, selectedAppId]);
  const recoveryAppId = searchParams.get('app');
  const recoveryMode = searchParams.get('mode');
  const installedById = useMemo(() => new Map(installedApps.map((app) => [app.appId, app])), [installedApps]);
  const selectedInstalledApp = selectedApp ? installedById.get(selectedApp.id) ?? null : null;

  const loadApps = useCallback(async () => {
    try {
      const [nextApps, nextInstalledApps, nextActivity] = await Promise.all([
        MarketplaceAPIClient.listApps(),
        InstalledAppsAPIClient.listApps(),
        ActivityAPIClient.recent({ category: 'marketplace', limit: 8 }),
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
    setInstallPlan(null);
    setInstallResult(null);
    const app = apps.find((nextApp) => nextApp.id === selectedAppId);
    if (app) {
      const defaults = defaultInstallOptions(app);
      setInstallOptions(defaults);
      requestPlan(selectedAppId, defaults);
    }
  }, [apps, requestPlan, selectedAppId]);

  async function installApp(appId = selectedApp?.id, options = installOptions, mode: 'install' | 'reinstall' | 'reset-reinstall' = 'install') {
    if (!appId) {
      return;
    }
    const app = apps.find((candidate) => candidate.id === appId);
    if (!canStartInstall(installJob, appId)) {
      setMarketplaceError(activeInstallMessage(installJob, appId));
      return;
    }
    setInstallJob((current: any) => startInstallJob(current, { appId, appName: app?.name || appId, mode }));
    setInstallResult(null);
    try {
      const result = await MarketplaceInstallClient.install(appId, options ?? {});
      setInstallResult(result);
      setInstallPlan(result.plan ?? null);
      setInstallJob((current: any) => completeInstallJob(current, { appId, status: result.status, message: result.message }));
      if (result.status === 'installed') {
        setInstalledApps(await InstalledAppsAPIClient.listApps());
      }
      setMarketplaceActivity(await ActivityAPIClient.recent({ category: 'marketplace', limit: 8 }));
      setMarketplaceError('');
    } catch (error) {
      const message = apiErrorMessage(error);
      setInstallJob((current: any) => failInstallJob(current, { appId, message }));
      setMarketplaceError(message);
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

  const visibleApps = sortApps(
    apps.filter((app) => (selectedCategory === 'All' || app.category === selectedCategory) && (!hideInstalled || !installedById.has(app.id)) && matchesSearch(app, searchQuery)),
    sortBy,
  );
  const selectedAppInstalling = installJob.status === 'active' && installJob.active.appId === selectedApp?.id;
  const selectedAppInstallLocked = Boolean(selectedApp && !canStartInstall(installJob, selectedApp.id));
  const installStatusMessage = selectedApp ? activeInstallMessage(installJob, selectedApp.id) : '';
  const starterRecommendations = useMemo(
    () => onboarding?.status === 'complete' ? starterAppsForMarketplace(apps, onboarding.recommendedApps, installedById, doctor, storage) : [],
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
          <PageErrorState message={marketplaceError} onRetry={loadApps} title="Marketplace catalog could not load" />
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
          <h2 className="text-4xl font-bold leading-none text-white md:text-5xl">Marketplace</h2>
          <p className="mt-3 max-w-3xl text-slate-300">Add useful self-hosted apps by what they help you do. Project OS keeps the normal install simple and leaves advanced choices available when you need them.</p>
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
              <DropdownMenuLabel>Marketplace activity</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-slate-800" />
              <div className="grid max-h-80 gap-2 overflow-y-auto px-2 py-1.5 text-sm">
                <div className="rounded-md border border-slate-800 bg-slate-900/60 p-2 text-xs text-slate-400">
                  {apps.length} apps ready - Last checked {lastRefreshAt ? lastRefreshAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'not yet'}
                </div>
                {marketplaceActivity.length ? marketplaceActivity.map((event) => (
                  <div className="rounded-md border border-slate-800 bg-slate-900/50 p-2" key={event.id}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn('text-xs font-semibold uppercase tracking-wide', activityTone(event.level))}>{event.outcome.replace('_', ' ')}</span>
                      <span className="text-xs text-slate-500">{formatActivityTime(event.createdAt)}</span>
                    </div>
                    <p className="mt-1 font-medium text-slate-100">{event.title}</p>
                    {event.message && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{event.message}</p>}
                  </div>
                )) : (
                  <div className="rounded-md border border-slate-800 bg-slate-900/50 p-3 text-sm text-slate-400">
                    No marketplace activity has been recorded yet.
                  </div>
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        </div>
      </header>

      {marketplaceError && <PageErrorState className="mb-5" message={marketplaceError} onRetry={loadApps} title="Marketplace action needs attention" />}
      <InstallJobBanner installJob={installJob} selectedAppId={selectedApp.id} />

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
        <div aria-label="Marketplace categories" className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 text-sm text-slate-500">
            <Filter className="size-4" />
            Show
          </span>
          {categories.map((category) => (
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
        <MarketplaceAppList apps={visibleApps} installedAppIds={new Set(installedById.keys())} onSelect={setSelectedAppId} onSortChange={setSortBy} selectedAppId={selectedApp.id} sortBy={sortBy} />
        <MarketplaceAppDetail app={selectedApp} installLocked={selectedAppInstallLocked} installOptions={installOptions ?? defaultInstallOptions(selectedApp)} installResult={installResult} installStatusMessage={installStatusMessage} installing={selectedAppInstalling} installPlan={installPlan} installedApp={selectedInstalledApp} onBack={() => { setSearchQuery(''); setSelectedCategory('All'); }} onInstall={(options) => installApp(selectedApp.id, options)} onOptionsChange={setInstallOptions} onReinstallCurrent={reinstallWithCurrentSettings} onRequestPlan={(options) => requestPlan(selectedApp.id, options)} onResetReinstall={resetAndReinstall} planLoading={planLoading} recoveryMode={recoveryAppId === selectedApp.id ? recoveryMode : null} />
      </div>
    </PageShell>
  );
}

function InstallJobBanner({ installJob, selectedAppId }: { installJob: any; selectedAppId: string }) {
  if (installJob.status === 'active') {
    return (
      <div className="mb-5 rounded-lg border border-violet-300/25 bg-violet-500/10 p-4 text-sm text-violet-100">
        <p className="font-semibold text-white">{modeLabel(installJob.active.mode)} in progress</p>
        <p className="mt-1">{activeInstallMessage(installJob, selectedAppId)}</p>
      </div>
    );
  }
  if (installJob.status === 'failed') {
    return (
      <div className="mb-5 rounded-lg border border-red-300/25 bg-red-500/10 p-4 text-sm text-red-100">
        <p className="font-semibold text-white">{modeLabel(installJob.failed.mode)} failed for {installJob.failed.appName}</p>
        <p className="mt-1">{installJob.failed.message}</p>
      </div>
    );
  }
  if (installJob.status === 'completed') {
    return (
      <div className="mb-5 rounded-lg border border-emerald-300/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">
        <p className="font-semibold text-white">{modeLabel(installJob.completed.mode)} finished for {installJob.completed.appName}</p>
        <p className="mt-1">{installJob.completed.message}</p>
      </div>
    );
  }
  return null;
}

type StarterRecommendation = {
  app: MarketplaceApp;
  installed: boolean;
  notes: string[];
  readiness: 'ready' | 'blocked' | 'review';
};

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

function starterAppsForMarketplace(apps: MarketplaceApp[], recommendedApps: string[], installedById: Map<string, AppRuntimeView>, doctor: SystemDoctorStatus | null, storage: StorageReport | null): StarterRecommendation[] {
  const selectedIds = recommendedApps.length ? recommendedApps : ['vaultwarden', 'jellyfin', 'homepage'];
  const appInstallsBlocked = doctor?.readiness.groups.find((group) => group.id === 'app-installs')?.status === 'warning';
  const privateAccessBlocked = doctor?.readiness.groups.find((group) => group.id === 'private-access')?.status === 'warning';
  const limitedStorage = storage?.status === 'warning' || storage?.status === 'critical' || (storage?.runtimeDisk.usedPercent ?? 0) >= 75;
  return selectedIds
    .map((appId) => apps.find((app) => app.id === appId))
    .filter((app): app is MarketplaceApp => Boolean(app))
    .map((app) => {
      const notes = starterAppNotes(app, { appInstallsBlocked, privateAccessBlocked, limitedStorage });
      const readiness: StarterRecommendation['readiness'] = appInstallsBlocked ? 'blocked' : limitedStorage && !isLightweight(app) ? 'review' : 'ready';
      return {
        app,
        installed: installedById.has(app.id),
        notes,
        readiness,
      };
    })
    .sort((left, right) => Number(right.readiness === 'ready') - Number(left.readiness === 'ready') || Number(isLightweight(right.app)) - Number(isLightweight(left.app)) || left.app.name.localeCompare(right.app.name));
}

function starterAppNotes(app: MarketplaceApp, context: { appInstallsBlocked: boolean; privateAccessBlocked: boolean; limitedStorage: boolean }) {
  const notes = [];
  if (context.appInstallsBlocked) {
    notes.push('Docker setup is needed first. Review host readiness before installing apps.');
  } else {
    notes.push('Opens the existing install wizard for explicit confirmation.');
  }
  if (context.privateAccessBlocked && app.access.privateAccessRecommended) {
    notes.push('Private access can wait. This app can start with local access until Tailscale is ready.');
  }
  if (context.limitedStorage) {
    notes.push(isLightweight(app) ? 'Recommended as a lightweight first install while storage is tight.' : 'Storage is tight; review space before installing this larger app.');
  }
  if (!notes.length) {
    notes.push('Ready to review as a first Project OS app.');
  }
  return notes;
}

function matchesSearch(app: MarketplaceApp, searchQuery: string) {
  const query = searchQuery.trim().toLowerCase();
  if (!query) {
    return true;
  }
  return [
    app.name,
    app.category,
    app.description,
    app.shortValue,
    app.plainLanguage,
    app.usage.kind,
    ...app.tags,
    ...app.bestFor,
    ...app.highlights,
  ].some((value) => value.toLowerCase().includes(query));
}

function sortApps(apps: MarketplaceApp[], sortBy: string) {
  const sorted = [...apps];
  switch (sortBy) {
    case 'Easiest to install':
      return sorted.sort((left, right) => difficultyRank(left.difficulty) - difficultyRank(right.difficulty) || left.name.localeCompare(right.name));
    case 'Most popular':
      return sorted.sort((left, right) => numericPopularity(right.downloads) - numericPopularity(left.downloads) || left.name.localeCompare(right.name));
    case 'Recently updated':
      return sorted.sort((left, right) => updateRank(left.lastUpdated) - updateRank(right.lastUpdated) || left.name.localeCompare(right.name));
    default:
      return sorted.sort((left, right) => Number(right.badge === 'Official') - Number(left.badge === 'Official') || Number(right.access.privateAccessRecommended) - Number(left.access.privateAccessRecommended) || left.name.localeCompare(right.name));
  }
}

function difficultyRank(difficulty: string) {
  const normalized = difficulty.toLowerCase();
  if (normalized.includes('easy')) return 0;
  if (normalized.includes('moderate')) return 1;
  return 2;
}

function isLightweight(app: MarketplaceApp) {
  return difficultyRank(app.difficulty) === 0 || app.installTime.toLowerCase().includes('2-3');
}

function numericPopularity(downloads: string) {
  const match = downloads.toLowerCase().match(/([\d.]+)\s*([mk])?/);
  if (!match) {
    return 0;
  }
  const value = Number(match[1]);
  const multiplier = match[2] === 'm' ? 1_000_000 : match[2] === 'k' ? 1_000 : 1;
  return value * multiplier;
}

function updateRank(lastUpdated: string) {
  const value = lastUpdated.toLowerCase();
  if (value.includes('today') || value.includes('recent')) return 0;
  if (value.includes('day')) return 1;
  if (value.includes('week')) return 2;
  if (value.includes('month')) return 3;
  return 4;
}

function activityTone(level: string) {
  switch (level) {
    case 'success':
      return 'text-emerald-300';
    case 'warning':
      return 'text-amber-300';
    case 'error':
      return 'text-red-300';
    default:
      return 'text-sky-300';
  }
}

function formatActivityTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'recently';
  }
  return parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function optionsFromInstalledSettings(settings: InstallSettings | null, fallback: InstallOptions): InstallOptions {
  if (!settings) {
    return fallback;
  }
  return {
    ports: { hostPort: settings.expectedLocalPort ?? portFromUrl(settings.accessUrl) ?? fallback.ports.hostPort },
    access: { tailscaleEnabled: settings.tailscaleEnabled },
    storage: { subfolders: settings.storageSubfolders ?? fallback.storage.subfolders },
    backup: {
      enabled: settings.backup?.enabled ?? fallback.backup.enabled,
      frequency: settings.backup?.frequency ?? fallback.backup.frequency,
      retention: settings.backup?.retention ?? fallback.backup.retention,
    },
    reinstall: true,
  };
}

function portFromUrl(value: string | null) {
  if (!value) {
    return null;
  }
  try {
    const parsed = new URL(value);
    if (parsed.port) {
      return Number(parsed.port);
    }
    if (parsed.protocol === 'http:') {
      return 80;
    }
    if (parsed.protocol === 'https:') {
      return 443;
    }
    return null;
  } catch {
    return null;
  }
}

export default MarketplacePage;
