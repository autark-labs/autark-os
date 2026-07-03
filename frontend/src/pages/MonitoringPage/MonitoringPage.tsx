import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, BarChart3, CheckCircle2, ChevronDown, ChevronRight, Clock3, Cpu, Database, Download, Filter, HardDrive, HeartPulse, Loader2, MemoryStick, Server, ShieldCheck, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { apiErrorMessage } from '@/api/httpClient';
import { RefreshStatus } from '@/components/RefreshStatus';
import { DisabledAction } from '@/components/project-os/DisabledAction';
import { PageShell } from '@/components/layout/PageShell';
import { ProjectInlineEmptyState } from '@/components/primitives/EmptyState';
import { ProjectDarkControlButton, ProjectPrimaryButton } from '@/components/primitives/ProjectButtons';
import { ProjectInset, ProjectPanel, Surface } from '@/components/primitives/Surface';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { Badge } from '@/components/ui/badge';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { buildAppRemediationFromIssue } from '@/lib/appRemediation';
import { cn } from '@/lib/utils';
import { useApplicationStateRepository } from '@/repositories/applicationStateRepository';
import { useMonitoringDiagnosticsMutation, useMonitoringRepository } from '@/repositories/monitoringRepository';
import {
  buildAppTrendData,
  buildCategoryData,
  buildHostTrendData,
  buildLevelData,
  buildResourceData,
  humanize,
} from './extensions/MonitoringPage.viewModels';
import type { ActivityLog } from '@/types/activity';
import type { AppReliabilityIssue, AppReliabilitySummary } from '@/types/app';
import type { MonitoringHistory } from '@/types/monitoring';
import type { SystemMetrics } from '@/types/system';

const levelFilters = ['all', 'error', 'warning', 'success', 'info'];
const categoryFilters = ['all', 'install', 'health', 'repair', 'access', 'backup', 'system', 'api'];

type ChartPoint = {
  label: string;
  count: number;
};

type ResourcePoint = {
  label: string;
  cpu: number;
  memory: number;
};

type HostTrendPoint = {
  label: string;
  cpu: number;
  memory: number;
  disk: number;
};

type AppTrendPoint = {
  label: string;
  cpu: number;
  memory: number;
};

const MonitoringPanel = ProjectPanel;
const MonitoringInset = ProjectInset;

