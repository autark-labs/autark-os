import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock3,
  DatabaseBackup,
  ExternalLink,
  HardDrive,
  Loader2,
  Lock,
  Network,
  Plus,
  Rocket,
  Server,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BackupAPIClient } from '@/api/BackupAPIClient';
import { RefreshStatus } from '@/components/RefreshStatus';
import { EmptyState, PageHero, PageSection, QuickAccessAppTile, SoftCard, StatusPulse } from '@/components/project-os/ProjectOSComponents';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { InstalledAppsAPIClient } from '@/api/InstalledAppsAPIClient';
import { MarketplaceAPIClient } from '@/api/MarketplaceAPIClient';
import { NetworkAPIClient } from '@/api/NetworkAPIClient';
import { SystemAPIClient } from '@/api/SystemAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { cn } from '@/lib/utils';
import type { AppAccessCheck, AppReliabilitySummary, AppRuntimeView, AppTelemetry, AppUpdateStatus } from '@/types/app';
import type { BackupReport } from '@/types/backup';
import type { MarketplaceApp } from '@/types/marketplace';
import type { NetworkDiagnosticsReport, SystemSetupStatus, TailscaleDevice, TailscaleStatus } from '@/types/network';
import type { SystemDoctorStatus } from '@/types/system';

type OverviewState = {
  accessByAppId: Record<string, AppAccessCheck>;
  apps: AppRuntimeView[];
  backup: BackupReport | null;
  diagnostics: NetworkDiagnosticsReport | null;
  doctor: SystemDoctorStatus | null;
  marketplace: MarketplaceApp[];
  reliability: AppReliabilitySummary | null;
  setup: SystemSetupStatus | null;
  tailscale: TailscaleStatus | null;
  tailnetDevices: TailscaleDevice[];
  telemetryByAppId: Record<string, AppTelemetry>;
  updates: AppUpdateStatus[];
};

const emptyState: OverviewState = {
  accessByAppId: {},
  apps: [],
  backup: null,
  diagnostics: null,
  doctor: null,
  marketplace: [],
  reliability: null,
  setup: null,
  tailscale: null,
  tailnetDevices: [],
  telemetryByAppId: {},
  updates: [],
};

