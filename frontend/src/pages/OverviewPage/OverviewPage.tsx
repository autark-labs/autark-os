import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Database,
  ExternalLink,
  Grid3X3,
  Home,
  Loader2,
  Monitor,
  Plus,
  Shield,
  ShieldCheck,
  Sparkles,
  Triangle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { ActivityAPIClient } from '@/api/ActivityAPIClient';
import { BackupAPIClient } from '@/api/BackupAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { InstalledAppsAPIClient } from '@/api/InstalledAppsAPIClient';
import { NetworkAPIClient } from '@/api/NetworkAPIClient';
import { SystemAPIClient } from '@/api/SystemAPIClient';
import overviewBackground from '@/assets/overviewBackground.png';
import { cn } from '@/lib/utils';
import type { ActivityLog } from '@/types/activity';
import type { AppReliabilitySummary, AppRuntimeView, AppUpdateStatus } from '@/types/app';
import type { BackupReport } from '@/types/backup';
import type { PrivateAccessReconciliationReport, TailscaleDevice, TailscaleStatus } from '@/types/network';
import type { ProjectSettings, StorageReport, SystemMetrics, SystemSetupStatus } from '@/types/system';

type Tone = 'purple' | 'blue' | 'teal' | 'green' | 'amber' | 'red';

type OverviewState = {
  activity: ActivityLog[];
  apps: AppRuntimeView[];
  backups: BackupReport | null;
  devices: TailscaleDevice[];
  metrics: SystemMetrics | null;
  privateAccess: PrivateAccessReconciliationReport | null;
  reliability: AppReliabilitySummary | null;
  settings: ProjectSettings | null;
  setup: SystemSetupStatus | null;
  storage: StorageReport | null;
  tailscale: TailscaleStatus | null;
  updates: AppUpdateStatus[];
};

type QuickApp = {
  app: AppRuntimeView;
  href: string | null;
  icon: LucideIcon;
  tone: Tone;
};

type NextStep = {
  icon: LucideIcon;
  label: string;
  count?: string;
  tone: Tone;
  to: string;
};

const initialState: OverviewState = {
  activity: [],
  apps: [],
  backups: null,
  devices: [],
  metrics: null,
  privateAccess: null,
  reliability: null,
  settings: null,
  setup: null,
  storage: null,
  tailscale: null,
  updates: [],
};

