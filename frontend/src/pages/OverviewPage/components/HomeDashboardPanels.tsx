import type { LucideIcon } from 'lucide-react';
import {
  ArrowUpRight,
  Database,
  ExternalLink,
  HardDrive,
  LockKeyhole,
  MoreVertical,
  Pin,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  Wifi,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { AppInstanceView } from '@/types/app';
import type { HomeSystemMetric } from '../extensions/OverviewPage.systemStatus';
import { managedAppIconUrl } from '../extensions/OverviewPage.appTiles';
import { applicationDeepLinkForManagedApp } from '../../ApplicationsPage/extensions/ApplicationsPage.deepLinks';

const artworkGradients = [
  'from-emerald-950 via-slate-950 to-cyan-950',
  'from-blue-950 via-slate-950 to-indigo-950',
  'from-cyan-950 via-slate-950 to-sky-950',
  'from-fuchsia-950 via-slate-950 to-indigo-950',
  'from-orange-950 via-slate-950 to-rose-950',
  'from-violet-950 via-slate-950 to-blue-950',
];

export function InstalledAppsLauncher({ apps }: { apps: AppInstanceView[] }) {
  return (
    <section className="relative z-10" aria-labelledby="home-apps-heading">
      <div className="mb-3 flex items-end justify-between gap-3 px-1">
        <h2 className="m-0 text-xl font-semibold tracking-tight text-white" id="home-apps-heading">Your Apps</h2>
        <Link className="inline-flex items-center gap-1 text-xs font-medium text-cyan-200 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70" to="/apps">
          View all
          <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
      {apps.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6" role="list">
          {apps.slice(0, 6).map((app, index) => <InstalledAppCard app={app} index={index} key={app.appInstanceId} />)}
        </div>
      ) : (
        <EmptyAppCard />
      )}
    </section>
  );
}

function InstalledAppCard({ app, index }: { app: AppInstanceView; index: number }) {
  const openUrl = app.privateUrl || app.localUrl;
  const detailRoute = applicationDeepLinkForManagedApp(app.catalogAppId, { panel: 'manage' });
  const iconUrl = managedAppIconUrl(app);
  const status = appStatus(app.userStatus);
  return (
    <article className="group relative min-w-0 overflow-hidden rounded-xl border border-sky-300/20 bg-[#0b1831]/90 shadow-lg shadow-slate-950/20 transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/50 hover:bg-[#10213f] hover:shadow-xl hover:shadow-cyan-950/30" role="listitem">
      <a
        aria-label={`Open ${app.name}`}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-300/80"
        href={openUrl || detailRoute}
        rel={openUrl ? 'noreferrer' : undefined}
        target={openUrl ? '_blank' : undefined}
      >
        <div className={cn('relative flex h-28 items-center justify-center overflow-hidden bg-gradient-to-br sm:h-32', artworkGradients[index % artworkGradients.length])}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgb(56_189_248_/_0.22),transparent_55%)] opacity-80 transition duration-300 group-hover:scale-105" />
          <Sparkles className="relative z-10 size-14 text-cyan-100/80" />
          {iconUrl && <img alt="" className="absolute z-20 size-20 object-contain drop-shadow-[0_8px_18px_rgb(0_0_0_/_0.5)] transition duration-300 group-hover:scale-[1.03]" onError={(event) => { event.currentTarget.style.display = 'none'; }} src={iconUrl} />}
          <span className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0b1831] to-transparent" />
        </div>
        <div className="space-y-1 px-3 pb-3 pt-2">
          <p className="m-0 truncate text-sm font-semibold text-white">{app.name}</p>
          <p className="m-0 truncate text-xs text-slate-400">{app.category}</p>
          <div className="flex items-center justify-between gap-1.5 pt-1 text-[0.7rem] font-medium text-slate-300">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className={cn('size-1.5 rounded-full', status.tone === 'success' ? 'bg-emerald-400' : status.tone === 'warning' ? 'bg-amber-400' : 'bg-slate-500')} />
              <span>{status.label}</span>
            </span>
            <ExternalLink aria-hidden="true" className="size-3.5 shrink-0 text-slate-400" />
          </div>
        </div>
      </a>
      <Link aria-label={`${app.name} management actions`} className="absolute bottom-3 right-2 inline-flex size-7 items-center justify-center rounded-md text-slate-400 opacity-70 transition hover:bg-white/10 hover:text-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80" to={detailRoute}>
        <MoreVertical className="size-3.5" />
      </Link>
    </article>
  );
}

function EmptyAppCard() {
  return (
    <div className="flex min-h-44 items-center justify-between gap-4 rounded-xl border border-dashed border-cyan-300/25 bg-slate-950/40 px-5 py-4">
      <div className="flex items-center gap-3">
        <div className="grid size-12 place-items-center rounded-xl bg-cyan-400/10 text-cyan-200"><Store className="size-5" /></div>
        <div>
          <p className="m-0 text-sm font-semibold text-white">No apps installed yet</p>
          <p className="m-0 mt-1 text-xs text-slate-400">Discover a verified app to get started.</p>
        </div>
      </div>
      <Link className="shrink-0 rounded-lg bg-cyan-300 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80" to="/discover">Open Discover</Link>
    </div>
  );
}

export function DashboardSummaryGrid({ metrics, pinnedCount, observedCount }: { metrics: Record<'access' | 'backups' | 'docker' | 'storage', HomeSystemMetric>; pinnedCount: number; observedCount: number }) {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
      <SystemStatusSummary metrics={metrics} observedCount={observedCount} pinnedCount={pinnedCount} />
      <QuickLinksPanel />
    </div>
  );
}

