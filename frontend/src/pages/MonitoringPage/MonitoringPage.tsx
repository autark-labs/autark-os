import { lazy, Suspense, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Clock3, Download, Filter, HeartPulse, Loader2, ShieldCheck, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiErrorMessage } from '@/api/httpClient';
import { RefreshStatus } from '@/components/RefreshStatus';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { PageShell } from '@/components/layout/PageShell';
import { ProjectInlineEmptyState } from '@/components/primitives/EmptyState';
import { ProjectDarkControlButton, ProjectPrimaryButton } from '@/components/primitives/ProjectButtons';
import { ProjectInset, ProjectPanel, Surface } from '@/components/primitives/Surface';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { Badge } from '@/components/ui/badge';
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

const levelFilters = ['all', 'error', 'warning', 'success', 'info'];
const categoryFilters = ['all', 'install', 'health', 'repair', 'access', 'backup', 'system', 'api'];
const MonitoringChartsSection = lazy(() => import('./MonitoringChartsSection'));

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
      link.download = `autark-os-monitoring-${new Date().toISOString().replaceAll(':', '-')}.json`;
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
        <Suspense fallback={<MonitoringChartsFallback />}>
          <MonitoringChartsSection
            appTrendData={appTrendData}
            categoryData={categoryData}
            history={monitoring.history}
            hostTrendData={hostTrendData}
            levelData={levelData}
            metrics={monitoring.metrics}
            reliability={reliability}
            resourceData={resourceData}
          />
        </Suspense>
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

function MonitoringChartsFallback() {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
      <MonitoringPanel className="min-h-[420px]">
        <EmptyState title="Loading metrics" message="Autark-OS is preparing advanced charts." />
      </MonitoringPanel>
      <MonitoringPanel className="min-h-[420px]">
        <EmptyState title="Loading instrumentation" message="Autark-OS is preparing device readings." />
      </MonitoringPanel>
    </div>
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

export default MonitoringPage;