function OldOverviewPage() {
  const [state, setState] = useState<OverviewState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const loadOverview = useCallback(async ({ background = false } = {}) => {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    const results = await Promise.allSettled([
        InstalledAppsAPIClient.listApps(),
        InstalledAppsAPIClient.telemetry(),
        InstalledAppsAPIClient.accessChecks(),
        NetworkAPIClient.diagnostics(),
        NetworkAPIClient.tailscaleStatus(),
        NetworkAPIClient.tailscaleDevices(),
        NetworkAPIClient.setupStatus(),
        MarketplaceAPIClient.listApps(),
        InstalledAppsAPIClient.reliabilitySummary(),
        BackupAPIClient.report(),
        InstalledAppsAPIClient.updates(),
        SystemAPIClient.doctor(),
    ] as const);
    const [appsResult, telemetryResult, accessResult, diagnosticsResult, tailscaleResult, devicesResult, setupResult, marketplaceResult, reliabilityResult, backupResult, updatesResult, doctorResult] = results;
    const failures = results.filter((result) => result.status === 'rejected');
    try {
      setState({
        accessByAppId: valueOr(accessResult, {}),
        apps: valueOr(appsResult, []),
        backup: valueOr(backupResult, null),
        diagnostics: valueOr(diagnosticsResult, null),
        doctor: valueOr(doctorResult, null),
        marketplace: valueOr(marketplaceResult, []),
        reliability: valueOr(reliabilityResult, null),
        setup: valueOr(setupResult, null),
        tailscale: valueOr(tailscaleResult, null),
        tailnetDevices: valueOr(devicesResult, []),
        telemetryByAppId: valueOr(telemetryResult, {}),
        updates: valueOr(updatesResult, []),
      });
      setUpdatedAt(new Date());
      setError(failures.length > 0 ? apiErrorMessage(failures[0].reason, 'Some overview data could not be loaded.') : null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to prepare overview.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
    const interval = window.setInterval(() => loadOverview({ background: true }), 5000);
    return () => window.clearInterval(interval);
  }, [loadOverview]);

  const summary = useMemo(() => buildOverviewSummary(state), [state]);
  const featuredApps = useMemo(() => installedAppCards(state.apps), [state.apps]);
  const issues = useMemo(() => buildIssues(state), [state]);
  const nextActions = useMemo(() => buildNextActions(state), [state]);
  const suggestions = useMemo(() => marketplaceSuggestions(state.marketplace, state.apps), [state.apps, state.marketplace]);
  const activity = useMemo(() => recentActivity(state), [state]);

  if (loading) {
    return (
      <section className="grid min-h-[520px] place-items-center rounded-lg border border-white/10 bg-slate-950/55 text-slate-400">
        <div className="text-center">
          <Loader2 className="mx-auto mb-3 size-6 animate-spin text-violet-300" />
          Loading your homelab
        </div>
      </section>
    );
  }

  return (
    <section className="grid w-full max-w-[1480px] gap-5">
      <HeroPanel backup={state.backup} error={error} refreshing={refreshing} summary={summary} updatedAt={updatedAt} onRefresh={() => loadOverview({ background: true })} />

      <NextBestActionPanel actions={nextActions} />

      <div className="grid gap-4 lg:grid-cols-4">
        <SignalCard icon={Boxes} label="Apps running" tone="emerald" value={`${summary.runningApps}/${summary.totalApps}`} detail={summary.totalApps === 0 ? 'No apps installed yet' : `${summary.stoppedApps} stopped`} />
        <SignalCard icon={Lock} label="Private access" tone={summary.privateReady ? 'sky' : 'amber'} value={`${summary.privateApps}`} detail={summary.privateReady ? 'Tailnet connected' : 'Setup needs attention'} />
        <SignalCard icon={Activity} label="Open issues" tone={summary.issueCount > 0 ? 'amber' : 'emerald'} value={`${summary.issueCount}`} detail={summary.reliabilityHeadline} />
        <SignalCard icon={Zap} label="Updates" tone={summary.updateCount > 0 ? 'amber' : 'violet'} value={`${summary.updateCount}`} detail={summary.updateCount > 0 ? 'Ready to review' : 'Trusted catalog current'} />
      </div>

      <StabilityOverviewCard reliability={state.reliability} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <PageSection
          action={(
            <Button asChild className="border-po-border-strong bg-po-surface-inset text-po-text-secondary hover:bg-po-surface-hover hover:text-po-text" size="sm" variant="outline">
              <Link to="/applications">Manage apps <ArrowRight className="size-4" /></Link>
            </Button>
          )}
          className="rounded-po-lg border border-po-border bg-po-surface p-5 shadow-po-md"
          description="Open the services you use most, or jump into management when something needs attention."
          title="Quick Access"
        >
          <div className="grid gap-3">
            {featuredApps.length === 0 ? (
              <EmptyState
                action={(
                  <Button asChild className="bg-po-brand text-white hover:bg-po-brand/90">
                    <Link to="/marketplace">Browse Marketplace</Link>
                  </Button>
                )}
                description="Install something useful from the Marketplace and it will appear here for daily use."
                icon={Rocket}
                title="Start with your first app"
                tone="brand"
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {featuredApps.map((app) => (
                  <OverviewQuickAccessTile access={state.accessByAppId[app.appId]} app={app} key={app.appId} />
                ))}
                <QuickAccessAppTile
                  actionLabel="Manage"
                  description="Add shortcuts, review links, and manage installed services."
                  icon={<Plus className="size-7" />}
                  name="Manage apps"
                  status="Project OS"
                  statusTone="brand"
                  to="/applications"
                />
              </div>
            )}
          </div>
        </PageSection>

        <Card className="border-white/10 bg-slate-950/55 py-0 text-slate-100">
          <CardHeader className="border-b border-white/10 p-5">
            <CardTitle className="text-lg text-white">Needs Attention</CardTitle>
            <p className="mt-1 text-sm text-slate-400">Plain-language next steps for anything that looks off.</p>
          </CardHeader>
          <CardContent className="grid gap-3 p-5">
            {issues.length === 0 ? (
              <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 p-4">
                <div className="flex items-center gap-3 text-emerald-100">
                  <CheckCircle2 className="size-5" />
                  <span className="font-semibold">Everything important looks ready.</span>
                </div>
                <p className="mt-2 text-sm text-emerald-100/70">Apps, host setup, and private access are not reporting urgent issues.</p>
              </div>
            ) : (
              issues.slice(0, 5).map((issue) => <IssueRow issue={issue} key={issue.id} />)
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(340px,0.75fr)_minmax(0,1.25fr)]">
        <Card className="border-white/10 bg-slate-950/55 py-0 text-slate-100">
          <CardHeader className="border-b border-white/10 p-5">
            <CardTitle className="text-lg text-white">Private Network</CardTitle>
            <p className="mt-1 text-sm text-slate-400">Quick visibility into app access from your trusted devices.</p>
          </CardHeader>
          <CardContent className="grid gap-4 p-5">
            <NetworkPulse connected={Boolean(state.tailscale?.connected)} privateApps={summary.privateApps} totalDevices={summary.onlineDevices} />
            <div className="grid gap-3">
              <StatusLine icon={ShieldCheck} label="Project OS" value={state.tailscale?.connected ? state.tailscale.dnsName || state.tailscale.deviceName || 'Connected' : state.tailscale?.message || 'Waiting for Tailscale'} />
              <StatusLine icon={Network} label="Tailnet" value={state.tailscale?.tailnetName || 'Not connected'} />
              <StatusLine icon={Lock} label="Private apps" value={`${summary.privateApps} configured`} />
            </div>
            <Button asChild className="border-slate-700/50 bg-slate-950/50 text-slate-200 hover:bg-slate-800" variant="outline">
              <Link to="/network">Open network map <ArrowRight className="size-4" /></Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-slate-950/55 py-0 text-slate-100">
          <CardHeader className="border-b border-white/10 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg text-white">Suggested Next</CardTitle>
                <p className="mt-1 text-sm text-slate-400">Useful additions based on what is not installed yet.</p>
              </div>
              <Button asChild className="border-slate-700/50 bg-slate-950/50 text-slate-200 hover:bg-slate-800" size="sm" variant="outline">
                <Link to="/marketplace">Marketplace <ArrowRight className="size-4" /></Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 p-5 md:grid-cols-3">
            {suggestions.map((app) => <SuggestionCard app={app} key={app.id} />)}
            {suggestions.length === 0 && <EmptyPanel icon={Sparkles} title="Marketplace covered" text="Your installed apps already cover the current recommendations." to="/marketplace" actionLabel="Browse anyway" />}
          </CardContent>
        </Card>
      </div>

      <Card className="border-white/10 bg-slate-950/55 py-0 text-slate-100">
        <CardHeader className="border-b border-white/10 p-5">
          <CardTitle className="text-lg text-white">Recent Activity</CardTitle>
          <p className="mt-1 text-sm text-slate-400">A quick log of meaningful changes across your apps.</p>
        </CardHeader>
        <CardContent className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
          {activity.length === 0 ? (
            <div className="text-sm text-slate-400">No app activity has been recorded yet.</div>
          ) : (
            activity.slice(0, 8).map((event) => <ActivityCard event={event} key={`${event.appId}-${event.id}`} />)
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function NextBestActionPanel({ actions }: { actions: NextAction[] }) {
  const [primary, ...secondary] = actions;
  if (!primary) {
    return (
      <Card className="overflow-hidden border-emerald-400/20 bg-emerald-500/10 py-0 text-emerald-50 shadow-[0_18px_60px_rgba(0,0,0,0.16)]">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex min-w-0 items-center gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-emerald-300/25 bg-emerald-500/10 text-emerald-100">
              <CheckCircle2 className="size-6" />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-normal text-emerald-200/80">Next best action</p>
              <h2 className="mt-1 text-xl font-black text-white">Nothing needs your attention right now</h2>
              <p className="mt-1 text-sm text-emerald-100/75">Project OS will keep checking app health, private access, backups, and host readiness.</p>
            </div>
          </div>
          <Button asChild className="border-emerald-300/25 bg-slate-950/40 text-emerald-100 hover:bg-slate-900" variant="outline">
            <Link to="/marketplace">
              Browse apps
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const Icon = primary.icon;
  return (
    <Card className={cn('overflow-hidden py-0 text-slate-100 shadow-[0_18px_70px_rgba(0,0,0,0.2)]', actionTone(primary.tone, 'card'))}>
      <CardContent className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.72fr)]">
        <div className="flex min-w-0 gap-4">
          <span className={cn('grid size-12 shrink-0 place-items-center rounded-xl border', actionTone(primary.tone, 'icon'))}>
            <Icon className="size-6" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-black uppercase tracking-normal text-slate-400">Next best action</p>
              <Badge className={cn('border text-xs', actionTone(primary.tone, 'badge'))} variant="outline">{primary.badge}</Badge>
            </div>
            <h2 className="mt-2 text-2xl font-black leading-tight text-white">{primary.title}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{primary.reason}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild className={cn(primary.tone === 'danger' ? 'bg-red-500 text-white hover:bg-red-400' : primary.tone === 'warning' ? 'bg-amber-500 text-slate-950 hover:bg-amber-400' : 'bg-violet-600 text-white hover:bg-violet-500')}>
                <Link to={primary.to}>
                  {primary.actionLabel}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              {primary.secondaryTo && (
                <Button asChild className="border-slate-700/50 bg-slate-950/50 text-slate-200 hover:bg-slate-800" variant="outline">
                  <Link to={primary.secondaryTo}>{primary.secondaryLabel || 'View details'}</Link>
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-3">
          <p className="text-xs font-semibold uppercase text-slate-500">Other useful next steps</p>
          {secondary.slice(0, 2).map((action) => {
            const SecondaryIcon = action.icon;
            return (
              <Link className="group flex items-start gap-3 rounded-lg border border-white/10 bg-slate-950/45 p-3 transition hover:border-violet-300/30 hover:bg-slate-900/70" key={action.id} to={action.to}>
                <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg border', actionTone(action.tone, 'icon'))}>
                  <SecondaryIcon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-white">{action.title}</span>
                  <span className="mt-1 line-clamp-2 block text-sm text-slate-400">{action.reason}</span>
                </span>
                <ArrowRight className="mt-1 size-4 shrink-0 text-slate-500 transition group-hover:text-violet-200" />
              </Link>
            );
          })}
          {secondary.length === 0 && <p className="rounded-lg border border-white/10 bg-slate-950/45 p-3 text-sm text-slate-400">No secondary actions right now.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function HeroPanel({ backup, error, refreshing, summary, updatedAt, onRefresh }: { backup: BackupReport | null; error: string | null; refreshing: boolean; summary: OverviewSummary; updatedAt: Date | null; onRefresh: () => void }) {
  const heroState = overviewHeroState(summary, backup, error);
  const backupLabel = backupStatusLabel(backup);

  return (
    <PageHero
      accent="overview"
      actions={(
        <>
          <Button asChild className="bg-po-brand text-white hover:bg-po-brand/90">
            <Link to="/marketplace"><Plus className="size-4" /> Add app</Link>
          </Button>
          <Button asChild className="border-po-border-strong bg-po-surface-inset text-po-text-secondary hover:bg-po-surface-hover hover:text-po-text" variant="outline">
            <Link to="/applications"><Boxes className="size-4" /> View apps</Link>
          </Button>
        </>
      )}
      description={heroState.description}
      icon={ShieldCheck}
      status={<StatusPulse detail={heroState.statusDetail} label={heroState.statusLabel} tone={heroState.tone} />}
      title={heroState.title}
    >
      {error && (
        <div className="mb-5 flex max-w-3xl items-center gap-3 rounded-po-md border border-[var(--po-danger-border)] bg-[var(--po-danger-soft)] p-3 text-sm text-red-100">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <HeroStoryStat icon={Boxes} label="Apps running" tone="success" value={`${summary.runningApps}`} detail={summary.totalApps ? `${summary.totalApps} installed` : 'Ready for your first app'} />
          <HeroStoryStat icon={HardDrive} label="Devices online" tone="info" value={`${summary.onlineDevices}`} detail={summary.privateReady ? 'Trusted access ready' : 'Private access not connected'} />
          <HeroStoryStat icon={DatabaseBackup} label="Backups" tone={backupLabel.tone} value={backupLabel.value} detail={backupLabel.detail} />
          <HeroStoryStat icon={AlertTriangle} label="Attention" tone={summary.issueCount > 0 ? 'warning' : 'success'} value={`${summary.issueCount}`} detail={summary.issueCount > 0 ? 'Review suggested' : 'No action needed'} />
        </div>

        <SoftCard className="bg-po-surface-soft">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase text-po-text-disabled">Live home check</p>
              <p className="mt-1 text-sm text-po-text-secondary">{updatedAt ? `Updated ${updatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Waiting for first refresh'}</p>
            </div>
            <span className="grid size-11 place-items-center rounded-po-md border border-[var(--po-success-border)] bg-[var(--po-success-soft)] text-emerald-200 shadow-[var(--po-glow-success)]">
              <Zap className="size-5" />
            </span>
          </div>
          <div className="mt-4 grid gap-3">
            <HeroMeter label="Apps available" tone="emerald" value={summary.totalApps ? Math.round((summary.runningApps / summary.totalApps) * 100) : 0} />
            <HeroMeter label="Private access" tone="sky" value={summary.privateReady ? 100 : summary.privateApps > 0 ? 55 : 15} />
            <HeroMeter label="Host setup" tone="violet" value={summary.hostReady ? 100 : 45} />
          </div>
          <div className="mt-4">
            <RefreshStatus intervalLabel="Auto-updates every 5s" onRefresh={onRefresh} refreshing={refreshing} updatedAt={updatedAt} />
          </div>
        </SoftCard>
      </div>
    </PageHero>
  );
}

function HeroStoryStat({ detail, icon: Icon, label, tone, value }: { detail: string; icon: LucideIcon; label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'teal' | 'neutral'; value: string; }) {
  const toneClasses = {
    brand: 'border-po-border-accent bg-[var(--po-brand-soft)] text-po-brand-strong',
    danger: 'border-[var(--po-danger-border)] bg-[var(--po-danger-soft)] text-red-100',
    info: 'border-[var(--po-info-border)] bg-[var(--po-info-soft)] text-sky-100',
    neutral: 'border-po-border-strong bg-po-surface-inset text-po-text-secondary',
    success: 'border-[var(--po-success-border)] bg-[var(--po-success-soft)] text-emerald-100',
    teal: 'border-[var(--po-teal-border)] bg-[var(--po-teal-soft)] text-teal-100',
    warning: 'border-[var(--po-warning-border)] bg-[var(--po-warning-soft)] text-amber-100',
  };

  return (
    <div className="rounded-po-md border border-po-border bg-po-surface-soft p-4">
      <div className="flex items-center gap-3">
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-po-sm border', toneClasses[tone])}>
          <Icon className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-2xl font-bold leading-none text-po-text">{value}</span>
          <span className="mt-1 block text-xs font-semibold uppercase text-po-text-disabled">{label}</span>
        </span>
      </div>
      <p className="mt-3 text-sm leading-5 text-po-text-muted">{detail}</p>
    </div>
  );
}

function overviewHeroState(summary: OverviewSummary, backup: BackupReport | null, error: string | null): { description: string; statusDetail: string; statusLabel: string; title: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'teal' | 'neutral' } {
  if (error) {
    return {
      description: 'Project OS is still available, but one or more background checks could not complete. The details are shown below so you know what changed.',
      statusDetail: 'Some data is missing',
      statusLabel: 'Needs a look',
      title: 'Your digital home is online, but Project OS could not check everything.',
      tone: 'warning',
    };
  }

  if (summary.issueCount > 0 || summary.reliabilityPosture === 'critical') {
    return {
      description: 'Your apps are still visible here, and Project OS has highlighted the items most likely to need your attention.',
      statusDetail: `${summary.issueCount} ${summary.issueCount === 1 ? 'item' : 'items'} to review`,
      statusLabel: 'Attention needed',
      title: 'Your digital home is running, with a few things to review.',
      tone: summary.reliabilityPosture === 'critical' ? 'danger' : 'warning',
    };
  }

  if (!summary.hostReady || !summary.privateReady || backup?.status === 'attention' || backup?.status === 'warning') {
    return {
      description: 'Core services are available. Project OS will keep guiding setup, private access, and backup protection from here.',
      statusDetail: 'Setup guidance ready',
      statusLabel: 'Mostly healthy',
      title: 'Your digital home is taking shape.',
      tone: 'info',
    };
  }

  return {
    description: 'Your apps, private access, and protection checks are in a calm state. Project OS will keep watching in the background.',
    statusDetail: 'No action required',
    statusLabel: 'Healthy',
    title: 'Your digital home is healthy and protected.',
    tone: 'success',
  };
}

function backupStatusLabel(backup: BackupReport | null): { detail: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'teal' | 'neutral'; value: string } {
  if (!backup) {
    return { detail: 'Status loading', tone: 'neutral', value: 'Checking' };
  }

  if (backup.failedBackups > 0) {
    return { detail: `${backup.failedBackups} failed backup ${backup.failedBackups === 1 ? 'needs' : 'need'} review`, tone: 'danger', value: 'Review' };
  }

  if (!backup.settings.automaticBackupsEnabled) {
    return { detail: 'Routine backups are off', tone: 'warning', value: 'Manual' };
  }

  if (backup.settings.lastSuccessfulRoutineRun) {
    return { detail: `Last backup ${formatRelative(backup.settings.lastSuccessfulRoutineRun.createdAt)}`, tone: backup.unprotectedApps > 0 ? 'warning' : 'success', value: backup.unprotectedApps > 0 ? 'Partial' : 'Protected' };
  }

  return {
    detail: backup.settings.nextRunLabel || backup.summary,
    tone: backup.status === 'protected' ? 'success' : 'warning',
    value: backup.status === 'protected' ? 'Ready' : 'Review',
  };
}

function SignalCard({ detail, icon: Icon, label, tone, value }: { detail: string; icon: LucideIcon; label: string; tone: 'emerald' | 'sky' | 'amber' | 'violet'; value: string }) {
  const tones = {
    amber: 'border-amber-300/20 bg-amber-500/10 text-amber-100',
    emerald: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100',
    sky: 'border-sky-400/20 bg-sky-500/10 text-sky-100',
    violet: 'border-violet-400/20 bg-violet-500/10 text-violet-100',
  };
  return (
    <Card className="border-white/10 bg-slate-950/55 py-0 text-slate-100">
      <CardContent className="flex items-center gap-4 p-4">
        <span className={cn('grid size-11 shrink-0 place-items-center rounded-lg border', tones[tone])}>
          <Icon className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-2xl font-bold text-white">{value}</span>
          <span className="block text-xs font-semibold uppercase text-slate-500">{label}</span>
          <span className="mt-1 block truncate text-sm text-slate-400">{detail}</span>
        </span>
      </CardContent>
    </Card>
  );
}

function StabilityOverviewCard({ reliability }: { reliability: AppReliabilitySummary | null }) {
  const posture = reliability?.posture || 'unknown';
  const tone = posture === 'healthy' ? 'emerald' : posture === 'critical' ? 'red' : 'amber';
  const toneClasses = {
    amber: 'border-amber-300/20 bg-amber-500/10 text-amber-100',
    emerald: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100',
    red: 'border-red-400/20 bg-red-500/10 text-red-100',
  };
  return (
    <Card className="overflow-hidden border-white/10 bg-slate-950/55 py-0 text-slate-100">
      <CardContent className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <div className="flex min-w-0 gap-4">
          <span className={cn('grid size-12 shrink-0 place-items-center rounded-xl border', toneClasses[tone])}>
            <ShieldCheck className="size-6" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-white">{reliability?.headline || 'Stability status unavailable'}</h3>
              <Badge className={cn('border capitalize', toneClasses[tone])} variant="outline">{posture}</Badge>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">{reliability?.summary || 'Project OS could not load the stability summary yet.'}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <MiniSignal label="Ready" value={`${reliability?.readyApps ?? 0}`} />
              <MiniSignal label="Needs help" value={`${(reliability?.needsAttentionApps ?? 0) + (reliability?.unavailableApps ?? 0)}`} />
              <MiniSignal label="Auto-fix on" value={`${reliability?.autoRepairEnabledApps ?? 0}`} />
              <MiniSignal label="Recent fixes" value={`${reliability?.recentSuccessfulRepairs ?? 0}`} />
            </div>
          </div>
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Stability feed</p>
            <Button asChild className="h-8 border-slate-700/50 bg-slate-950/50 text-slate-200 hover:bg-slate-800" size="sm" variant="outline">
              <Link to="/applications">Open details <ArrowRight className="size-3.5" /></Link>
            </Button>
          </div>
          {reliability?.recentActivity.length ? reliability.recentActivity.slice(0, 3).map((event) => (
            <div className="rounded-lg border border-white/10 bg-slate-900/45 p-3" key={`${event.appId}-${event.id}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-semibold text-white">{event.appName}</p>
                <Badge className={cn('border text-xs', event.tone === 'success' && 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100', event.tone === 'danger' && 'border-red-300/20 bg-red-500/10 text-red-100', event.tone === 'warning' && 'border-amber-300/20 bg-amber-500/10 text-amber-100', event.tone === 'neutral' && 'border-slate-700 bg-slate-900 text-slate-300')} variant="outline">
                  {event.tone}
                </Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-slate-400">{event.message}</p>
            </div>
          )) : (
            <div className="rounded-lg border border-white/10 bg-slate-900/45 p-3 text-sm text-slate-400">No stability activity recorded yet.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniSignal({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/45 p-3">
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function OverviewQuickAccessTile({ access, app }: { access?: AppAccessCheck; app: AppRuntimeView }) {
  const privateUrl = app.settings?.privateAccessUrl;
  const openUrl = privateUrl || app.accessUrl || undefined;
  const unavailable = access?.status && access.status !== 'reachable' && app.friendlyStatus !== 'Ready';
  const status = unavailable ? 'Needs attention' : app.friendlyStatus === 'Ready' ? 'Ready' : app.friendlyStatus || 'Installed';
  const statusTone = unavailable ? 'warning' : app.friendlyStatus === 'Ready' ? 'success' : 'neutral';

  return (
    <QuickAccessAppTile
      actionLabel={openUrl ? 'Open' : 'Manage'}
      description={app.description || app.category || 'Installed app'}
      href={openUrl}
      icon={<AppTileImage app={app} />}
      name={app.appName}
      status={openUrl ? status : 'No direct link'}
      statusTone={openUrl ? statusTone : 'warning'}
      to={openUrl ? undefined : '/applications'}
    />
  );
}

function AppLaunchCard({ access, app, telemetry }: { access?: AppAccessCheck; app: AppRuntimeView; telemetry?: AppTelemetry }) {
  const privateUrl = app.settings?.privateAccessUrl;
  const openUrl = privateUrl || app.accessUrl;
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/45 p-4 transition hover:border-violet-300/35 hover:bg-slate-900/70">
      <div className="flex items-start gap-3">
        <AppTileImage app={app} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold text-white">{app.appName}</h3>
            <Badge className={cn('border', app.friendlyStatus === 'Ready' ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200' : 'border-amber-300/25 bg-amber-500/10 text-amber-100')} variant="outline">
              {app.friendlyStatus === 'Ready' ? 'Running' : app.friendlyStatus}
            </Badge>
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-slate-400">{app.description}</p>
          <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
            <span>{telemetry?.cpuPercent || 'CPU n/a'}</span>
            <span>{shortMemory(telemetry?.memoryUsage)}</span>
            <span>{access?.status === 'reachable' ? 'Link ready' : privateUrl ? 'Private link' : 'Local link'}</span>
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {openUrl && (
          <Button asChild className="bg-violet-600 text-white hover:bg-violet-500" size="sm">
            <a href={openUrl} rel="noreferrer" target="_blank">
              Open <ExternalLink className="size-4" />
            </a>
          </Button>
        )}
        <Button asChild className="border-slate-700/50 bg-slate-950/50 text-slate-200 hover:bg-slate-800" size="sm" variant="outline">
          <Link to="/applications">Manage</Link>
        </Button>
      </div>
    </div>
  );
}

function NetworkPulse({ connected, privateApps, totalDevices }: { connected: boolean; privateApps: number; totalDevices: number }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-slate-900/55 p-5">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <PulseNode icon={Server} label="Project OS" tone={connected ? 'emerald' : 'amber'} />
        <div className="grid gap-1">
          <span className={cn('h-0.5 w-20 rounded-full', connected ? 'bg-sky-300' : 'bg-slate-700')} />
          <span className={cn('h-0.5 w-20 rounded-full', privateApps > 0 ? 'bg-emerald-300' : 'bg-slate-700')} />
        </div>
        <PulseNode icon={Lock} label={`${privateApps} private`} tone={privateApps > 0 ? 'sky' : 'slate'} />
      </div>
      <div className="mt-4 flex items-center justify-between rounded-lg border border-slate-700/35 bg-slate-950/45 px-3 py-2 text-sm">
        <span className="text-slate-400">Trusted devices online</span>
        <span className="font-semibold text-white">{totalDevices}</span>
      </div>
    </div>
  );
}

function PulseNode({ icon: Icon, label, tone }: { icon: LucideIcon; label: string; tone: 'emerald' | 'amber' | 'sky' | 'slate' }) {
  const tones = {
    amber: 'border-amber-300/25 bg-amber-500/10 text-amber-100',
    emerald: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100',
    sky: 'border-sky-400/25 bg-sky-500/10 text-sky-100',
    slate: 'border-slate-600/40 bg-slate-800/70 text-slate-300',
  };
  return (
    <div className="grid justify-items-center gap-2">
      <span className={cn('grid size-14 place-items-center rounded-xl border', tones[tone])}>
        <Icon className="size-6" />
      </span>
      <span className="text-xs font-semibold text-slate-300">{label}</span>
    </div>
  );
}

function SuggestionCard({ app }: { app: MarketplaceApp }) {
  return (
    <Link className="group rounded-lg border border-white/10 bg-slate-900/45 p-4 transition hover:border-violet-300/35 hover:bg-slate-900/70" to="/marketplace">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-700/40 bg-slate-950/60">
          <img alt="" className="size-full object-cover" src={app.image} />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold text-white">{app.name}</span>
          <span className="block truncate text-xs text-slate-500">{app.category}</span>
        </span>
      </div>
      <p className="mt-3 line-clamp-2 text-sm text-slate-400">{app.shortValue || app.description}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-violet-300 group-hover:text-violet-200">Install from Marketplace <ArrowRight className="size-3.5" /></span>
    </Link>
  );
}

function IssueRow({ issue }: { issue: OverviewIssue }) {
  return (
    <div className="rounded-lg border border-amber-300/20 bg-amber-500/10 p-3">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-200" />
        <div className="min-w-0">
          <p className="font-semibold text-amber-100">{issue.label}</p>
          <p className="mt-1 text-sm leading-5 text-amber-100/75">{issue.message}</p>
          {issue.to && <Link className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-100" to={issue.to}>{issue.actionLabel || 'Review'} <ArrowRight className="size-3.5" /></Link>}
        </div>
      </div>
    </div>
  );
}

function ActivityCard({ event }: { event: OverviewActivity }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/45 p-3">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Clock3 className="size-3.5" />
        {formatRelative(event.createdAt)}
      </div>
      <p className="mt-2 truncate text-sm font-semibold text-white">{event.appName}</p>
      <p className="mt-1 line-clamp-2 text-sm text-slate-400">{event.message}</p>
    </div>
  );
}

function EmptyPanel({ actionLabel, icon: Icon, text, title, to }: { actionLabel: string; icon: LucideIcon; text: string; title: string; to: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/45 p-5 text-center">
      <Icon className="mx-auto size-8 text-violet-300" />
      <h3 className="mt-3 font-semibold text-white">{title}</h3>
      <p className="mt-1 text-sm text-slate-400">{text}</p>
      <Button asChild className="mt-4 bg-violet-600 text-white hover:bg-violet-500" size="sm">
        <Link to={to}>{actionLabel}</Link>
      </Button>
    </div>
  );
}

function StatusLine({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-700/35 bg-slate-950/45 p-3">
      <span className="flex min-w-0 items-center gap-2">
        <Icon className="size-4 shrink-0 text-violet-300" />
        <span className="text-sm text-slate-400">{label}</span>
      </span>
      <span className="truncate text-right text-sm font-semibold text-white">{value || 'Unavailable'}</span>
    </div>
  );
}

function HeroMeter({ label, tone, value }: { label: string; tone: 'emerald' | 'sky' | 'violet'; value: number }) {
  const colors = {
    emerald: '[&_[data-slot=progress-indicator]]:bg-emerald-400',
    sky: '[&_[data-slot=progress-indicator]]:bg-sky-400',
    violet: '[&_[data-slot=progress-indicator]]:bg-violet-400',
  };
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="text-slate-400">{label}</span>
        <span className="font-semibold text-white">{value}%</span>
      </div>
      <Progress className={cn('h-2 bg-slate-800', colors[tone])} value={value} />
    </div>
  );
}

function AppTileImage({ app }: { app: AppRuntimeView }) {
  return (
    <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-700/40 bg-slate-950/60">
      {app.image ? <img alt="" className="size-full object-cover" src={app.image} /> : <Server className="size-5 text-slate-400" />}
    </span>
  );
}

type OverviewSummary = {
  hostReady: boolean;
  issueCount: number;
  onlineDevices: number;
  privateApps: number;
  privateReady: boolean;
  reliabilityHeadline: string;
  reliabilityPosture: string;
  runningApps: number;
  stoppedApps: number;
  totalApps: number;
  updateCount: number;
};

type OverviewIssue = {
  id: string;
  actionLabel?: string | null;
  label: string;
  message: string;
  to?: string;
};

type OverviewActivity = {
  id: number;
  appId: string;
  appName: string;
  createdAt: string;
  message: string;
};

type NextAction = {
  id: string;
  actionLabel: string;
  badge: string;
  icon: LucideIcon;
  priority: number;
  reason: string;
  secondaryLabel?: string;
  secondaryTo?: string;
  title: string;
  to: string;
  tone: 'danger' | 'warning' | 'info' | 'success';
};

function buildNextActions(state: OverviewState): NextAction[] {
  const actions: NextAction[] = [];
  const brokenApp = state.reliability?.issues.find((issue) => issue.repairAvailable) || state.reliability?.issues[0] || null;
  const stoppedApps = state.apps.filter((app) => app.friendlyStatus === 'Stopped');
  const serviceSetupApp = state.apps.find((app) => app.usageGuide && app.usageGuide.kind !== 'web-app');
  const privateRecommendedApp = state.apps.find((app) => app.desiredAccess?.privateAccessRecommended && !app.settings?.tailscaleEnabled);

  if (brokenApp) {
    actions.push({
      actionLabel: brokenApp.repairAvailable ? 'Open app fixes' : 'Review app',
      badge: brokenApp.status,
      icon: AlertTriangle,
      id: `repair-${brokenApp.appId}`,
      priority: 10,
      reason: brokenApp.detail || brokenApp.message,
      secondaryLabel: 'View stability',
      secondaryTo: '/monitoring',
      title: `${brokenApp.appName} needs attention`,
      to: '/updates',
      tone: 'danger',
    });
  }

  if (state.setup && state.setup.status !== 'ready') {
    actions.push({
      actionLabel: 'Open setup checks',
      badge: 'Setup',
      icon: Server,
      id: 'host-setup',
      priority: 20,
      reason: state.setup.summary,
      secondaryLabel: 'Support tools',
      secondaryTo: '/support',
      title: state.setup.headline,
      to: '/settings',
      tone: 'warning',
    });
  }

  if (!state.tailscale?.connected) {
    actions.push({
      actionLabel: 'Set up private access',
      badge: 'Network',
      icon: Network,
      id: 'tailscale-setup',
      priority: 30,
      reason: state.tailscale?.message || 'Connect Project OS to your private network so apps can be opened from your own devices.',
      secondaryLabel: 'View devices',
      secondaryTo: '/devices',
      title: 'Connect your private network',
      to: '/network',
      tone: 'warning',
    });
  }

  if (state.backup && (!state.backup.settings.automaticBackupsEnabled || state.backup.settings.schedulerHealth === 'warning' || state.backup.unprotectedApps > 0 || state.backup.failedBackups > 0)) {
    const failed = state.backup.failedBackups > 0;
    const schedulerWarning = state.backup.settings.schedulerHealth === 'warning';
    actions.push({
      actionLabel: failed || schedulerWarning ? 'Review backups' : 'Turn on protection',
      badge: 'Backups',
      icon: DatabaseBackup,
      id: 'backup-protection',
      priority: failed || schedulerWarning ? 35 : 45,
      reason: failed ? `${state.backup.failedBackups} backup ${state.backup.failedBackups === 1 ? 'needs' : 'need'} review.` : schedulerWarning ? state.backup.settings.schedulerMessage : state.backup.summary,
      title: failed || schedulerWarning ? 'Backup protection needs a look' : 'Protect your app data',
      to: '/backups',
      tone: failed ? 'danger' : 'warning',
    });
  }

  const update = state.updates.find((item) => item.updateAvailable);
  if (update) {
    actions.push({
      actionLabel: 'Review update',
      badge: 'Update',
      icon: Zap,
      id: `update-${update.appId}`,
      priority: 40,
      reason: `${update.appName} can move from ${update.currentVersion} to ${update.targetVersion}. Project OS will back it up first.`,
      title: 'App update available',
      to: '/applications',
      tone: update.risk === 'low' ? 'info' : 'warning',
    });
  }

  if (privateRecommendedApp) {
    actions.push({
      actionLabel: 'Choose private apps',
      badge: 'Access',
      icon: Lock,
      id: `private-${privateRecommendedApp.appId}`,
      priority: 55,
      reason: `${privateRecommendedApp.appName} works better when your trusted devices can reach it privately.`,
      title: 'Review app access',
      to: '/network',
      tone: 'info',
    });
  }

  if (serviceSetupApp) {
    actions.push({
      actionLabel: 'View setup info',
      badge: 'Setup',
      icon: Sparkles,
      id: `service-setup-${serviceSetupApp.appId}`,
      priority: 60,
      reason: `${serviceSetupApp.appName} has connection details or setup steps for your other devices.`,
      title: `Finish using ${serviceSetupApp.appName}`,
      to: '/applications',
      tone: 'info',
    });
  }

  if (stoppedApps.length > 0) {
    actions.push({
      actionLabel: 'Review apps',
      badge: 'Paused',
      icon: Boxes,
      id: 'stopped-apps',
      priority: 70,
      reason: `${stoppedApps.length} ${stoppedApps.length === 1 ? 'app is' : 'apps are'} paused. Start anything you expect to be available.`,
      title: 'Some apps are paused',
      to: '/applications',
      tone: 'info',
    });
  }

  if (state.apps.length === 0) {
    actions.push({
      actionLabel: 'Browse Marketplace',
      badge: 'Start here',
      icon: Rocket,
      id: 'first-app',
      priority: 80,
      reason: 'Install your first app and Project OS will start tracking health, backups, and private access for it.',
      title: 'Install your first app',
      to: '/marketplace',
      tone: 'success',
    });
  }

  return uniqueById(actions.sort((left, right) => left.priority - right.priority)).slice(0, 3);
}

function buildOverviewSummary(state: OverviewState): OverviewSummary {
  const fallbackIssueCount = (state.diagnostics?.checks.filter((check) => check.status === 'warning').length || 0)
    + (state.diagnostics?.appChecks.filter((check) => check.status === 'warning').length || 0)
    + (state.doctor?.checks.filter((check) => check.status === 'warning').length || state.setup?.checks.filter((check) => check.status === 'warning').length || 0)
    + state.apps.filter((app) => app.friendlyStatus === 'Needs attention').length;
  const updateCount = state.updates.filter((update) => update.updateAvailable).length;
  const reliabilityIssues = (state.reliability ? state.reliability.issues.length : fallbackIssueCount) + updateCount;

  return {
    hostReady: state.setup?.status === 'ready',
    issueCount: reliabilityIssues,
    onlineDevices: state.tailnetDevices.filter((device) => device.online).length,
    privateApps: state.reliability?.privateApps ?? state.apps.filter((app) => app.settings?.tailscaleEnabled).length,
    privateReady: Boolean(state.tailscale?.connected),
    reliabilityHeadline: state.reliability?.headline || (reliabilityIssues > 0 ? 'Review recommended' : 'No blocking items'),
    reliabilityPosture: state.reliability?.posture || (reliabilityIssues > 0 ? 'warning' : 'healthy'),
    runningApps: state.reliability?.readyApps ?? state.apps.filter((app) => app.friendlyStatus === 'Ready').length,
    stoppedApps: state.reliability?.pausedApps ?? state.apps.filter((app) => app.friendlyStatus === 'Stopped').length,
    totalApps: state.reliability?.totalApps ?? state.apps.length,
    updateCount,
  };
}

function actionTone(tone: NextAction['tone'], part: 'card' | 'icon' | 'badge') {
  const tones = {
    danger: {
      badge: 'border-red-300/25 bg-red-500/10 text-red-100',
      card: 'border-red-300/20 bg-red-500/10',
      icon: 'border-red-300/25 bg-red-500/10 text-red-100',
    },
    info: {
      badge: 'border-sky-300/25 bg-sky-500/10 text-sky-100',
      card: 'border-sky-300/15 bg-slate-950/55',
      icon: 'border-sky-300/25 bg-sky-500/10 text-sky-100',
    },
    success: {
      badge: 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100',
      card: 'border-emerald-300/15 bg-slate-950/55',
      icon: 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100',
    },
    warning: {
      badge: 'border-amber-300/25 bg-amber-500/10 text-amber-100',
      card: 'border-amber-300/20 bg-amber-500/10',
      icon: 'border-amber-300/25 bg-amber-500/10 text-amber-100',
    },
  };
  return tones[tone][part];
}

function buildIssues(state: OverviewState): OverviewIssue[] {
  const issues: OverviewIssue[] = [];
  state.reliability?.issues
    .slice(0, 4)
    .forEach((issue) => issues.push({ id: `reliability-${issue.appId}`, actionLabel: issue.suggestedAction || 'Open app', label: issue.appName, message: issue.detail || issue.message, to: '/applications' }));
  if (state.setup && state.setup.status !== 'ready') {
    issues.push({ id: 'host-setup', actionLabel: 'Open network setup', label: state.setup.headline, message: state.setup.summary, to: '/network' });
  }
  state.updates
    .filter((update) => update.updateAvailable)
    .slice(0, 3)
    .forEach((update) => issues.push({ id: `update-${update.appId}`, actionLabel: 'Review update', label: `${update.appName} update available`, message: `Trusted catalog target: ${update.targetVersion}. Backup will run before update.`, to: '/updates' }));
  state.apps
    .filter((app) => app.friendlyStatus === 'Needs attention' || app.friendlyStatus === 'Stopped')
    .slice(0, 3)
    .forEach((app) => issues.push({ id: `app-${app.appId}`, actionLabel: 'Manage app', label: app.appName, message: app.friendlyStatus === 'Stopped' ? 'This app is stopped.' : app.technicalStatus, to: '/applications' }));
  state.diagnostics?.checks
    .filter((check) => check.status === 'warning')
    .slice(0, 3)
    .forEach((check) => issues.push({ id: `network-${check.id}`, actionLabel: check.actionLabel || 'Open network', label: check.label, message: check.message, to: '/network' }));
  state.diagnostics?.appChecks
    .filter((check) => check.status === 'warning')
    .slice(0, 3)
    .forEach((check) => issues.push({ id: `app-link-${check.id}`, actionLabel: check.actionLabel || 'Repair link', label: check.label, message: check.message, to: '/network' }));
  return uniqueById(issues);
}

function installedAppCards(apps: AppRuntimeView[]) {
  return [...apps]
    .sort((left, right) => scoreApp(right) - scoreApp(left) || left.appName.localeCompare(right.appName))
    .slice(0, 6);
}

function marketplaceSuggestions(marketplace: MarketplaceApp[], installed: AppRuntimeView[]) {
  const installedIds = new Set(installed.map((app) => app.appId));
  const preferred = ['vaultwarden', 'jellyfin', 'home-assistant', 'obsidian-livesync', 'adguard-home', 'uptime-kuma'];
  return marketplace
    .filter((app) => !installedIds.has(app.id))
    .sort((left, right) => preferredIndex(left.id, preferred) - preferredIndex(right.id, preferred))
    .slice(0, 3);
}

function recentActivity(state: OverviewState): OverviewActivity[] {
  if (state.reliability?.recentActivity.length) {
    return state.reliability.recentActivity.map((event) => ({
      appId: event.appId,
      appName: event.appName,
      createdAt: event.createdAt,
      id: event.id,
      message: event.message,
    }));
  }
  return state.apps
    .flatMap((app) => (app.recentEvents || []).map((event) => ({ appId: app.appId, appName: app.appName, createdAt: event.createdAt, id: event.id, message: event.message })))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

function scoreApp(app: AppRuntimeView) {
  let score = 0;
  if (app.friendlyStatus === 'Ready') score += 5;
  if (app.settings?.privateAccessUrl) score += 2;
  if (app.usageGuide?.kind !== 'web-app') score += 1;
  return score;
}

function preferredIndex(id: string, preferred: string[]) {
  const index = preferred.indexOf(id);
  return index === -1 ? preferred.length : index;
}

function shortMemory(value?: string | null) {
  if (!value || value === 'Unavailable') return 'Memory n/a';
  return value.split('/')[0]?.trim() || value;
}

function formatRelative(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function uniqueById<T extends { id: string }>(issues: T[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    if (seen.has(issue.id)) return false;
    seen.add(issue.id);
    return true;
  });
}

function valueOr<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback;
}

export default OldOverviewPage;