function SystemStatusSummary({ metrics, observedCount, pinnedCount }: { metrics: Record<'access' | 'backups' | 'docker' | 'storage', HomeSystemMetric>; observedCount: number; pinnedCount: number }) {
  const items = [
    { detail: metrics.docker.detail, icon: Server, label: 'Docker', tone: metrics.docker.tone, value: metrics.docker.value },
    { detail: observedCount ? `${observedCount} service${observedCount === 1 ? '' : 's'} to review` : `${pinnedCount} pinned service${pinnedCount === 1 ? '' : 's'}`, icon: Pin, label: 'Pinned services', tone: 'info' as const, value: pinnedCount ? 'Available' : 'None' },
    { detail: metrics.access.detail, icon: Wifi, label: 'Access', tone: metrics.access.tone, value: metrics.access.value },
    { detail: metrics.backups.detail, icon: ShieldCheck, label: 'Backups', tone: metrics.backups.tone, value: metrics.backups.value },
    { detail: metrics.storage.detail, icon: HardDrive, label: 'Storage', tone: metrics.storage.tone, value: metrics.storage.value },
  ];
  return (
    <section className="rounded-2xl border border-sky-300/20 bg-[#07142b]/90 p-4 shadow-xl shadow-slate-950/20" aria-labelledby="home-system-status-heading">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <ActivityIcon />
          <h2 className="m-0 text-lg font-semibold text-white" id="home-system-status-heading">System Status</h2>
        </div>
        <Link className="inline-flex items-center gap-1 text-xs font-medium text-cyan-200 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70" to="/diagnostics">View all <ArrowUpRight className="size-3.5" /></Link>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 md:grid-cols-3" role="list">
        {items.map((item) => <SystemStatusItem {...item} key={item.label} />)}
      </div>
    </section>
  );
}

function SystemStatusItem({ detail, icon: Icon, label, tone, value }: { detail: string; icon: LucideIcon; label: string; tone: string; value: string }) {
  const statusTone = statusToneClass(tone);
  return (
    <div className="min-w-0 rounded-xl border border-sky-300/10 bg-slate-950/25 px-3 py-2.5" role="listitem">
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-cyan-200/80" />
        <p className="m-0 truncate text-xs font-semibold text-slate-200">{label}</p>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <span className={cn('size-1.5 shrink-0 rounded-full', statusTone.dot)} />
        <p className={cn('m-0 truncate text-xs font-semibold', statusTone.text)}>{value}</p>
      </div>
      <p className="m-0 mt-1 line-clamp-1 text-[0.68rem] text-slate-500">{detail}</p>
    </div>
  );
}

function ActivityIcon() {
  return <span className="grid size-7 place-items-center rounded-lg bg-cyan-400/10 text-cyan-200"><Wifi className="size-4" /></span>;
}

function QuickLinksPanel() {
  const links = [
    { description: 'Open remote access', icon: LockKeyhole, label: 'Access Portal', to: '/access' },
    { description: 'Discover new apps', icon: Store, label: 'App Store', to: '/discover' },
    { description: 'View & restore', icon: ShieldCheck, label: 'Backups', to: '/backups' },
    { description: 'View logs', icon: Database, label: 'System Logs', to: '/activity' },
    { description: 'Network overview', icon: Wifi, label: 'Network', to: '/access' },
    { description: 'Configure system', icon: Settings, label: 'Settings', to: '/settings' },
  ];
  return (
    <section className="rounded-2xl border border-sky-300/20 bg-[#07142b]/90 p-4 shadow-xl shadow-slate-950/20" aria-labelledby="home-quick-links-heading">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid size-7 place-items-center rounded-lg bg-indigo-400/10 text-indigo-200"><ArrowUpRight className="size-4" /></span>
        <h2 className="m-0 text-lg font-semibold text-white" id="home-quick-links-heading">Quick Links</h2>
      </div>
      <div className="grid grid-cols-2 gap-2" role="list">
        {links.map((link) => <QuickLinkItem {...link} key={link.label} />)}
      </div>
    </section>
  );
}

function QuickLinkItem({ description, icon: Icon, label, to }: { description: string; icon: LucideIcon; label: string; to: string }) {
  return (
    <Link className="group flex min-w-0 items-center gap-2.5 rounded-xl border border-sky-300/10 bg-slate-950/25 px-2.5 py-2.5 transition hover:-translate-y-px hover:border-cyan-300/35 hover:bg-cyan-400/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80" role="listitem" to={to}>
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-cyan-400/10 text-cyan-200 transition group-hover:bg-cyan-400/15"><Icon className="size-4" /></span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold text-slate-100">{label}</span>
        <span className="mt-0.5 block truncate text-[0.68rem] text-slate-500">{description}</span>
      </span>
    </Link>
  );
}

function appStatus(status: string) {
  if (status === 'Ready') return { label: 'Running', tone: 'success' as const };
  if (status === 'Needs setup' || status === 'Needs attention' || status === 'Missing') return { label: status, tone: 'warning' as const };
  if (status === 'Starting') return { label: 'Starting', tone: 'info' as const };
  return { label: status || 'Unavailable', tone: 'neutral' as const };
}

function statusToneClass(tone: string): { dot: string; text: string } {
  if (tone === 'success' || tone === 'teal') return { dot: 'bg-emerald-400', text: 'text-emerald-200' };
  if (tone === 'warning') return { dot: 'bg-amber-400', text: 'text-amber-200' };
  if (tone === 'danger' || tone === 'critical') return { dot: 'bg-red-400', text: 'text-red-200' };
  if (tone === 'info') return { dot: 'bg-cyan-300', text: 'text-cyan-200' };
  return { dot: 'bg-slate-500', text: 'text-slate-300' };
}
