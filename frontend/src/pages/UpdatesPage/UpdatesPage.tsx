import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Archive, CheckCircle2, ExternalLink, GitBranch, History, Loader2, RefreshCw, RotateCcw, ShieldCheck, UploadCloud } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { InstalledAppsAPIClient } from '@/api/InstalledAppsAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { RefreshStatus } from '@/components/RefreshStatus';
import { PageErrorState, PageLoadingState } from '@/components/project-os/PageState';
import { PageShell, SurfaceInset } from '@/components/project-os/ProjectOSComponents';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AppEvent, AppRuntimeView, AppUpdatePlan, AppUpdateResult, AppUpdateStatus } from '@/types/app';

function UpdatesPage() {
  const [apps, setApps] = useState<AppRuntimeView[]>([]);
  const [updates, setUpdates] = useState<AppUpdateStatus[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [plan, setPlan] = useState<AppUpdatePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AppUpdateResult | null>(null);

  const updatesById = useMemo(() => new Map(updates.map((update) => [update.appId, update])), [updates]);
  const selectedUpdate = selectedAppId ? updatesById.get(selectedAppId) || null : null;
  const selectedApp = selectedAppId ? apps.find((app) => app.appId === selectedAppId) || null : null;
  const updateHistory = useMemo(() => apps.flatMap((app) => app.recentEvents
    .filter((event) => event.type.includes('update') || event.type.includes('rollback'))
    .map((event) => ({ ...event, appName: app.appName })))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 10), [apps]);
  const availableUpdates = updates.filter((update) => update.updateAvailable);
  const rollbackReady = updates.filter((update) => update.rollbackAvailable);

  const load = useCallback(async ({ background = false } = {}) => {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const [appsData, updateData] = await Promise.all([
        InstalledAppsAPIClient.listApps(),
        InstalledAppsAPIClient.updates(),
      ]);
      setApps(appsData);
      setUpdates(updateData);
      setSelectedAppId((current) => {
        if (current && updateData.some((update) => update.appId === current)) return current;
        return updateData.find((update) => update.updateAvailable)?.appId || updateData[0]?.appId || null;
      });
      setUpdatedAt(new Date());
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to load update status.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedAppId) {
      setPlan(null);
      return;
    }
    let cancelled = false;
    InstalledAppsAPIClient.updatePlan(selectedAppId)
      .then((data) => {
        if (!cancelled) setPlan(data);
      })
      .catch((err) => {
        if (!cancelled) setError(apiErrorMessage(err, 'Unable to prepare update plan.'));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAppId]);

  async function runUpdate(appId: string) {
    setActionLoading(`update-${appId}`);
    setResult(null);
    setError(null);
    try {
      const data = await InstalledAppsAPIClient.updateApp(appId);
      setResult(data);
      await load({ background: true });
    } catch (err) {
      setError(apiErrorMessage(err, 'Update could not be completed.'));
    } finally {
      setActionLoading(null);
    }
  }

  async function rollback(appId: string) {
    setActionLoading(`rollback-${appId}`);
    setResult(null);
    setError(null);
    try {
      const data = await InstalledAppsAPIClient.rollbackApp(appId);
      setResult(data);
      await load({ background: true });
    } catch (err) {
      setError(apiErrorMessage(err, 'Rollback could not be completed.'));
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <PageLoadingState label="Loading update manager" sublabel="Checking installed apps, trusted catalog targets, and rollback readiness." />
    );
  }

  return (
    <PageShell>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-normal text-violet-300">Updates</p>
          <h2 className="mt-2 text-2xl font-bold leading-none text-white md:text-3xl">Update Manager</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">Review trusted catalog updates, backup checkpoints, rollback readiness, and recent update activity.</p>
        </div>
        <RefreshStatus intervalLabel="Manual refresh" onRefresh={() => void load({ background: true })} refreshing={refreshing} updatedAt={updatedAt} />
      </header>

      {error && <PageErrorState message={error} onRetry={() => void load({ background: true })} title="Update status could not refresh" />}
      {result && <Alert tone={result.status === 'completed' ? 'success' : result.status === 'failed' ? 'danger' : 'warning'} icon={result.status === 'completed' ? CheckCircle2 : AlertTriangle} message={result.message} />}

      <div className="grid gap-4 md:grid-cols-4">
        <SignalCard icon={UploadCloud} label="Available updates" value={`${availableUpdates.length}`} detail={availableUpdates.length ? 'Ready to review' : 'Trusted catalog current'} tone={availableUpdates.length ? 'amber' : 'emerald'} />
        <SignalCard icon={Archive} label="Backup policy" value="Required" detail="Every update starts with a checkpoint" tone="sky" />
        <SignalCard icon={RotateCcw} label="Rollback ready" value={`${rollbackReady.length}`} detail="Apps with saved previous Compose files" tone="violet" />
        <SignalCard icon={ShieldCheck} label="Registry strategy" value="Advisory" detail="Only trusted catalog targets execute" tone="emerald" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(320px,0.75fr)_minmax(0,1.25fr)]">
        <Card className="border-white/10 bg-slate-950/60 py-0 text-slate-100">
          <CardHeader className="border-b border-white/10 p-5">
            <CardTitle className="text-lg text-white">Installed Apps</CardTitle>
            <p className="mt-1 text-sm text-slate-400">Choose an app to review update policy and rollback options.</p>
          </CardHeader>
          <CardContent className="grid max-h-[680px] gap-3 overflow-y-auto p-5">
            {updates.length === 0 ? <EmptyState title="No installed apps" message="Install apps from the Marketplace before update checks appear here." /> : updates.map((update) => (
              <button className={cn('rounded-lg border p-4 text-left transition hover:-translate-y-0.5 hover:border-violet-300/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/70', selectedAppId === update.appId ? 'border-violet-300/45 bg-violet-500/10' : 'border-slate-800 bg-slate-900/45')} key={update.appId} onClick={() => setSelectedAppId(update.appId)} type="button">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-white">{update.appName}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{update.currentVersion} → {update.targetVersion}</p>
                  </div>
                  <Badge className={cn('border', update.updateAvailable ? 'border-amber-300/20 bg-amber-500/10 text-amber-100' : 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100')}>{update.updateAvailable ? 'Update' : 'Current'}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge className={cn('border', riskTone(update.risk))}>{update.risk} risk</Badge>
                  {update.rollbackAvailable && <Badge className="border-violet-300/20 bg-violet-500/10 text-violet-100">Rollback</Badge>}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-5">
          <UpdateDetail
            actionLoading={actionLoading}
            app={selectedApp}
            onRollback={rollback}
            onUpdate={runUpdate}
            plan={plan}
            update={selectedUpdate}
          />
          <UpdateHistory events={updateHistory} />
        </div>
      </div>
    </PageShell>
  );
}

function UpdateDetail({ actionLoading, app, onRollback, onUpdate, plan, update }: { actionLoading: string | null; app: AppRuntimeView | null; onRollback: (appId: string) => void; onUpdate: (appId: string) => void; plan: AppUpdatePlan | null; update: AppUpdateStatus | null }) {
  if (!update) {
    return <EmptyState title="No app selected" message="Choose an installed app to review update policy." />;
  }
  const updateBusy = actionLoading === `update-${update.appId}`;
  const rollbackBusy = actionLoading === `rollback-${update.appId}`;
  return (
    <Card className="border-white/10 bg-slate-950/60 py-0 text-slate-100">
      <CardHeader className="border-b border-white/10 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="text-xl text-white">{update.appName}</CardTitle>
            <p className="mt-1 text-sm text-slate-400">Trusted catalog target: {update.targetImage}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="bg-sky-500 text-slate-950 hover:bg-sky-400" disabled={!update.updateAvailable || updateBusy || rollbackBusy} onClick={() => onUpdate(update.appId)} type="button">
              {updateBusy ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
              Update
            </Button>
            <Button className="border-slate-700 bg-slate-950/50 text-slate-200 hover:bg-slate-800" disabled={!update.rollbackAvailable || updateBusy || rollbackBusy} onClick={() => onRollback(update.appId)} type="button" variant="outline">
              {rollbackBusy ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              Roll back
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 p-5">
        <div className="grid gap-3 md:grid-cols-3">
          <Fact label="Current" value={update.currentImage} />
          <Fact label="Target" value={update.targetImage} />
          <Fact label="Channel" value={update.updateChannel} />
          <Fact label="Backup checkpoint" value={friendlyPolicy(update.backupCheckpointStatus)} />
          <Fact label="Rollback" value={update.rollbackSupport} />
          <Fact label="Checked" value={formatDate(update.checkedAt)} />
        </div>

        <SurfaceInset className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-bold text-white">Catalog Policy</p>
              <p className="mt-1 text-sm text-slate-400">{update.registryAdvisory}</p>
            </div>
            <Badge className="border-emerald-300/20 bg-emerald-500/10 text-emerald-100">{friendlyPolicy(update.registryStrategy)}</Badge>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {update.releaseNotesUrl && <ExternalButton href={update.releaseNotesUrl} label="Release notes" />}
            {update.sourceUrl && <ExternalButton href={update.sourceUrl} label="Source" />}
          </div>
        </SurfaceInset>

        <div className="grid gap-4 lg:grid-cols-2">
          <InfoList icon={GitBranch} title="Update Steps" values={plan?.steps || ['Loading update plan...']} />
          <InfoList icon={AlertTriangle} tone="warning" title="Review Notes" values={plan?.warnings.length ? plan.warnings : ['No extra review notes for this update.']} />
        </div>

        {app && app.recentEvents.length > 0 && (
          <SurfaceInset className="p-4">
            <p className="font-bold text-white">Recent App Events</p>
            <div className="mt-3 grid gap-2">
              {app.recentEvents.filter((event) => event.type.includes('update') || event.type.includes('rollback')).slice(0, 5).map((event) => <HistoryRow event={event} key={event.id} />)}
              {app.recentEvents.filter((event) => event.type.includes('update') || event.type.includes('rollback')).length === 0 && <p className="text-sm text-slate-500">No update history recorded for this app yet.</p>}
            </div>
          </SurfaceInset>
        )}
      </CardContent>
    </Card>
  );
}

function UpdateHistory({ events }: { events: Array<AppEvent & { appName: string }> }) {
  return (
    <Card className="border-white/10 bg-slate-950/60 py-0 text-slate-100">
      <CardHeader className="border-b border-white/10 p-5">
        <CardTitle className="text-lg text-white">Update History</CardTitle>
        <p className="mt-1 text-sm text-slate-400">Planned updates, checkpoints, health checks, and rollback activity.</p>
      </CardHeader>
      <CardContent className="grid gap-3 p-5">
        {events.length === 0 ? <EmptyState title="No update activity yet" message="Update events will appear here after the first planned update or rollback." compact /> : events.map((event) => <HistoryRow event={event} key={`${event.appId}-${event.id}`} />)}
      </CardContent>
    </Card>
  );
}

function HistoryRow({ event }: { event: AppEvent & { appName?: string } }) {
  return (
    <SurfaceInset>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-white">{event.appName ? `${event.appName}: ` : ''}{friendlyPolicy(event.type)}</p>
        <span className="text-xs text-slate-500">{formatDate(event.createdAt)}</span>
      </div>
      <p className="mt-1 text-sm text-slate-400">{event.message}</p>
    </SurfaceInset>
  );
}

function SignalCard({ detail, icon: Icon, label, tone, value }: { detail: string; icon: LucideIcon; label: string; tone: 'amber' | 'emerald' | 'sky' | 'violet'; value: string }) {
  const tones = {
    amber: 'border-amber-300/20 bg-amber-500/10 text-amber-100',
    emerald: 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100',
    sky: 'border-sky-300/20 bg-sky-500/10 text-sky-100',
    violet: 'border-violet-300/20 bg-violet-500/10 text-violet-100',
  };
  return (
    <div className={cn('rounded-lg border p-4', tones[tone])}>
      <Icon className="size-5" />
      <p className="mt-4 text-xs font-bold uppercase text-current/70">{label}</p>
      <p className="mt-1 text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-sm text-current/75">{detail}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <SurfaceInset>
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-200">{value}</p>
    </SurfaceInset>
  );
}

function InfoList({ icon: Icon, title, tone = 'default', values }: { icon: LucideIcon; title: string; tone?: 'default' | 'warning'; values: string[] }) {
  return (
    <section className={cn('rounded-lg border p-4', tone === 'warning' ? 'border-amber-300/20 bg-amber-500/10 text-amber-100' : 'border-slate-800 bg-slate-900/40 text-slate-300')}>
      <div className="flex items-center gap-2">
        <Icon className="size-4" />
        <p className="font-bold text-white">{title}</p>
      </div>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
        {values.map((value) => <li key={value}>{value}</li>)}
      </ul>
    </section>
  );
}

function ExternalButton({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild className="border-slate-700 bg-slate-950/50 text-slate-200 hover:bg-slate-800" size="sm" variant="outline">
      <a href={href} rel="noreferrer" target="_blank">
        <ExternalLink className="size-3.5" />
        {label}
      </a>
    </Button>
  );
}

function Alert({ icon: Icon, message, tone }: { icon: LucideIcon; message: string; tone: 'danger' | 'success' | 'warning' }) {
  const tones = {
    danger: 'border-red-400/25 bg-red-500/10 text-red-100',
    success: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100',
    warning: 'border-amber-300/25 bg-amber-500/10 text-amber-100',
  };
  return (
    <div className={cn('flex items-center gap-3 rounded-lg border p-4 text-sm', tones[tone])}>
      <Icon className="size-4" />
      {message}
    </div>
  );
}

function EmptyState({ compact = false, message, title }: { compact?: boolean; message: string; title: string }) {
  return (
    <div className={cn('rounded-lg border border-slate-800 bg-slate-900/40 text-center', compact ? 'p-4' : 'p-8')}>
      <p className="font-bold text-white">{title}</p>
      <p className="mt-1 text-sm text-slate-400">{message}</p>
    </div>
  );
}

function riskTone(risk: string) {
  if (risk === 'low') return 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100';
  if (risk === 'high') return 'border-red-300/20 bg-red-500/10 text-red-100';
  return 'border-amber-300/20 bg-amber-500/10 text-amber-100';
}

function friendlyPolicy(value: string) {
  return value.replaceAll('_', ' ').replaceAll('-', ' ');
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export default UpdatesPage;