function OverviewPage() {
  const [state, setState] = useState<OverviewState>(initialState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      setLoading(true);
      const [apps, reliability, updates, activity, metrics, storage, backups, devices, tailscale, privateAccess, settings, setup] = await Promise.allSettled([
        InstalledAppsAPIClient.listApps(),
        InstalledAppsAPIClient.reliabilitySummary(),
        InstalledAppsAPIClient.updates(),
        ActivityAPIClient.recent({ limit: 4 }),
        SystemAPIClient.metrics(),
        SystemAPIClient.storage(),
        BackupAPIClient.report(),
        NetworkAPIClient.tailscaleDevices(),
        NetworkAPIClient.tailscaleStatus(),
        NetworkAPIClient.privateAccessReconciliation(),
        SystemAPIClient.settings(),
        SystemAPIClient.setupStatus(),
      ]);

      if (cancelled) return;

      const rejected = [apps, reliability, updates, activity, metrics, storage, backups, devices, tailscale, privateAccess, settings, setup].find((result) => result.status === 'rejected');
      setError(rejected?.status === 'rejected' ? apiErrorMessage(rejected.reason, 'Some Overview data could not be loaded.') : null);
      setState({
        activity: valueOr(activity, []),
        apps: valueOr(apps, []),
        backups: valueOr(backups, null),
        devices: valueOr(devices, []),
        metrics: valueOr(metrics, null),
        privateAccess: valueOr(privateAccess, null),
        reliability: valueOr(reliability, null),
        settings: valueOr(settings, null),
        setup: valueOr(setup, null),
        storage: valueOr(storage, null),
        tailscale: valueOr(tailscale, null),
        updates: valueOr(updates, []),
      });
      setLoading(false);
    }

    loadOverview();
    const interval = window.setInterval(loadOverview, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const view = useMemo(() => buildOverviewView(state), [state]);

  return (
    <section className="w-full">
      <div className="overflow-hidden rounded-[16px] border border-[#1c2741] bg-[#050b18] shadow-[0_30px_90px_rgb(0_0_0/0.4)]">
        <Hero loading={loading} view={view} />
        <main className="relative z-10 -mt-[170px] grid gap-8 px-7 pb-7">
          <QuickAccess apps={view.quickApps} loading={loading} />
          <AtAGlance view={view} />
          <div className="grid gap-5 lg:grid-cols-2">
            <RecentActivity activity={state.activity} loading={loading} />
            <HelpfulNextSteps steps={view.nextSteps} />
          </div>
          {error && (
            <div className="rounded-[10px] border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {error}
            </div>
          )}
        </main>
      </div>
    </section>
  );
}

function Hero({ loading, view }: { loading: boolean; view: ReturnType<typeof buildOverviewView> }) {
  return (
    <header className="relative h-[690px] overflow-hidden bg-[#050b18] xl:h-[720px] 2xl:h-[760px]">
      <img alt="Project OS digital home" className="absolute inset-x-0 top-0 h-auto w-full max-w-none" src={overviewBackground} />
      <div className="absolute inset-0 bg-po-overview-side-overlay" />
      <div className="absolute inset-0 bg-po-overview-vertical-overlay" />
      <div className="absolute inset-x-0 bottom-0 h-36 bg-po-overview-bottom-fade" />

      <div className="relative z-10 flex h-full justify-between gap-6 px-7 py-8">
        <div className="max-w-[520px]">
          <h1 className="text-[2rem] font-bold leading-none text-white">{view.greeting}</h1>
          <p className="mt-3 text-[1.15rem] leading-7 text-[#c6c9d8]">{view.heroSubtitle}</p>
        </div>
        <div className="mt-[-5px] hidden h-[64px] min-w-[610px] items-center rounded-[18px] border border-[#25324f] bg-[#071025]/72 shadow-[0_24px_70px_rgb(0_0_0/0.3)] backdrop-blur-xl xl:flex">
          <TopStat icon={view.healthIcon} label={view.healthLabel} tone={view.healthTone} value={view.healthDetail} wide />
          <TopStat icon={Monitor} label={`${view.runningApps}`} tone="purple" value="Apps running" />
          <TopStat icon={Monitor} label={`${view.onlineDevices}`} tone="blue" value="Devices online" />
          <TopStat icon={Clock3} label="Next backup" tone="purple" value={view.nextBackupLabel} />
        </div>
        {loading && (
          <span className="absolute right-7 top-24 hidden items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs text-slate-200 backdrop-blur-xl md:flex">
            <Loader2 className="size-3.5 animate-spin" />
            Updating
          </span>
        )}
      </div>
    </header>
  );
}

function TopStat({ icon: Icon, label, tone, value, wide = false }: { icon: LucideIcon; label: string; tone: Tone; value: string; wide?: boolean }) {
  return (
    <div className={cn('flex h-full items-center gap-3 border-r border-[#25324f] px-5 last:border-r-0', wide ? 'min-w-[178px]' : 'min-w-[138px]')}>
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-[11px]', iconTone(tone, true))}>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-bold leading-tight text-white">{label}</span>
        <span className="mt-1 block truncate text-[12px] leading-tight text-[#a2a8bb]">{value}</span>
      </span>
    </div>
  );
}

function QuickAccess({ apps, loading }: { apps: QuickApp[]; loading: boolean }) {
  return (
    <section className="rounded-[14px] border border-[#6d7aa3]/20 bg-[#081226]/48 p-4 shadow-[0_22px_65px_rgb(0_0_0/0.22)] backdrop-blur-xl">
      <h2 className="px-1 text-[17px] font-bold text-white">Quick Access</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {apps.map((app) => (
          <AppTile app={app} key={app.app.appId} />
        ))}
        {!apps.length && !loading && (
          <Link className="grid h-[122px] place-items-center rounded-[10px] border border-dashed border-[#7685ad]/25 bg-[#0e1830]/42 text-center no-underline transition hover:border-[#7c5cff]" to="/marketplace">
            <span className="grid justify-items-center gap-3">
              <Sparkles className="size-8 text-[#a977ff]" strokeWidth={1.8} />
              <span className="text-[12px] text-[#bdc4d8]">Install your first app</span>
            </span>
          </Link>
        )}
        <Link className="grid h-[122px] place-items-center rounded-[10px] border border-[#7685ad]/20 bg-[#0e1830]/50 text-center no-underline transition hover:border-[#7c5cff]" to="/applications">
          <span className="grid justify-items-center gap-4">
            <Plus className="size-8 text-white" strokeWidth={1.8} />
            <span className="text-[12px] text-[#99a0b6]">{apps.length ? 'Manage apps' : 'Add shortcut'}</span>
          </span>
        </Link>
      </div>
    </section>
  );
}

function AppTile({ app }: { app: QuickApp }) {
  const Icon = app.icon;
  const content = (
    <span className="grid justify-items-center">
      <span className={cn('grid size-12 place-items-center rounded-[13px]', iconTone(app.tone, true))}>
        <Icon className="size-7" />
      </span>
      <span className="mt-3 max-w-full truncate text-[13px] font-semibold text-white">{app.app.appName}</span>
      <span className={cn('mt-2 rounded-full border px-4 py-1 text-[12px] font-semibold', app.href ? 'border-[#5b3ee5]/70 bg-[#24175d] text-[#c3a8ff]' : 'border-amber-300/20 bg-amber-500/10 text-amber-100')}>
        {app.href ? 'Open' : 'Needs link'}
      </span>
    </span>
  );

  if (!app.href) {
    return (
      <Link className="grid h-[122px] place-items-center rounded-[10px] border border-[#7685ad]/20 bg-[#0e1830]/50 px-3 text-center no-underline transition hover:border-[#7c5cff]" to="/applications">
        {content}
      </Link>
    );
  }

  return (
    <a className="grid h-[122px] place-items-center rounded-[10px] border border-[#7685ad]/20 bg-[#0e1830]/50 px-3 text-center no-underline transition hover:border-[#7c5cff]" href={app.href} rel="noreferrer" target="_blank">
      {content}
    </a>
  );
}

function AtAGlance({ view }: { view: ReturnType<typeof buildOverviewView> }) {
  return (
    <section>
      <h2 className="px-1 text-[17px] font-bold text-white">At a glance</h2>
      <div className="mt-3 grid gap-4 lg:grid-cols-4">
        <GlanceCard action="Open applications" detail={view.appDetail} icon={Grid3X3} label="Applications" tone={view.appTone} to="/applications" value={view.appValue} warning={view.appWarning} />
        <GlanceCard action="View devices" detail={view.deviceDetail} icon={Monitor} label="Devices" tone={view.deviceTone} to="/devices" value={view.deviceValue} warning={view.deviceWarning} />
        <GlanceCard action="Manage storage" detail={view.storageDetail} icon={Database} label="Storage" progress={view.storagePercent} tone={view.storageTone} to="/storage" value={view.storageValue} warning={view.storageWarning} />
        <GlanceCard action="View backups" detail={view.backupDetail} icon={ShieldCheck} label="Backups" tone={view.backupTone} to="/backups" value={view.backupValue} warning={view.backupWarning} />
      </div>
    </section>
  );
}

function GlanceCard({ action, detail, icon: Icon, label, progress, tone, to, value, warning = false }: { action: string; detail: string; icon: LucideIcon; label: string; progress?: number; tone: Tone; to: string; value: string; warning?: boolean }) {
  return (
    <Link className={cn('flex min-h-[168px] flex-col rounded-[12px] border border-[#202d49] p-4 text-left no-underline shadow-[0_18px_45px_rgb(0_0_0/0.18)] transition hover:-translate-y-0.5 hover:border-[#7c5cff]', cardTone(tone))} to={to}>
      <div className="flex gap-4">
        <span className={cn('grid size-11 shrink-0 place-items-center rounded-[11px]', iconTone(tone, true))}>
          <Icon className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] text-[#a5abc0]">{label}</span>
          <span className="mt-2 block truncate text-[19px] font-bold text-white">{value}</span>
          <span className={cn('mt-1 block truncate text-[13px]', warning ? 'text-[#f7b42c]' : 'text-[#42e58f]')}>{detail}</span>
        </span>
      </div>
      {typeof progress === 'number' && (
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#143147]">
          <div className="h-full rounded-full bg-[#18d0b0]" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </div>
      )}
      <div className="mt-auto border-t border-[#26314c] pt-3 text-[13px] font-medium text-[#b188ff]">
        {action} <ArrowRight className="ml-1 inline size-4" />
      </div>
    </Link>
  );
}

function RecentActivity({ activity, loading }: { activity: ActivityLog[]; loading: boolean }) {
  return (
    <section className="rounded-[12px] border border-[#202d49] bg-[#081226]/82 p-4 shadow-[0_18px_45px_rgb(0_0_0/0.18)]">
      <h2 className="text-[17px] font-bold text-white">Recent activity</h2>
      <div className="mt-4 grid gap-2">
        {activity.map((item) => {
          const Icon = activityIcon(item);
          const tone = activityTone(item);
          return (
            <div className="flex h-[40px] items-center gap-3 rounded-[8px] border border-[#1d2943] bg-[#0d172c]/82 px-3" key={item.id}>
              <span className={cn('grid size-6 shrink-0 place-items-center rounded-full', iconTone(tone, false))}>
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-white">{item.title || item.message}</span>
              <span className={cn('shrink-0 text-[12px]', tone === 'amber' || tone === 'red' ? 'rounded-[6px] border border-[#a35b16] px-2 py-1 text-[#f7a935]' : 'text-[#8e97ad]')}>{formatRelativeTime(item.createdAt)}</span>
            </div>
          );
        })}
        {!activity.length && (
          <div className="flex h-[40px] items-center gap-3 rounded-[8px] border border-[#1d2943] bg-[#0d172c]/82 px-3 text-[13px] text-[#a8b0c5]">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4 text-emerald-300" />}
            {loading ? 'Loading recent activity' : 'No recent activity recorded'}
          </div>
        )}
      </div>
    </section>
  );
}

function HelpfulNextSteps({ steps }: { steps: NextStep[] }) {
  return (
    <section className="rounded-[12px] border border-[#202d49] bg-[#081226]/82 p-4 shadow-[0_18px_45px_rgb(0_0_0/0.18)]">
      <h2 className="text-[17px] font-bold text-white">Helpful next steps</h2>
      <div className="mt-4 grid gap-2">
        {steps.map((item) => {
          const Icon = item.icon;
          return (
            <Link className="flex h-[40px] items-center gap-3 rounded-[8px] border border-[#1d2943] bg-[#0d172c]/82 px-3 text-white no-underline transition hover:border-[#7c5cff]" key={item.label} to={item.to}>
              <span className={cn('grid size-7 shrink-0 place-items-center rounded-[7px]', iconTone(item.tone, false))}>
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px]">{item.label}</span>
              {item.count && <span className={cn('rounded-[7px] px-2 py-0.5 text-[12px]', item.tone === 'amber' || item.tone === 'red' ? 'bg-[#40270c] text-[#f7a935]' : 'bg-[#24175d] text-[#b188ff]')}>{item.count}</span>}
              <ChevronRight className="size-4 text-[#8f97ad]" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function buildOverviewView(state: OverviewState) {
  const readyApps = state.reliability?.readyApps ?? state.apps.filter((app) => appIsReady(app)).length;
  const attentionApps = (state.reliability?.needsAttentionApps ?? 0) + (state.reliability?.unavailableApps ?? 0);
  const runningApps = state.apps.filter((app) => app.friendlyStatus !== 'Stopped').length;
  const onlineDevices = state.devices.filter((device) => device.online).length;
  const updatesAvailable = state.updates.filter((update) => update.updateAvailable).length;
  const setupWarnings = state.setup?.checks.filter((check) => check.status !== 'ok').length ?? 0;
  const privateLinkIssues = state.privateAccess?.apps.filter((app) => app.status === 'missing' || app.status === 'mismatched').length ?? 0;
  const storageRisk = storageRiskLevel(state.storage?.runtimeDisk.usedPercent ?? state.metrics?.runtimeUsedPercent);
  const appTone: Tone = attentionApps > 0 ? 'amber' : 'purple';
  const deviceTone: Tone = state.tailscale?.connected === false || privateLinkIssues > 0 ? 'amber' : 'blue';
  const storagePercent = state.storage?.runtimeDisk.usedPercent ?? state.metrics?.runtimeUsedPercent;
  const storageTone: Tone = storagePercent == null ? 'teal' : storagePercent >= 90 ? 'red' : storagePercent >= 75 ? 'amber' : 'teal';
  const backupTone: Tone = state.backups?.status === 'protected' ? 'green' : state.backups ? 'amber' : 'green';
  const healthTone: Tone = state.reliability?.posture === 'critical' ? 'red' : state.reliability?.posture === 'warning' || attentionApps > 0 || setupWarnings > 0 ? 'amber' : 'green';
  const healthIcon = healthTone === 'green' ? Check : AlertTriangle;
  const nextSteps = buildNextSteps(state, { attentionApps, privateLinkIssues, setupWarnings, storageRisk, updatesAvailable });

  return {
    appDetail: attentionApps > 0 ? `${attentionApps} need attention` : readyApps === state.apps.length && state.apps.length > 0 ? 'All apps are ready' : `${readyApps} ready for use`,
    appTone,
    appValue: `${runningApps} running`,
    appWarning: attentionApps > 0,
    backupDetail: backupStory(state.backups),
    backupTone,
    backupValue: state.backups?.settings.lastSuccessfulRoutineRun ? formatRelativeTime(state.backups.settings.lastSuccessfulRoutineRun.createdAt) : state.backups?.settings.automaticBackupsEnabled ? 'Waiting for first run' : 'Manual only',
    backupWarning: backupTone !== 'green',
    deviceDetail: deviceStory(state, onlineDevices, privateLinkIssues),
    deviceTone,
    deviceValue: `${onlineDevices} online`,
    deviceWarning: state.tailscale?.connected === false || privateLinkIssues > 0,
    greeting: `${timeGreeting()}, ${displayName(state)}.`,
    healthDetail: state.reliability?.summary || state.setup?.summary || 'Project OS is checking your system.',
    healthIcon,
    healthLabel: healthTone === 'green' ? 'Healthy' : 'Needs review',
    healthTone,
    heroSubtitle: heroSubtitle(healthTone, state),
    nextBackupLabel: backupNextLabel(state.backups, state.settings),
    nextSteps,
    onlineDevices,
    quickApps: buildQuickApps(state.apps),
    runningApps,
    storageDetail: storageStory(storagePercent),
    storagePercent,
    storageTone,
    storageValue: state.storage?.runtimeDisk.usableBytes != null ? `${formatBytes(state.storage.runtimeDisk.usableBytes)} free` : state.metrics?.runtimeUsableBytes != null ? `${formatBytes(state.metrics.runtimeUsableBytes)} free` : 'Checking storage',
    storageWarning: storageRisk !== 'healthy',
  };
}

function buildQuickApps(apps: AppRuntimeView[]): QuickApp[] {
  return apps
    .filter((app) => app.friendlyStatus !== 'Stopped')
    .sort((left, right) => scoreQuickApp(right) - scoreQuickApp(left) || left.appName.localeCompare(right.appName))
    .slice(0, 5)
    .map((app) => ({
      app,
      href: app.settings?.privateAccessUrl || app.accessUrl || app.settings?.accessUrl || app.observedAccess?.privateUrl || app.observedAccess?.localUrl || null,
      icon: appIcon(app),
      tone: appTone(app),
    }));
}

function buildNextSteps(state: OverviewState, counts: { attentionApps: number; privateLinkIssues: number; setupWarnings: number; storageRisk: 'healthy' | 'warning' | 'critical'; updatesAvailable: number }): NextStep[] {
  const steps: NextStep[] = [];
  if (counts.updatesAvailable > 0) steps.push({ count: `${counts.updatesAvailable}`, icon: Grid3X3, label: `Update ${plural(counts.updatesAvailable, 'application')}`, tone: 'purple', to: '/updates' });
  if (counts.attentionApps > 0) steps.push({ count: `${counts.attentionApps}`, icon: AlertTriangle, label: `Review ${plural(counts.attentionApps, 'application issue')}`, tone: 'amber', to: '/applications' });
  if (counts.privateLinkIssues > 0) steps.push({ count: `${counts.privateLinkIssues}`, icon: Monitor, label: 'Repair private app links', tone: 'amber', to: '/network' });
  if (counts.storageRisk !== 'healthy') steps.push({ icon: Database, label: counts.storageRisk === 'critical' ? 'Free up storage soon' : 'Review storage space', tone: counts.storageRisk === 'critical' ? 'red' : 'amber', to: '/storage' });
  if (state.backups && (state.backups.unprotectedApps > 0 || state.backups.failedBackups > 0)) steps.push({ count: `${state.backups.unprotectedApps + state.backups.failedBackups}`, icon: ShieldCheck, label: 'Review backup protection', tone: 'amber', to: '/backups' });
  if (state.tailscale?.connected === false) steps.push({ icon: Monitor, label: 'Set up private access', tone: 'blue', to: '/network' });
  if (counts.setupWarnings > 0) steps.push({ count: `${counts.setupWarnings}`, icon: AlertTriangle, label: 'Review setup notes', tone: 'amber', to: '/support' });
  if (!state.apps.length) steps.push({ icon: Home, label: 'Explore the marketplace', tone: 'blue', to: '/marketplace' });
  if (!steps.length) steps.push({ icon: CheckCircle2, label: 'Everything important looks good', tone: 'green', to: '/monitoring' });
  return steps.slice(0, 4);
}

function valueOr<T>(result: PromiseSettledResult<T>, fallback: T) {
  return result.status === 'fulfilled' ? result.value : fallback;
}

function appIsReady(app: AppRuntimeView) {
  return app.healthSnapshot?.status === 'Ready' || app.friendlyStatus === 'Ready';
}

function appIcon(app: AppRuntimeView): LucideIcon {
  const text = `${app.appName} ${app.category}`.toLowerCase();
  if (text.includes('password') || text.includes('security') || text.includes('vault')) return Shield;
  if (text.includes('media') || text.includes('jellyfin')) return Triangle;
  if (text.includes('home') || text.includes('automation')) return Home;
  if (text.includes('network') || text.includes('guard') || text.includes('dns')) return ShieldCheck;
  if (text.includes('storage') || text.includes('database')) return Database;
  return Grid3X3;
}

function appTone(app: AppRuntimeView): Tone {
  if (app.friendlyStatus === 'Needs attention') return 'amber';
  if (app.category.toLowerCase().includes('media')) return 'purple';
  if (app.category.toLowerCase().includes('network')) return 'green';
  if (app.category.toLowerCase().includes('home')) return 'blue';
  if (app.category.toLowerCase().includes('security')) return 'blue';
  return 'purple';
}

function scoreQuickApp(app: AppRuntimeView) {
  const hasLink = app.accessUrl || app.settings?.accessUrl || app.settings?.privateAccessUrl || app.observedAccess?.localUrl || app.observedAccess?.privateUrl;
  return (hasLink ? 10 : 0) + (appIsReady(app) ? 5 : 0) + (app.friendlyStatus === 'Needs attention' ? -4 : 0);
}

function activityIcon(event: ActivityLog): LucideIcon {
  if (event.level === 'error' || event.outcome === 'failed') return AlertTriangle;
  if (event.category === 'backup') return ShieldCheck;
  if (event.category === 'access') return ExternalLink;
  return CheckCircle2;
}

function activityTone(event: ActivityLog): Tone {
  if (event.level === 'error' || event.outcome === 'failed') return 'red';
  if (event.level === 'warning' || event.outcome === 'needs_attention') return 'amber';
  if (event.level === 'success' || event.outcome === 'completed') return 'green';
  return 'blue';
}

function heroSubtitle(tone: Tone, state: OverviewState) {
  if (tone === 'green') return 'Your digital home is healthy and protected.';
  if (state.reliability?.issues.length) return state.reliability.issues[0].message;
  if (state.setup?.summary) return state.setup.summary;
  return 'Project OS found something that may need your attention.';
}

function backupNextLabel(report: BackupReport | null, settings: ProjectSettings | null) {
  if (report?.settings.nextRunLabel) return report.settings.nextRunLabel;
  if (report?.settings.nextRoutineRun) return formatRelativeTime(report.settings.nextRoutineRun);
  if (settings?.automaticBackupsEnabled) return `${capitalize(settings.backupFrequency)} near ${settings.backupTime}`;
  return 'Manual only';
}

function backupStory(report: BackupReport | null) {
  if (!report) return 'Backup status unavailable';
  if (report.failedBackups > 0) return `${report.failedBackups} failed backup${report.failedBackups === 1 ? '' : 's'}`;
  if (report.unprotectedApps > 0) return `${report.unprotectedApps} app${report.unprotectedApps === 1 ? '' : 's'} not protected`;
  if (report.protectedApps > 0) return 'All protected';
  return report.settings.automaticBackupsEnabled ? 'Waiting for first backup' : 'Manual backups only';
}

function deviceStory(state: OverviewState, onlineDevices: number, privateLinkIssues: number) {
  if (state.tailscale?.connected === false) return 'Private access needs setup';
  if (privateLinkIssues > 0) return `${privateLinkIssues} private link${privateLinkIssues === 1 ? '' : 's'} need repair`;
  if (onlineDevices > 0 && onlineDevices === state.devices.length) return 'All trusted devices online';
  if (state.devices.length > 0) return `${state.devices.length} trusted device${state.devices.length === 1 ? '' : 's'} known`;
  return state.tailscale?.connected ? 'Tailnet connected' : 'No devices discovered yet';
}

function storageStory(percent?: number | null) {
  if (percent == null) return 'Storage checking';
  if (percent >= 90) return 'Free up space soon';
  if (percent >= 75) return 'Worth keeping an eye on';
  return 'Plenty of room';
}

function storageRiskLevel(percent?: number | null): 'healthy' | 'warning' | 'critical' {
  if (percent == null) return 'healthy';
  if (percent >= 90) return 'critical';
  if (percent >= 75) return 'warning';
  return 'healthy';
}

function displayName(state: OverviewState) {
  const name = state.settings?.deviceName || state.metrics?.deviceName || state.metrics?.runAsUser || 'there';
  return name
    .split(/[\s.-]+/)
    .filter(Boolean)[0]
    ?.replace(/^./, (first) => first.toUpperCase()) || 'there';
}

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 100 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}

function formatRelativeTime(value?: string | null) {
  if (!value) return 'Not yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  const absSeconds = Math.abs(seconds);
  if (absSeconds < 60) return seconds < 0 ? 'Soon' : 'Just now';
  const minutes = Math.round(absSeconds / 60);
  if (minutes < 60) return seconds < 0 ? `In ${minutes}m` : `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return seconds < 0 ? `In ${hours}h` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return seconds < 0 ? `In ${days}d` : `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function plural(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function capitalize(value: string) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function iconTone(tone: Tone, large: boolean) {
  const tones = {
    amber: large ? 'bg-[#33210f] text-[#ffb12a]' : 'bg-[#33210f] text-[#ffb12a]',
    blue: large ? 'bg-[#0a2a5e] text-[#38bdf8]' : 'bg-[#0a2a5e] text-[#38bdf8]',
    green: large ? 'bg-[#133d2a] text-[#62e78f]' : 'bg-[#133d2a] text-[#62e78f]',
    purple: large ? 'bg-[#29165d] text-[#a977ff]' : 'bg-[#171e51] text-[#7897ff]',
    red: large ? 'bg-[#431b24] text-[#fb7185]' : 'bg-[#431b24] text-[#fb7185]',
    teal: large ? 'bg-[#0f3d3c] text-[#18d0b0]' : 'bg-[#0f3d3c] text-[#18d0b0]',
  };
  return tones[tone];
}

function cardTone(tone: Tone) {
  const tones = {
    amber: 'bg-po-card-amber',
    blue: 'bg-[#081a36]',
    green: 'bg-[#0a1b2d]',
    purple: 'bg-po-card-purple',
    red: 'bg-po-card-red',
    teal: 'bg-[#082b34]',
  };
  return tones[tone];
}

export default OverviewPage;
