import { lazy, Suspense, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, HeartPulse, Loader2, ShieldCheck, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { apiErrorMessage } from '@/api/httpClient';
import { RefreshStatus } from '@/components/RefreshStatus';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { PageShell } from '@/components/layout/PageShell';
import { ProjectInlineEmptyState as EmptyState } from '@/components/primitives/EmptyState';
import { ProjectDarkControlButton } from '@/components/primitives/ProjectButtons';
import { ProjectPanel, Surface } from '@/components/primitives/Surface';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { cn } from '@/lib/utils';
import { useApplicationStateRepository } from '@/repositories/applicationStateRepository';
import { useMonitoringDiagnosticsMutation, useMonitoringRepository } from '@/repositories/monitoringRepository';
import {
  buildAppTrendData,
  buildCategoryData,
  buildHostTrendData,
  buildLevelData,
  buildResourceData,
} from './extensions/MonitoringPage.viewModels';
import { MonitoringActivityFeed, SystemActivitySummary } from './MonitoringActivitySections';

const levelFilters = ['all', 'error', 'warning', 'success', 'info'];
const categoryFilters = ['all', 'install', 'health', 'repair', 'access', 'backup', 'system', 'api'];
const MonitoringChartsSection = lazy(() => import('./MonitoringChartsSection'));

const MonitoringPanel = ProjectPanel;

function MonitoringPage() {
  const { settings, showAdvancedMetrics } = useProjectSettings();
  const timeZone = settings?.timeZone || 'UTC';
  const appState = useApplicationStateRepository();
  const [level, setLevel] = useState('all');
  const [category, setCategory] = useState('all');
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

      <SystemActivitySummary highlightedIssue={highlightedIssue} recentFixes={recentFixes} recentEvents={monitoring.activity.slice(0, 5)} reliability={reliability} timeZone={timeZone} />

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

      <MonitoringActivityFeed
        activity={monitoring.activity}
        category={category}
        categoryFilters={categoryFilters}
        isLoading={monitoring.isLoading}
        level={level}
        levelFilters={levelFilters}
        onCategoryChange={setCategory}
        onLevelChange={setLevel}
        reliability={reliability}
        showAdvancedMetrics={showAdvancedMetrics}
        timeZone={timeZone}
      />
    </PageShell>
  );
}

function MonitoringChartsFallback() {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
      <MonitoringPanel className="min-h-[420px]">
        <EmptyState title="Loading metrics" description="Autark-OS is preparing advanced charts." />
      </MonitoringPanel>
      <MonitoringPanel className="min-h-[420px]">
        <EmptyState title="Loading instrumentation" description="Autark-OS is preparing device readings." />
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

export default MonitoringPage;