function MonitoringPage() {
  const { showAdvancedMetrics } = useProjectSettings();
  const appState = useApplicationStateRepository();
  const [level, setLevel] = useState('all');
  const [category, setCategory] = useState('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filters = useMemo(() => ({
    level: level === 'all' ? undefined : level,
    category: category === 'all' ? undefined : category,
    limit: 120,
  }), [category, level]);
  const monitoring = useMonitoringRepository(filters);
  const diagnosticsMutation = useMonitoringDiagnosticsMutation();
  const error = actionError ?? (monitoring.error ? apiErrorMessage(monitoring.error, 'Monitoring data could not be loaded.') : null);

  async function exportDiagnostics() {
    setActionError(null);
    try {
      const diagnostics = await diagnosticsMutation.mutateAsync(60);
      const blob = new Blob([JSON.stringify(diagnostics, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `project-os-monitoring-${new Date().toISOString().replaceAll(':', '-')}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setActionError(apiErrorMessage(exportError, 'Monitoring diagnostics could not be exported.'));
    }
  }

  const recentFailures = monitoring.activity.filter((event) => event.level === 'error' || event.outcome === 'failed');
  const recentFixes = monitoring.activity.filter((event) => event.category === 'repair' && event.level === 'success');
  const reliability = monitoring.reliability;
  const categoryData = useMemo(() => buildCategoryData(monitoring.activity), [monitoring.activity]);
  const levelData = useMemo(() => buildLevelData(monitoring.activity), [monitoring.activity]);
  const resourceData = useMemo(() => buildResourceData(appState.telemetryByAppId), [appState.telemetryByAppId]);
  const hostTrendData = useMemo(() => buildHostTrendData(monitoring.history?.hostSamples ?? []), [monitoring.history]);
  const appTrendData = useMemo(() => buildAppTrendData(monitoring.history?.appSamples ?? []), [monitoring.history]);
  const highlightedIssue = reliability?.issues[0] ?? null;

  return (
    <PageShell>
      <Surface className="overflow-hidden" tone="panel">
        <div className="border-b border-sky-400/20 bg-slate-900 p-6 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-normal text-cyan-200">Monitoring</p>
              <h1 className="mt-2 text-3xl font-black leading-none text-white md:text-5xl">System Activity</h1>
              <p className="mt-3 max-w-3xl text-sm text-slate-300 md:text-base">
                See what Autark-OS is checking, fixing, and waiting on in the background.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {showAdvancedMetrics && (
                <DisabledAction disabled={diagnosticsMutation.isPending} reason="Diagnostics export is already being prepared.">
                  <ProjectDarkControlButton disabled={diagnosticsMutation.isPending} onClick={() => void exportDiagnostics()} type="button">
                    {diagnosticsMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                    Export diagnostics
                  </ProjectDarkControlButton>
                </DisabledAction>
              )}
              <RefreshStatus intervalLabel="Auto-updates every 10s" onRefresh={() => void Promise.all([monitoring.refresh(), appState.refresh()])} refreshing={monitoring.isFetching || appState.isFetching} tone="cyan" updatedAt={appState.updatedAt ?? monitoring.updatedAt} />
            </div>
          </div>
        </div>

        {error && <MonitoringErrorState message={error} onRetry={() => void monitoring.refresh()} />}

        <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
          <SignalCard
            icon={postureIcon(reliability?.posture)}
            label="System posture"
            value={reliability?.headline || (monitoring.isLoading ? 'Checking' : 'No apps yet')}
            detail={reliability?.summary || 'Autark-OS will summarize app stability here.'}
            tone={postureTone(reliability?.posture)}
          />
          <SignalCard
            icon={HeartPulse}
            label="Healthy apps"
            value={reliability ? `${reliability.readyApps}/${reliability.totalApps}` : '0/0'}
            detail={reliability ? `${reliability.needsAttentionApps + reliability.unavailableApps} need attention.` : 'Install apps to begin health tracking.'}
            tone="green"
          />
          <SignalCard
            icon={Wrench}
            label="Automatic fixes"
            value={`${reliability?.recentSuccessfulRepairs ?? recentFixes.length}`}
            detail={`${reliability?.recentFailedRepairs ?? recentFailures.length} items still need review.`}
            tone={(reliability?.recentFailedRepairs ?? recentFailures.length) > 0 ? 'orange' : 'cyan'}
          />
          <SignalCard
            icon={AlertTriangle}
            label="Needs attention"
            value={`${recentFailures.length}`}
            detail={recentFailures[0]?.title || 'No recent activity needs attention.'}
            tone={recentFailures.length > 0 ? 'red' : 'slate'}
          />
        </div>
      </Surface>

      <SystemActivitySummary highlightedIssue={highlightedIssue} recentFixes={recentFixes} recentEvents={monitoring.activity.slice(0, 5)} reliability={reliability} />

      {showAdvancedMetrics && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
          <ProjectOsMetricsPanel
            categoryData={categoryData}
            levelData={levelData}
            reliability={reliability}
            resourceData={resourceData}
            appTrendData={appTrendData}
            history={monitoring.history}
          />
          <DeviceInstrumentationPanel hostTrendData={hostTrendData} history={monitoring.history} metrics={monitoring.metrics} />
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <MonitoringPanel>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="size-5 text-cyan-200" />
                <h2 className="text-xl font-black text-white">Recent activity</h2>
              </div>
              <p className="mt-1 text-sm text-slate-400">{showAdvancedMetrics ? 'Install progress, health checks, repairs, private access changes, and backend warnings.' : 'The latest visible work Autark-OS has done for apps, backups, access, and repairs.'}</p>
            </div>
            <Badge className="border-slate-700 bg-slate-900 text-slate-300">{monitoring.activity.length} events</Badge>
          </div>

          {showAdvancedMetrics && <MonitoringInset className="mt-5 grid gap-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500">
              <Filter className="size-3.5" />
              Filters
            </div>
            <FilterBar label="Level" options={levelFilters} value={level} onChange={setLevel} />
            <FilterBar label="Category" options={categoryFilters} value={category} onChange={setCategory} />
          </MonitoringInset>}

          <div className="mt-5 flex max-h-[680px] flex-col gap-3 overflow-y-auto pr-2 [scrollbar-color:rgba(103,232,249,0.55)_rgba(15,23,42,0.8)] [scrollbar-width:thin]">
            {monitoring.isLoading ? (
              <EmptyState title="Loading activity" message="Autark-OS is checking recent events." />
            ) : monitoring.activity.length ? (
              monitoring.activity.map((event) => (
                <ActivityRow
                  event={event}
                  expanded={expandedId === event.id}
                  key={event.id}
                  onToggle={() => setExpandedId((current) => current === event.id ? null : event.id)}
                  showAdvancedMetrics={showAdvancedMetrics}
                />
              ))
            ) : (
              <EmptyState title="No activity found" message="Try another filter, or install an app to start recording activity." />
            )}
          </div>
        </MonitoringPanel>

        <aside className="flex flex-col gap-5">
          <MonitoringPanel>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-white">Needs attention</h2>
                <p className="mt-1 text-sm text-slate-400">Apps Autark-OS cannot fully fix on its own.</p>
              </div>
              <Badge className={cn('border', (reliability?.issues.length ?? 0) > 0 ? 'border-orange-400/45 bg-orange-500/10 text-orange-200' : 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100')}>
                {reliability?.issues.length ?? 0}
              </Badge>
            </div>
            <div className="mt-4 grid gap-3">
              {reliability?.issues.length ? reliability.issues.map((issue) => <IssueCard issue={issue} key={`${issue.appId}-${issue.status}`} />) : (
                <EmptyState title="No active issues" message="Autark-OS has not found any app stability issues." compact />
              )}
            </div>
          </MonitoringPanel>

          <MonitoringPanel>
            <h2 className="text-lg font-black text-white">What gets logged</h2>
            <div className="mt-4 grid gap-3 text-sm text-slate-300">
              <GuideRow icon={CheckCircle2} title="Successful work" text="Installs, repairs, access updates, and app checks that completed." />
              <GuideRow icon={AlertTriangle} title="Needs attention" text="Problems Autark-OS detected or could not safely repair." />
              <GuideRow icon={ShieldCheck} title="Background repair" text="Safe restart and private-link repair attempts performed by the guardian." />
              <GuideRow icon={Clock3} title="Timing" text="This page refreshes automatically every few seconds while it is open." />
            </div>
          </MonitoringPanel>
        </aside>
      </div>
    </PageShell>
  );
}

function SystemActivitySummary({ highlightedIssue, recentEvents, recentFixes, reliability }: { highlightedIssue: AppReliabilityIssue | null; recentEvents: ActivityLog[]; recentFixes: ActivityLog[]; reliability: AppReliabilitySummary | null }) {
  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <MonitoringPanel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="size-5 text-cyan-200" />
              <h2 className="text-xl font-black text-white">What Autark-OS is doing</h2>
            </div>
            <p className="mt-1 text-sm text-slate-400">Recent checks, background repairs, and app activity in plain language.</p>
          </div>
          <Badge className="border-cyan-300/35 bg-cyan-400/10 text-cyan-100">{recentEvents.length} recent</Badge>
        </div>
        <div className="mt-5 grid gap-3">
          {recentEvents.length ? recentEvents.map((event) => <CompactActivityItem event={event} key={event.id} />) : (
            <EmptyState compact title="No recent activity" message="Autark-OS has not logged visible work for the current filters yet." />
          )}
        </div>
      </MonitoringPanel>

      <div className="grid gap-5">
        <MonitoringPanel>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg border border-emerald-300/20 bg-emerald-500/10 text-emerald-200">
              <HeartPulse className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-black text-white">App health summary</h2>
              <p className="mt-1 text-sm text-slate-400">{reliability?.summary || 'Health checks appear here after apps are installed.'}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <MiniCount label="Ready" tone="green" value={`${reliability?.readyApps ?? 0}`} />
            <MiniCount label="Starting" tone="orange" value={`${reliability?.startingApps ?? 0}`} />
            <MiniCount label="Review" tone="red" value={`${(reliability?.needsAttentionApps ?? 0) + (reliability?.unavailableApps ?? 0)}`} />
          </div>
        </MonitoringPanel>

        <MonitoringPanel>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg border border-cyan-300/35 bg-cyan-400/10 text-cyan-100">
              <Wrench className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-black text-white">Automatic fixes</h2>
              <p className="mt-1 text-sm text-slate-400">{recentFixes.length ? 'Recent safe repairs Autark-OS completed.' : 'No automatic repairs were needed recently.'}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-2">
            {recentFixes.slice(0, 3).map((event) => <CompactActivityItem event={event} key={event.id} />)}
            {!recentFixes.length && <EmptyState compact title="Quiet is good" message="Autark-OS will list safe repair work here when it happens." />}
          </div>
        </MonitoringPanel>

        <HighlightedIssueCard issue={highlightedIssue} />
      </div>
    </section>
  );
}

function CompactActivityItem({ event }: { event: ActivityLog }) {
  const Icon = eventIcon(event);
  return (
    <div className={cn('flex gap-3 rounded-lg border bg-slate-900/45 p-3 text-sm', eventTone(event))}>
      <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-slate-950/70">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate font-semibold text-white">{event.title}</p>
        <p className="mt-1 line-clamp-2 text-slate-300">{event.message}</p>
        <p className="mt-1 text-xs text-slate-500">{formatDate(event.createdAt)}</p>
      </div>
    </div>
  );
}

function HighlightedIssueCard({ issue }: { issue: AppReliabilityIssue | null }) {
  if (!issue) {
    return (
      <section className="rounded-xl border border-emerald-300/20 bg-emerald-500/10 p-5 text-emerald-100 shadow-xl shadow-slate-950/30">
        <div className="flex gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
          <div>
            <h2 className="font-black text-white">No highlighted issue</h2>
            <p className="mt-1 text-sm text-emerald-100/80">Autark-OS has not found an app issue that needs action right now.</p>
          </div>
        </div>
      </section>
    );
  }
  const remediation = buildAppRemediationFromIssue(issue);
  const destination = remediation?.safeAction.kind === 'link' ? remediation.safeAction.to : '/apps';
  return (
    <section className="rounded-xl border border-orange-400/45 bg-orange-500/10 p-5 text-orange-200 shadow-xl shadow-slate-950/30">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" />
        <div>
          <h2 className="font-black text-white">{remediation?.title || `Review ${issue.appName}`}</h2>
          <p className="mt-1 text-sm text-orange-100/80">{remediation?.summary || issue.message}</p>
          <p className="mt-2 text-xs text-orange-100/70">{remediation?.nextStep || issue.suggestedAction}</p>
          <ProjectDarkControlButton asChild className="mt-4 border-orange-300/30 text-orange-100" size="sm">
            <Link to={destination}>{remediation?.safeAction.label || 'Open Applications'} <ChevronRight className="size-4" /></Link>
          </ProjectDarkControlButton>
        </div>
      </div>
    </section>
  );
}

function MiniCount({ label, tone, value }: { label: string; tone: 'green' | 'orange' | 'red'; value: string }) {
  const tones = {
    orange: 'border-orange-400/45 bg-orange-500/10 text-orange-200',
    green: 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100',
    red: 'border-red-400/40 bg-red-500/10 text-red-200',
  };
  return (
    <div className={cn('rounded-lg border p-3', tones[tone])}>
      <p className="text-xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase text-current/70">{label}</p>
    </div>
  );
}

function ProjectOsMetricsPanel({ appTrendData, categoryData, history, levelData, reliability, resourceData }: { appTrendData: AppTrendPoint[]; categoryData: ChartPoint[]; history: MonitoringHistory | null; levelData: ChartPoint[]; reliability: AppReliabilitySummary | null; resourceData: ResourcePoint[] }) {
  const healthTotal = Math.max(1, reliability?.totalApps ?? 0);
  const healthyPercent = ((reliability?.readyApps ?? 0) / healthTotal) * 100;
  const startingPercent = ((reliability?.startingApps ?? 0) / healthTotal) * 100;
  const attentionPercent = (((reliability?.needsAttentionApps ?? 0) + (reliability?.unavailableApps ?? 0)) / healthTotal) * 100;

  return (
    <MonitoringPanel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="size-5 text-cyan-200" />
            <h2 className="text-xl font-black text-white">Autark-OS metrics</h2>
          </div>
          <p className="mt-1 text-sm text-slate-400">A quick read on system activity, app health, and managed app resource usage.</p>
        </div>
        <Badge className="border-cyan-300/35 bg-cyan-400/10 text-cyan-100">{history?.windowLabel || 'Last 60 minutes'}</Badge>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="grid gap-4">
          <MonitoringInset className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-slate-500">App health mix</p>
                <p className="mt-1 text-sm text-slate-300">{reliability?.headline || 'Waiting for app health data'}</p>
              </div>
              <span className="text-2xl font-black text-white">{reliability?.totalApps ?? 0}</span>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-950">
              <div className="flex h-full">
                <span className="bg-emerald-400" style={{ width: `${healthyPercent}%` }} />
                <span className="bg-orange-400" style={{ width: `${startingPercent}%` }} />
                <span className="bg-red-400" style={{ width: `${attentionPercent}%` }} />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-400">
              <LegendDot color="bg-emerald-400" label={`${reliability?.readyApps ?? 0} ready`} />
              <LegendDot color="bg-orange-400" label={`${reliability?.startingApps ?? 0} starting`} />
              <LegendDot color="bg-red-400" label={`${(reliability?.needsAttentionApps ?? 0) + (reliability?.unavailableApps ?? 0)} issues`} />
            </div>
          </MonitoringInset>

          <MonitoringInset className="p-4">
            <p className="text-xs font-bold uppercase text-slate-500">Event tone</p>
            <ChartContainer
              className="mt-3 h-[190px] w-full aspect-auto"
              config={{
                count: { label: 'Events', color: '#8b5cf6' },
              }}
            >
              <AreaChart data={levelData} margin={{ left: 0, right: 8, top: 12, bottom: 0 }}>
                <defs>
                  <linearGradient id="eventToneFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.75} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={24} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area dataKey="count" type="monotone" stroke="#a78bfa" fill="url(#eventToneFill)" strokeWidth={2} />
              </AreaChart>
            </ChartContainer>
          </MonitoringInset>
        </div>

        <div className="grid gap-4">
          <MonitoringInset className="p-4">
            <p className="text-xs font-bold uppercase text-slate-500">Activity by area</p>
            <ChartContainer
              className="mt-3 h-[220px] w-full aspect-auto"
              config={{
                count: { label: 'Events', color: '#22d3ee' },
              }}
            >
              <BarChart data={categoryData} margin={{ left: 0, right: 8, top: 12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={24} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="#22d3ee" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </MonitoringInset>

          <MonitoringInset className="p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase text-slate-500">Managed app resources</p>
              <span className="text-xs text-slate-500">{resourceData.length ? 'Current top apps' : 'No current sample'}</span>
            </div>
            {resourceData.length ? (
              <ChartContainer
                className="mt-3 h-[220px] w-full aspect-auto"
                config={{
                  cpu: { label: 'CPU %', color: '#34d399' },
                  memory: { label: 'Memory %', color: '#fbbf24' },
                }}
              >
                <BarChart data={resourceData} margin={{ left: 0, right: 8, top: 12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={28} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="cpu" fill="#34d399" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="memory" fill="#fbbf24" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <EmptyState title="No app resource samples" message="App CPU and memory charts appear after telemetry is collected." compact />
            )}
          </MonitoringInset>

          <MonitoringInset className="p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase text-slate-500">App resource trend</p>
              <span className="text-xs text-slate-500">{history?.windowLabel || 'Last 60 minutes'}</span>
            </div>
            {appTrendData.length > 1 ? (
              <ChartContainer
                className="mt-3 h-[220px] w-full aspect-auto"
                config={{
                  cpu: { label: 'Avg CPU %', color: '#34d399' },
                  memory: { label: 'Avg Memory %', color: '#fbbf24' },
                }}
              >
                <AreaChart data={appTrendData} margin={{ left: 0, right: 8, top: 12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="appCpuTrendFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.55} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id="appMemoryTrendFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#fbbf24" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={18} />
                  <YAxis tickLine={false} axisLine={false} width={28} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area dataKey="cpu" type="monotone" stroke="#34d399" fill="url(#appCpuTrendFill)" strokeWidth={2} />
                  <Area dataKey="memory" type="monotone" stroke="#fbbf24" fill="url(#appMemoryTrendFill)" strokeWidth={2} />
                </AreaChart>
              </ChartContainer>
            ) : (
              <EmptyState title="Trend is still warming up" message="Keep Monitoring open briefly to collect enough app samples for a trend." compact />
            )}
          </MonitoringInset>
        </div>
      </div>
    </MonitoringPanel>
  );
}

function DeviceInstrumentationPanel({ history, hostTrendData, metrics }: { history: MonitoringHistory | null; hostTrendData: HostTrendPoint[]; metrics: SystemMetrics | null }) {
  const memoryUsedBytes = metrics ? metrics.totalMemoryBytes - metrics.freeMemoryBytes : 0;
  const runtimeUsedBytes = metrics ? metrics.runtimeTotalBytes - metrics.runtimeUsableBytes : 0;
  return (
    <MonitoringPanel>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Server className="size-5 text-cyan-300" />
            <h2 className="text-xl font-black text-white">Device instrumentation</h2>
          </div>
          <p className="mt-1 text-sm text-slate-400">Current host readings for the device running Autark-OS. Memory uses Linux available memory so cache does not look like active app usage.</p>
        </div>
        <Badge className="border-cyan-300/20 bg-cyan-500/10 text-cyan-100">{metrics ? formatDate(metrics.checkedAt) : 'Waiting'}</Badge>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <MetricRing icon={Cpu} label="Device CPU" value={metrics?.systemCpuPercent ?? -1} detail={metrics ? `${metrics.availableProcessors} cores available` : 'No sample yet'} tone="cyan" />
        <MetricRing icon={MemoryStick} label="Memory" value={metrics?.usedMemoryPercent ?? -1} detail={metrics ? `${formatBytes(memoryUsedBytes)} used of ${formatBytes(metrics.totalMemoryBytes)}` : 'No sample yet'} tone="cyan" />
        <MetricRing icon={HardDrive} label="Autark-OS disk" value={metrics?.runtimeUsedPercent ?? -1} detail={metrics ? `${formatBytes(runtimeUsedBytes)} used of ${formatBytes(metrics.runtimeTotalBytes)}` : 'No sample yet'} tone="orange" />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <MetricDetail icon={Server} label="Device" value={metrics?.deviceName || 'Autark-OS device'} />
        <MetricDetail icon={Cpu} label="OS" value={metrics ? `${metrics.osName} ${metrics.osVersion}` : 'Not reported'} />
        <MetricDetail icon={MemoryStick} label="Available memory" value={metrics ? `${formatBytes(metrics.freeMemoryBytes)} available` : 'Not reported'} />
        <MetricDetail icon={Activity} label="System load" value={metrics ? loadLabel(metrics.systemLoadAverage, metrics.availableProcessors) : 'Not reported'} />
        <MetricDetail icon={Database} label="Runtime" value={metrics?.runtimeRoot || 'Not reported'} />
        <MetricDetail icon={Activity} label="Backend CPU" value={percentLabel(metrics?.processCpuPercent)} />
      </div>

      <MonitoringInset className="mt-5 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase text-slate-500">Device trends</p>
          <span className="text-xs text-slate-500">{history?.windowLabel || 'Last 60 minutes'}</span>
        </div>
        {hostTrendData.length > 1 ? (
          <ChartContainer
            className="mt-3 h-[240px] w-full aspect-auto"
            config={{
              cpu: { label: 'CPU %', color: '#22d3ee' },
              memory: { label: 'Memory %', color: '#a78bfa' },
              disk: { label: 'Disk %', color: '#fbbf24' },
            }}
          >
            <AreaChart data={hostTrendData} margin={{ left: 0, right: 8, top: 12, bottom: 0 }}>
              <defs>
                <linearGradient id="hostCpuTrendFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.55} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.04} />
                </linearGradient>
                <linearGradient id="hostMemoryTrendFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#a78bfa" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={18} />
              <YAxis tickLine={false} axisLine={false} width={28} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area dataKey="cpu" type="monotone" stroke="#22d3ee" fill="url(#hostCpuTrendFill)" strokeWidth={2} />
              <Area dataKey="memory" type="monotone" stroke="#a78bfa" fill="url(#hostMemoryTrendFill)" strokeWidth={2} />
              <Area dataKey="disk" type="monotone" stroke="#fbbf24" fill="transparent" strokeWidth={2} />
            </AreaChart>
          </ChartContainer>
        ) : (
          <EmptyState title="Trend is still warming up" message="Autark-OS needs at least two retained host samples before drawing this trend." compact />
        )}
      </MonitoringInset>
    </MonitoringPanel>
  );
}

function MetricRing({ detail, icon: Icon, label, tone, value }: { detail: string; icon: LucideIcon; label: string; tone: 'cyan' | 'orange'; value: number }) {
  const colors = {
    cyan: '#22d3ee',
    orange: '#fb923c',
  };
  const safeValue = value < 0 ? 0 : clamp(value);
  return (
    <MonitoringInset className="p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
        <Icon className="size-4 text-slate-400" />
      </div>
      <div className="mt-4 flex items-center gap-4">
        <div
          className="grid size-20 shrink-0 place-items-center rounded-full"
          style={{ background: `conic-gradient(${colors[tone]} ${safeValue * 3.6}deg, rgb(30 41 59) 0deg)` }}
        >
          <div className="grid size-14 place-items-center rounded-full bg-slate-950 text-sm font-black text-white">
            {value < 0 ? 'N/A' : `${Math.round(value)}%`}
          </div>
        </div>
        <p className="text-sm text-slate-400">{detail}</p>
      </div>
    </MonitoringInset>
  );
}

function MetricDetail({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <MonitoringInset className="flex min-w-0 gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-slate-500" />
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
        <p className="mt-1 truncate text-sm text-slate-200" title={value}>{value}</p>
      </div>
    </MonitoringInset>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('size-2 rounded-full', color)} />
      {label}
    </span>
  );
}

function SignalCard({ detail, icon: Icon, label, tone, value }: { detail: string; icon: LucideIcon; label: string; tone: 'green' | 'orange' | 'red' | 'slate' | 'cyan'; value: string; }) {
  const tones = {
    green: 'border-emerald-300/20 bg-emerald-500/10 text-emerald-200',
    orange: 'border-orange-400/45 bg-orange-500/10 text-orange-200',
    red: 'border-red-400/40 bg-red-500/10 text-red-200',
    slate: 'border-slate-700/60 bg-slate-900/55 text-slate-300',
    cyan: 'border-cyan-300/35 bg-cyan-400/10 text-cyan-100',
  };
  return (
    <div className={cn('rounded-lg border p-4', tones[tone])}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase text-current/70">{label}</p>
        <Icon className="size-4" />
      </div>
      <p className="mt-3 line-clamp-2 text-xl font-black text-white">{value}</p>
      <p className="mt-1 line-clamp-2 text-xs text-current/75">{detail}</p>
    </div>
  );
}

function FilterBar({ label, onChange, options, value }: { label: string; options: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 text-xs font-semibold text-slate-500">{label}</span>
      {options.map((option) => (
        <button
          className={cn(
            'rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70',
            value === option
              ? 'border-cyan-300/35 bg-cyan-400/10 text-cyan-100'
              : 'border-sky-400/25 bg-slate-800 text-slate-400 hover:border-cyan-300/45 hover:text-slate-200',
          )}
          key={option}
          onClick={() => onChange(option)}
          type="button"
        >
          {option.replace('_', ' ')}
        </button>
      ))}
    </div>
  );
}

function ActivityRow({ event, expanded, onToggle, showAdvancedMetrics }: { event: ActivityLog; expanded: boolean; onToggle: () => void; showAdvancedMetrics: boolean }) {
  const Icon = eventIcon(event);
  return (
    <article className={cn('rounded-lg border bg-slate-900/45 transition', eventTone(event))}>
      <button className="grid w-full gap-3 rounded-lg p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 sm:grid-cols-[auto_minmax(0,1fr)_130px_auto] sm:items-start" onClick={onToggle} type="button">
        <span className="grid size-10 place-items-center rounded-lg border border-sky-400/25 bg-slate-950/70">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-white">{event.title}</span>
            <Badge className={cn('border text-[11px] capitalize', badgeTone(event.level))}>{event.category}</Badge>
            {event.appId && <Badge className="border-slate-700 bg-slate-950 text-slate-300">{event.appId}</Badge>}
          </span>
          <span className="mt-1 block text-sm text-slate-300">{event.message}</span>
        </span>
        <span className="text-xs text-slate-500 sm:text-right">{formatDate(event.createdAt)}</span>
        <span className="text-slate-400">{expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</span>
      </button>
      {expanded && showAdvancedMetrics && (
        <div className="border-t border-white/10 px-4 py-3 text-sm">
          <div className="grid gap-3 md:grid-cols-3">
            <Detail label="Action" value={event.action} />
            <Detail label="Outcome" value={humanize(event.outcome)} />
            <Detail label="Level" value={humanize(event.level)} />
          </div>
          {event.details && (
            <pre className="mt-3 max-h-48 overflow-auto rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-xs text-slate-300">{event.details}</pre>
          )}
        </div>
      )}
    </article>
  );
}

function IssueCard({ issue }: { issue: AppReliabilityIssue }) {
  const remediation = buildAppRemediationFromIssue(issue);
  return (
    <div className="rounded-lg border border-orange-400/45 bg-orange-500/10 p-4 text-sm text-orange-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-white">{issue.appName}</p>
          <p className="mt-1">{remediation?.summary || issue.message}</p>
        </div>
        <Badge className="border-orange-400/45 bg-orange-500/10 text-orange-200">{issue.status}</Badge>
      </div>
      <p className="mt-3 text-xs text-orange-100/75">{remediation?.nextStep || issue.suggestedAction}</p>
      {issue.detail && remediation?.summary !== issue.detail && <p className="mt-2 text-xs text-orange-100/60">{issue.detail}</p>}
    </div>
  );
}

function GuideRow({ icon: Icon, text, title }: { icon: typeof Activity; text: string; title: string }) {
  return (
    <MonitoringInset className="flex gap-3">
      <Icon className="mt-0.5 size-4 text-cyan-200" />
      <div>
        <p className="font-bold text-white">{title}</p>
        <p className="mt-1 text-xs text-slate-400">{text}</p>
      </div>
    </MonitoringInset>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <MonitoringInset>
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 break-words text-slate-200">{value || 'None'}</p>
    </MonitoringInset>
  );
}

function EmptyState({ compact = false, message, title }: { compact?: boolean; message: string; title: string }) {
  return <ProjectInlineEmptyState compact={compact} description={message} title={title} />;
}

function MonitoringErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="border-b border-red-400/40 bg-red-500/10 px-6 py-4 text-red-100">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-current">Monitoring data could not refresh</p>
          <p className="mt-1 text-sm leading-6 text-current/80">{message}</p>
          <ProjectDarkControlButton className="mt-3 border-red-300/30 text-red-100 hover:bg-red-500/20" onClick={onRetry} size="sm" type="button">
            Try again
          </ProjectDarkControlButton>
        </div>
      </div>
    </div>
  );
}

function postureIcon(posture?: string) {
  if (posture === 'healthy') {
    return CheckCircle2;
  }
  if (posture === 'critical') {
    return AlertTriangle;
  }
  return ShieldCheck;
}

function postureTone(posture?: string): 'green' | 'orange' | 'red' | 'slate' | 'cyan' {
  if (posture === 'healthy') {
    return 'green';
  }
  if (posture === 'critical') {
    return 'red';
  }
  if (posture === 'warning') {
    return 'orange';
  }
  return 'cyan';
}

function eventIcon(event: ActivityLog) {
  if (event.level === 'error') {
    return AlertTriangle;
  }
  if (event.category === 'repair') {
    return Wrench;
  }
  if (event.category === 'health') {
    return HeartPulse;
  }
  if (event.level === 'success') {
    return CheckCircle2;
  }
  return Activity;
}

function eventTone(event: ActivityLog) {
  if (event.level === 'error' || event.outcome === 'failed') {
    return 'border-red-400/40 text-red-200';
  }
  if (event.level === 'warning' || event.outcome === 'needs_attention') {
    return 'border-orange-400/45 text-orange-200';
  }
  if (event.level === 'success') {
    return 'border-emerald-300/20 text-emerald-100';
  }
  return 'border-slate-800 text-slate-300';
}

function badgeTone(level: string) {
  if (level === 'error') {
    return 'border-red-400/40 bg-red-500/10 text-red-200';
  }
  if (level === 'warning') {
    return 'border-orange-400/45 bg-orange-500/10 text-orange-200';
  }
  if (level === 'success') {
    return 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100';
  }
  return 'border-slate-700 bg-slate-950 text-slate-300';
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'Not recorded';
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function percentLabel(value?: number | null) {
  if (value == null || value < 0) {
    return 'Not reported';
  }
  return `${Math.round(value)}%`;
}

function loadLabel(value: number, cores: number) {
  if (!Number.isFinite(value) || value < 0) {
    return 'Not reported';
  }
  const normalized = cores > 0 ? `, ${(value / cores).toFixed(2)} per core` : '';
  return `${value.toFixed(2)} load average${normalized}`;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}

export default MonitoringPage;
