import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Archive, CheckCircle2, CircleAlert, ClipboardList, Copy, Download, FileText, HardDrive, LifeBuoy, ListChecks, LockKeyhole, PackageOpen, RefreshCw, Server, ShieldCheck, TerminalSquare } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SystemAPIClient } from '@/api/SystemAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { MetadataBadge } from '@/components/autark-os/MetadataBadge';
import { StatusBadge, type StatusBadgeTone } from '@/components/autark-os/StatusBadge';
import { PageLoadError } from '@/components/autark-os/PageLoadError';
import { PageLoadingState } from '@/components/autark-os/PageLoadingState';
import { PageShell } from '@/components/layout/PageShell';
import { ProjectDarkControlButton, ProjectPrimaryButton } from '@/components/primitives/ProjectButtons';
import { Surface } from '@/components/primitives/Surface';
import { showActionErrorNotification, showActionNotification } from '@/lib/actionNotifications';
import { copyText } from '@/lib/copyText';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { useSettingsDialog } from '@/contexts/SettingsDialogContext';
import { cn } from '@/lib/utils';
import { useApplicationStateRepository } from '@/repositories/applicationStateRepository';
import type { ObservedServiceView } from '@/types/observedService';
import type { AppRuntimeView } from '@/types/app';
import type { SupportBundle, SupportFinding, SupportLogLine, SupportRedactionRule, SupportSummary, SystemDoctorStatus, SystemSetupStatus } from '@/types/system';
import { diagnosticsHeadline, diagnosticsSummaryRows, productionConflictSummary } from './SupportPage.diagnosticsModel';
import { formatDate, humanize, shortSha, summaryFromBundle } from './SupportPage.logic';
import { downloadSupportReport } from './SupportPage.supportReport';
import { FindingCard, InfoLine, LogLine, RedactionRuleCard, RelatedLink, SectionHeader, SupportInset } from './SupportPage.components';

type SupportState = {
  bundle: SupportBundle | null;
  doctor: SystemDoctorStatus | null;
  logs: SupportLogLine[];
  setup: SystemSetupStatus | null;
  summary: SupportSummary | null;
};

type DiagnosticsNotebookSection = 'health' | 'report' | 'logs' | 'redaction' | 'details';

type NotebookHealthCheck = {
  detail: string;
  label: string;
  status: string;
  tone: 'neutral' | 'success' | 'warning';
};

const initialState: SupportState = {
  bundle: null,
  doctor: null,
  logs: [],
  setup: null,
  summary: null,
};

function SupportPage() {
  const { showAdvancedMetrics } = useProjectSettings();
  const { openSettings } = useSettingsDialog();
  const appState = useApplicationStateRepository();
  const [state, setState] = useState<SupportState>(initialState);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bundleBusy, setBundleBusy] = useState(false);
  const [logsBusy, setLogsBusy] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<DiagnosticsNotebookSection>('health');
  const [error, setError] = useState<string | null>(null);
  const logsContentRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const [summary, doctor, setup, logs] = await Promise.all([
        SystemAPIClient.supportSummary(),
        SystemAPIClient.doctor(),
        SystemAPIClient.setupStatus(),
        SystemAPIClient.supportLogs(showAdvancedMetrics ? 160 : 50),
      ]);
      setState((current) => ({ ...current, doctor, logs, setup, summary }));
      if (background) {
        showActionNotification({
          ok: doctor.status !== 'needs_attention',
          severity: doctor.status === 'needs_attention' ? 'warning' : 'success',
          title: doctor.headline,
          message: doctor.summary,
        }, doctor.headline);
      }
    } catch (err) {
      const message = apiErrorMessage(err, 'Diagnostics could not be loaded.');
      setError(message);
      showActionErrorNotification(err, 'Diagnostics failed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showAdvancedMetrics]);

  useEffect(() => {
    void load();
  }, [load]);

  async function generateBundle() {
    setBundleBusy(true);
    try {
      const bundle = await SystemAPIClient.supportBundle();
      setState((current) => ({ ...current, bundle, summary: summaryFromBundle(bundle), setup: bundle.setup || current.setup, logs: bundle.logs || current.logs }));
      showActionNotification({ ok: true, severity: 'success', title: 'Support report ready', message: 'Download or copy the redacted report below.' }, 'Support report ready');
    } catch (err) {
      showActionErrorNotification(err, 'Support report failed');
    } finally {
      setBundleBusy(false);
    }
  }

  async function viewLogs() {
    setLogsOpen(true);
    setLogsBusy(true);
    try {
      const logs = await SystemAPIClient.supportLogs(160);
      setState((current) => ({ ...current, logs }));
      window.setTimeout(() => logsContentRef.current?.focus(), 0);
      showActionNotification({ ok: true, severity: 'info', title: 'Technical logs loaded', message: 'Recent redacted log lines are available below.' }, 'Technical logs loaded');
    } catch (err) {
      showActionErrorNotification(err, 'Logs could not load');
    } finally {
      setLogsBusy(false);
    }
  }

  async function copyBundle() {
    if (!state.bundle) return;
    const result = await copyText(state.bundle.bundleText);
    if (result.ok) {
      showActionNotification({ ok: true, severity: 'success', title: 'Support report copied', message: 'Redacted diagnostics are ready to share.' }, 'Support report copied');
      return;
    }
    showActionNotification({ ok: false, severity: 'warning', title: 'Copy unavailable', message: result.message }, 'Copy unavailable');
  }

  function downloadBundle() {
    if (!state.bundle) return;
    if (downloadSupportReport(state.bundle.bundleText, state.bundle.generatedAt)) {
      showActionNotification({ ok: true, severity: 'success', title: 'Support report downloaded', message: 'The redacted report was saved as a text file.' }, 'Support report downloaded');
      return;
    }
    showActionNotification({ ok: false, severity: 'warning', title: 'Download unavailable', message: 'Your browser could not start a download. Select the report below and copy it manually.' }, 'Download unavailable');
  }

  const summary = state.summary;
  const observedServices = appState.observedServices;
  const findings = summary?.findings || state.bundle?.findings || [];
  const redactionRules = summary?.redactionRules || state.bundle?.redactionRules || [];
  const summaryRows = diagnosticsSummaryRows({ summary, doctor: state.doctor, setup: state.setup, managedApps: appState.apps, observedServices });
  const healthChecks = notebookHealthChecks(state.doctor, state.setup, summaryRows);
  const headline = diagnosticsHeadline(summary, state.doctor);
  const conflict = productionConflictSummary(state.setup);
  const ownershipResources = useMemo(() => observedServices.filter((service) => service.userStatus !== 'installed_managed'), [observedServices]);
  const dockerResources = useMemo(() => observedServices.filter((service) => service.source === 'docker'), [observedServices]);
  const repairResources = useMemo(() => appState.apps.filter((app) => hasRepairDetail(app)), [appState.apps]);
  const tailscaleCheck = state.setup?.checks?.find((check) => check.id === 'tailscale');
  const operatorCheck = state.setup?.checks?.find((check) => check.id === 'tailscale-operator');

  if (loading || appState.isLoading) {
    return <DiagnosticsLoadingState />;
  }

  return (
    <PageShell
      className="xl:h-[calc(100dvh-7.25rem)] xl:min-h-0"
      contained
      contentClassName="gap-3 xl:h-full xl:min-h-0 xl:!overflow-hidden"
    >
      <DiagnosticsNotebook
        activeSection={activeSection}
        bundle={state.bundle}
        bundleBusy={bundleBusy}
        conflict={conflict}
        dockerResources={dockerResources}
        error={error}
        findings={findings}
        healthChecks={healthChecks}
        headline={headline}
        logs={state.logs}
        logsBusy={logsBusy}
        logsContentRef={logsContentRef}
        logsOpen={logsOpen}
        onCopyBundle={() => void copyBundle()}
        onDownloadBundle={downloadBundle}
        onGenerateBundle={() => {
          setActiveSection('report');
          void generateBundle();
        }}
        onOpenSettings={() => openSettings('advanced')}
        onRefresh={() => void load(true)}
        onRetry={() => void load(true)}
        onSectionChange={(section) => {
          setActiveSection(section);
          if (section === 'logs') {
            setLogsOpen(true);
          }
        }}
        onViewLogs={() => {
          setActiveSection('logs');
          void viewLogs();
        }}
        operatorCheck={operatorCheck?.message || 'Waiting for Tailscale status.'}
        ownershipResources={ownershipResources}
        redactionRules={redactionRules}
        refreshing={refreshing}
        repairResources={repairResources}
        setLogsOpen={setLogsOpen}
        setup={state.setup}
        showAdvancedMetrics={showAdvancedMetrics}
        summary={summary}
        summaryRows={summaryRows}
        tailscaleCheck={tailscaleCheck?.message || summary?.tailscaleStatus || 'Unknown'}
      />
    </PageShell>
  );
}

type DiagnosticsNotebookProps = {
  activeSection: DiagnosticsNotebookSection;
  bundle: SupportBundle | null;
  bundleBusy: boolean;
  conflict: ReturnType<typeof productionConflictSummary>;
  dockerResources: ObservedServiceView[];
  error: string | null;
  findings: SupportFinding[];
  healthChecks: NotebookHealthCheck[];
  headline: string;
  logs: SupportLogLine[];
  logsBusy: boolean;
  logsContentRef: { current: HTMLDivElement | null };
  logsOpen: boolean;
  onCopyBundle: () => void;
  onDownloadBundle: () => void;
  onGenerateBundle: () => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
  onRetry: () => void;
  onSectionChange: (section: DiagnosticsNotebookSection) => void;
  onViewLogs: () => void;
  operatorCheck: string;
  ownershipResources: ObservedServiceView[];
  redactionRules: SupportRedactionRule[];
  refreshing: boolean;
  repairResources: AppRuntimeView[];
  setLogsOpen: (open: boolean) => void;
  setup: SystemSetupStatus | null;
  showAdvancedMetrics: boolean;
  summary: SupportSummary | null;
  summaryRows: Array<{ id: string; label: string; tone: string; value: string }>;
  tailscaleCheck: string;
};

function DiagnosticsNotebook({
  activeSection,
  bundle,
  bundleBusy,
  conflict,
  dockerResources,
  error,
  findings,
  healthChecks,
  headline,
  logs,
  logsBusy,
  logsContentRef,
  logsOpen,
  onCopyBundle,
  onDownloadBundle,
  onGenerateBundle,
  onOpenSettings,
  onRefresh,
  onRetry,
  onSectionChange,
  onViewLogs,
  operatorCheck,
  ownershipResources,
  redactionRules,
  refreshing,
  repairResources,
  setLogsOpen,
  setup,
  showAdvancedMetrics,
  summary,
  summaryRows,
  tailscaleCheck,
}: DiagnosticsNotebookProps) {
  const notebookEntries: Array<{ icon: LucideIcon; id: DiagnosticsNotebookSection; label: string; tone: 'good' | 'info' | 'neutral' | 'watch' }> = [
    { icon: ListChecks, id: 'health', label: 'Health checks', tone: headline === 'Ready' ? 'good' : 'watch' },
    { icon: ClipboardList, id: 'report', label: 'Support report', tone: 'info' },
    { icon: TerminalSquare, id: 'logs', label: 'Technical logs', tone: 'info' },
    { icon: ShieldCheck, id: 'redaction', label: 'Redaction rules', tone: 'good' },
    { icon: Server, id: 'details', label: 'System details', tone: 'neutral' },
  ];

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <DiagnosticsNotebookHeader headline={headline} onRefresh={onRefresh} refreshing={refreshing} />
      {error && <DiagnosticsErrorState message={error} onRetry={onRetry} />}
      <DiagnosticsSignalStrip summaryRows={summaryRows} />

      <Tabs
        className="min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-sky-300/20 bg-slate-900 xl:grid xl:grid-cols-[13rem_minmax(0,1fr)_17rem]"
        onValueChange={(value) => onSectionChange(value as DiagnosticsNotebookSection)}
        orientation="vertical"
        value={activeSection}
      >
        <aside className="shrink-0 border-b border-sky-300/15 bg-slate-950/20 p-3 xl:min-h-0 xl:border-r xl:border-b-0">
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-sky-100/55">Notebook</p>
          <TabsList className="mt-2 w-full items-stretch gap-1 rounded-none bg-transparent p-0" variant="line">
            {notebookEntries.map((entry) => <NotebookTabTrigger entry={entry} key={entry.id} />)}
          </TabsList>
        </aside>

        <section className="min-h-0 overflow-hidden bg-slate-900/40">
          <TabsContent className="m-0 h-full min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-4" value="health">
            <HealthChecksWorkspace conflict={conflict} findings={findings} healthChecks={healthChecks} />
          </TabsContent>

          <TabsContent className="m-0 h-full min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-4" value="report">
            <SupportReportWorkspace bundle={bundle} busy={bundleBusy} onCopy={onCopyBundle} onDownload={onDownloadBundle} onGenerate={onGenerateBundle} />
          </TabsContent>

          <TabsContent className="m-0 h-full min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-4" value="logs">
            <TechnicalLogsWorkspace logs={logs} logsBusy={logsBusy} logsContentRef={logsContentRef} logsOpen={logsOpen} onViewLogs={onViewLogs} setLogsOpen={setLogsOpen} />
          </TabsContent>

          <TabsContent className="m-0 h-full min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-4" value="redaction">
            <RedactionRulesWorkspace rules={redactionRules} />
          </TabsContent>

          <TabsContent className="m-0 h-full min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-4" value="details">
            <SystemDetailsWorkspace
              dockerResources={dockerResources}
              onOpenSettings={onOpenSettings}
              operatorCheck={operatorCheck}
              ownershipResources={ownershipResources}
              repairResources={repairResources}
              setup={setup}
              showAdvancedMetrics={showAdvancedMetrics}
              summary={summary}
              tailscaleCheck={tailscaleCheck}
            />
          </TabsContent>
        </section>

        <DiagnosticsToolRail
          bundleBusy={bundleBusy}
          logsBusy={logsBusy}
          onGenerateBundle={onGenerateBundle}
          onRefresh={onRefresh}
          onViewLogs={onViewLogs}
          refreshing={refreshing}
          setup={setup}
          summary={summary}
        />
      </Tabs>
    </section>
  );
}

function DiagnosticsNotebookHeader({ headline, onRefresh, refreshing }: { headline: string; onRefresh: () => void; refreshing: boolean }) {
  return (
    <Surface as="header" className="shrink-0 overflow-hidden border-sky-300/15 bg-app-header-surface/90 shadow-xl shadow-slate-950/20" tone="panel">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="hidden size-10 shrink-0 place-items-center rounded-xl border border-cyan-300/35 bg-cyan-400/10 text-cyan-200 sm:grid">
            <ListChecks aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="m-0 text-3xl font-semibold tracking-tight text-white sm:text-[2.1rem]">Diagnostics</h1>
            <p className="mt-1 text-sm text-sky-100/70">Health checks and support context when you need it.</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge tone={headline === 'Ready' ? 'success' : headline === 'Status unavailable' ? 'neutral' : 'warning'}>{headline}</StatusBadge>
          <DisabledAction disabled={refreshing} reason="Autark-OS is already refreshing the current health checks.">
            <button aria-label="Refresh Diagnostics" className="grid size-10 place-items-center rounded-xl border border-sky-300/15 bg-slate-950/25 text-sky-100/70 transition hover:border-cyan-300/30 hover:text-white" disabled={refreshing} onClick={onRefresh} type="button">
              <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
            </button>
          </DisabledAction>
        </div>
      </div>
    </Surface>
  );
}

function DiagnosticsSignalStrip({ summaryRows }: { summaryRows: Array<{ id: string; label: string; tone: string; value: string }> }) {
  return (
    <section className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-5" aria-label="System summary">
      {summaryRows.map((row) => <DiagnosticsSignalCell key={row.id} row={row} />)}
    </section>
  );
}

function DiagnosticsSignalCell({ row }: { row: { id: string; label: string; tone: string; value: string } }) {
  const Icon = diagnosticsSignalIcon(row.id);
  return (
    <div className={cn('flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2.5', diagnosticsToneClasses(row.tone))}>
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0"><span className="block text-[0.68rem] text-current/65">{row.label}</span><span className="block truncate text-xs font-semibold text-white">{row.value}</span></span>
    </div>
  );
}

function NotebookTabTrigger({ entry }: { entry: { icon: LucideIcon; id: DiagnosticsNotebookSection; label: string; tone: 'good' | 'info' | 'neutral' | 'watch' } }) {
  const Icon = entry.icon;
  return (
    <TabsTrigger className="h-auto min-h-10 rounded-lg border-0 px-2 py-2 text-left data-active:bg-cyan-300/15 data-active:text-cyan-100" value={entry.id}>
      <span className={cn('grid size-6 shrink-0 place-items-center rounded-md border', notebookIconClasses(entry.tone))}><Icon aria-hidden="true" className="size-3.5" /></span>
      <span className="min-w-0 flex-1 truncate">{entry.label}</span>
      {entry.tone === 'watch' && <span aria-hidden="true" className="size-1.5 rounded-full bg-amber-300" />}
    </TabsTrigger>
  );
}

function HealthChecksWorkspace({ conflict, findings, healthChecks }: { conflict: ReturnType<typeof productionConflictSummary>; findings: SupportFinding[]; healthChecks: NotebookHealthCheck[] }) {
  return (
    <div className="grid min-h-full content-start gap-3">
      <WorkspaceHeading description="Current setup, app readiness, access, storage, and backup signals." title="Health checks" />
      {conflict && (
        <div className={cn('rounded-xl border p-3', conflict.tone === 'warning' ? 'border-amber-300/30 bg-amber-400/10' : 'border-cyan-300/25 bg-cyan-400/10')}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-sm font-semibold text-white">{conflict.title}</p><p className="mt-1 text-xs leading-5 text-sky-100/70">{conflict.message}</p></div>
            <ProjectPrimaryButton asChild className="h-8 shrink-0 px-2.5 text-xs"><Link to="/resolve-existing-apps">Recover existing apps</Link></ProjectPrimaryButton>
          </div>
        </div>
      )}
      <div className="grid gap-2">
        {healthChecks.map((check) => <NotebookHealthCheckRow check={check} key={`${check.label}-${check.status}`} />)}
      </div>
      <section className="rounded-xl border border-sky-300/15 bg-slate-950/25 p-3">
        <div className="flex items-center gap-2"><LifeBuoy aria-hidden="true" className="size-4 text-cyan-200" /><div><p className="text-sm font-semibold text-white">Recommended next steps</p><p className="mt-0.5 text-xs text-sky-100/60">Findings lead to the page that owns the fix.</p></div></div>
        <div className="mt-3 grid gap-2">
          {findings.length ? findings.map((finding) => <FindingCard finding={finding} key={finding.id} />) : <SupportInset className="border-emerald-300/20 bg-emerald-500/10 text-sm text-emerald-100">No support findings need attention right now.</SupportInset>}
        </div>
      </section>
    </div>
  );
}

function NotebookHealthCheckRow({ check }: { check: NotebookHealthCheck }) {
  const Icon = check.tone === 'warning' ? CircleAlert : check.tone === 'success' ? CheckCircle2 : ListChecks;
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border px-3 py-2.5', check.tone === 'warning' ? 'border-amber-300/20 bg-amber-400/5' : 'border-sky-300/15 bg-slate-950/25')}>
      <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg border', check.tone === 'warning' ? 'border-amber-300/25 bg-amber-400/10 text-amber-100' : check.tone === 'success' ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100' : 'border-sky-300/20 bg-slate-900 text-sky-100')}><Icon aria-hidden="true" className="size-3.5" /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white">{check.label}</span><span className="mt-0.5 block text-xs leading-5 text-sky-100/60">{check.detail}</span></span>
      <span className={cn('shrink-0 text-xs font-semibold', check.tone === 'warning' ? 'text-amber-100' : check.tone === 'success' ? 'text-emerald-100' : 'text-sky-100/75')}>{check.status}</span>
    </div>
  );
}

function SupportReportWorkspace({ bundle, busy, onCopy, onDownload, onGenerate }: { bundle: SupportBundle | null; busy: boolean; onCopy: () => void; onDownload: () => void; onGenerate: () => void }) {
  return (
    <div className="grid min-h-full content-start gap-3">
      <WorkspaceHeading description="A redacted plain-text report for sharing with support." title="Support report" />
      <section className="rounded-xl border border-sky-300/15 bg-slate-950/25 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-sm font-semibold text-white">Redacted support report</p><p className="mt-1 text-xs leading-5 text-sky-100/60">Version, setup, health, and recent failure context are included. Secrets stay masked.</p></div>
          <DisabledAction disabled={busy} reason="Autark-OS is already preparing the support report."><ProjectPrimaryButton className="h-8 shrink-0 px-2.5 text-xs" disabled={busy} onClick={onGenerate} type="button"><ClipboardList className={cn('size-3.5', busy && 'animate-spin')} />Generate report</ProjectPrimaryButton></DisabledAction>
        </div>
        <pre className="mt-3 max-h-[24rem] select-text overflow-auto whitespace-pre-wrap rounded-lg border border-sky-300/15 bg-slate-950 p-3 text-xs leading-5 text-sky-100/65">{bundle?.bundleText || 'Generate a support report to preview redacted details.'}</pre>
        {bundle && <div className="mt-3 flex flex-wrap gap-2"><ProjectDarkControlButton className="h-8 px-2.5 text-xs" onClick={onCopy} size="sm" type="button"><Copy className="size-3.5" />Copy report</ProjectDarkControlButton><ProjectPrimaryButton className="h-8 px-2.5 text-xs" onClick={onDownload} size="sm" type="button"><Download className="size-3.5" />Download report</ProjectPrimaryButton></div>}
      </section>
    </div>
  );
}

function TechnicalLogsWorkspace({ logs, logsBusy, logsContentRef, logsOpen, onViewLogs, setLogsOpen }: { logs: SupportLogLine[]; logsBusy: boolean; logsContentRef: { current: HTMLDivElement | null }; logsOpen: boolean; onViewLogs: () => void; setLogsOpen: (open: boolean) => void }) {
  return (
    <div className="grid min-h-full content-start gap-3">
      <WorkspaceHeading description="Recent backend events with secrets masked before display." title="Technical logs" />
      <Collapsible className="rounded-xl border border-sky-300/15 bg-slate-950/25" onOpenChange={setLogsOpen} open={logsOpen}>
        <div className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div><p className="text-sm font-semibold text-white">Recent redacted logs</p><p className="mt-1 text-xs text-sky-100/60">Load an expanded recent history when you need more context.</p></div>
          <div className="flex gap-2"><CollapsibleTrigger asChild><ProjectDarkControlButton className="h-8 px-2.5 text-xs" size="sm" type="button">{logsOpen ? 'Hide logs' : 'Show logs'}</ProjectDarkControlButton></CollapsibleTrigger><DisabledAction disabled={logsBusy} reason="Autark-OS is already loading technical logs."><ProjectPrimaryButton className="h-8 px-2.5 text-xs" disabled={logsBusy} onClick={onViewLogs} size="sm" type="button"><TerminalSquare className={cn('size-3.5', logsBusy && 'animate-spin')} />View technical logs</ProjectPrimaryButton></DisabledAction></div>
        </div>
        <CollapsibleContent className="border-t border-sky-300/15 p-3">
          <div className="max-h-[24rem] overflow-y-auto rounded-lg border border-slate-800 bg-black/55 p-3 font-mono text-xs leading-5 text-slate-300" ref={logsContentRef} tabIndex={-1}>
            {logs.length ? logs.map((line, index) => <LogLine key={`${line.line}-${index}`} line={line} />) : <p className="text-slate-500">No logs were available.</p>}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function RedactionRulesWorkspace({ rules }: { rules: SupportRedactionRule[] }) {
  return (
    <div className="grid min-h-full content-start gap-3">
      <WorkspaceHeading description="Autark-OS removes sensitive context before showing logs or preparing a support report." title="Redaction rules" />
      <div className="grid gap-2 sm:grid-cols-2">{rules.length ? rules.map((rule) => <RedactionRuleCard rule={rule} key={rule.id} />) : <p className="text-sm text-slate-400">Redaction rules are unavailable.</p>}</div>
    </div>
  );
}

function SystemDetailsWorkspace({ dockerResources, onOpenSettings, operatorCheck, ownershipResources, repairResources, setup, showAdvancedMetrics, summary, tailscaleCheck }: { dockerResources: ObservedServiceView[]; onOpenSettings: () => void; operatorCheck: string; ownershipResources: ObservedServiceView[]; repairResources: AppRuntimeView[]; setup: SystemSetupStatus | null; showAdvancedMetrics: boolean; summary: SupportSummary | null; tailscaleCheck: string }) {
  return (
    <div className="grid min-h-full content-start gap-3">
      <WorkspaceHeading description="Technical context stays available without competing with everyday health checks." title="System details" />
      <section className="grid gap-3 rounded-xl border border-sky-300/15 bg-slate-950/25 p-3 md:grid-cols-2">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-sky-100/55">Instance</p><div className="mt-2 grid gap-2 text-sm"><InfoLine label="Name" value={setup?.instanceSlug || 'Unknown'} /><InfoLine label="ID" value={setup?.instanceId || 'Unknown'} /><InfoLine label="Mode" value={setup?.devMode ? 'Development' : 'Production'} /><InfoLine label="Profiles" value={setup?.activeProfiles || 'default'} /></div></div>
        <div><p className="text-xs font-semibold uppercase tracking-wide text-sky-100/55">Version</p><div className="mt-2 grid gap-2 text-sm"><InfoLine label="Version" value={summary?.version?.version || 'Unknown'} /><InfoLine label="Build" value={summary?.version?.buildSha ? shortSha(summary.version.buildSha) : 'Unknown'} /><InfoLine label="Updates" value={summary?.version?.updateMessage || 'Update status unavailable.'} /><InfoLine label="Generated" value={formatDate(summary?.checkedAt)} /></div></div>
      </section>
      <AdvancedSection defaultOpen={false} icon={Server} title="App ownership details">{ownershipResources.length ? ownershipResources.map((resource) => <ResourceLine key={resource.id} resource={resource} />) : <p className="text-sm text-slate-400">No found apps or ignored resources are currently visible.</p>}</AdvancedSection>
      <AdvancedSection defaultOpen={repairResources.length > 0} icon={ShieldCheck} title="App repair details">{repairResources.length ? repairResources.map((app) => <RepairLine app={app} key={app.appId} />) : <p className="text-sm text-slate-400">No app repair attempts or remediation states are currently visible.</p>}</AdvancedSection>
      <AdvancedSection defaultOpen={false} icon={FileText} title="Docker resources">{dockerResources.length ? dockerResources.map((resource) => <ResourceLine key={resource.id} resource={resource} technical />) : <p className="text-sm text-slate-400">No Docker resources were returned by the host inventory scan.</p>}</AdvancedSection>
      <AdvancedSection defaultOpen={false} icon={LockKeyhole} title="Tailscale details"><div className="grid gap-3 md:grid-cols-2"><InfoLine label="Tailscale" value={tailscaleCheck} /><InfoLine label="Private access permission" value={operatorCheck} /><InfoLine label="Version" value={setup?.tailscaleVersion || 'Unknown'} /><InfoLine label="Instance" value={setup?.instanceSlug || 'Unknown'} /></div></AdvancedSection>
      <section className="rounded-xl border border-sky-300/15 bg-slate-950/25 p-3"><SectionHeader compact icon={LifeBuoy} title="Related pages" description="Focused views for common support tasks." /><div className="mt-3 grid gap-2 sm:grid-cols-2"><RelatedLink onClick={onOpenSettings} title="Settings" detail="Host setup checks and service-user guidance." /><RelatedLink to="/resolve-existing-apps" title="Resolve Existing Apps" detail="Review apps found on this server." /><RelatedLink to="/access" title="Access" detail="Tailscale, private links, and home network issues." />{showAdvancedMetrics && <RelatedLink to="/activity" title="Activity Log" detail="Detailed system events for advanced troubleshooting." />}</div></section>
    </div>
  );
}

function DiagnosticsToolRail({ bundleBusy, logsBusy, onGenerateBundle, onRefresh, onViewLogs, refreshing, setup, summary }: { bundleBusy: boolean; logsBusy: boolean; onGenerateBundle: () => void; onRefresh: () => void; onViewLogs: () => void; refreshing: boolean; setup: SystemSetupStatus | null; summary: SupportSummary | null }) {
  return (
    <aside className="shrink-0 border-t border-sky-300/15 bg-slate-950/20 p-3 xl:min-h-0 xl:border-t-0 xl:border-l">
      <p className="text-sm font-semibold text-white">Diagnostics tools</p><p className="mt-1 text-xs leading-5 text-sky-100/60">Run a fresh check or collect safe support context.</p>
      <div className="mt-3 grid gap-2">
        <NotebookTool busy={refreshing} detail="Refresh every current health signal." icon={RefreshCw} label="Run health checks" onClick={onRefresh} reason="Autark-OS is already refreshing the current health checks." />
        <NotebookTool busy={bundleBusy} detail="Prepare redacted support context." icon={ClipboardList} label="Support report" onClick={onGenerateBundle} reason="Autark-OS is already preparing the support report." />
        <NotebookTool busy={logsBusy} detail="Read recent redacted backend events." icon={TerminalSquare} label="Technical logs" onClick={onViewLogs} reason="Autark-OS is already loading technical logs." />
      </div>
      <div className="mt-3 border-t border-sky-300/15 pt-3"><p className="text-xs font-semibold uppercase tracking-wide text-sky-100/55">Evidence</p><div className="mt-2 grid gap-1.5"><NotebookEvidence label="Instance" value={setup?.instanceSlug || 'Unknown'} /><NotebookEvidence label="Version" value={summary?.version?.version || 'Unknown'} /><NotebookEvidence label="Last check" value={formatDate(summary?.checkedAt || setup?.checkedAt)} /></div></div>
    </aside>
  );
}

function NotebookTool({ busy, detail, icon: Icon, label, onClick, reason }: { busy: boolean; detail: string; icon: LucideIcon; label: string; onClick: () => void; reason: string }) {
  return <DisabledAction className="w-full" disabled={busy} reason={reason}><button className="w-full rounded-lg border border-sky-300/15 bg-slate-900 p-2.5 text-left transition hover:border-cyan-300/30 hover:bg-slate-800" disabled={busy} onClick={onClick} type="button"><span className="flex items-center gap-2 text-xs font-semibold text-white"><Icon aria-hidden="true" className={cn('size-3.5 text-cyan-200', busy && 'animate-spin')} />{label}</span><span className="mt-1 block text-[0.68rem] leading-4 text-sky-100/60">{detail}</span></button></DisabledAction>;
}

function WorkspaceHeading({ description, title }: { description: string; title: string }) {
  return <div><p className="text-xs text-cyan-100/65">Diagnostics / {title}</p><h2 className="mt-1 text-lg font-semibold text-white">{title}</h2><p className="mt-1 text-xs leading-5 text-sky-100/60">{description}</p></div>;
}

function NotebookEvidence({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-2 text-xs text-sky-100/60"><span>{label}</span><span className="text-right font-semibold text-white">{value}</span></div>;
}

function notebookHealthChecks(doctor: SystemDoctorStatus | null, setup: SystemSetupStatus | null, summaryRows: Array<{ label: string; tone: string; value: string }>): NotebookHealthCheck[] {
  const checks = doctor?.checks?.length ? doctor.checks : setup?.checks || [];
  if (checks.length) {
    return checks.map((check) => ({
      detail: check.detail || check.message || 'No additional detail is available.',
      label: check.label,
      status: notebookCheckStatus(check.status),
      tone: notebookStatusTone(check.status),
    }));
  }

  return summaryRows.map((row) => ({
    detail: `Current ${row.label.toLowerCase()} status from Autark-OS.`,
    label: row.label,
    status: row.value,
    tone: row.tone === 'success' ? 'success' : row.tone === 'warning' ? 'warning' : 'neutral',
  }));
}

function notebookCheckStatus(status: string) {
  if (status === 'ok') return 'Ready';
  if (status === 'warning') return 'Needs review';
  if (status === 'neutral') return 'Unknown';
  return humanize(status || 'unknown');
}

function notebookStatusTone(status: string): NotebookHealthCheck['tone'] {
  if (status === 'ok' || status === 'ready') return 'success';
  if (status === 'warning' || status === 'needs_attention') return 'warning';
  return 'neutral';
}

function diagnosticsSignalIcon(id: string): LucideIcon {
  if (id === 'apps') return PackageOpen;
  if (id === 'tailscale') return LockKeyhole;
  if (id === 'backups') return Archive;
  if (id === 'storage') return HardDrive;
  return Server;
}

function diagnosticsToneClasses(tone: string) {
  if (tone === 'success') return 'border-emerald-300/20 bg-emerald-400/5 text-emerald-100';
  if (tone === 'warning') return 'border-amber-300/20 bg-amber-400/5 text-amber-100';
  return 'border-sky-300/15 bg-slate-900 text-cyan-100';
}

function notebookIconClasses(tone: 'good' | 'info' | 'neutral' | 'watch') {
  if (tone === 'good') return 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100';
  if (tone === 'watch') return 'border-amber-300/25 bg-amber-400/10 text-amber-100';
  if (tone === 'neutral') return 'border-sky-300/15 bg-slate-900 text-sky-100/70';
  return 'border-cyan-300/25 bg-cyan-400/10 text-cyan-100';
}

function AdvancedSection({ children, defaultOpen, icon: Icon, onOpenChange, open, title }: { children: ReactNode; defaultOpen?: boolean; icon: LucideIcon; onOpenChange?: (open: boolean) => void; open?: boolean; title: string }) {
  return (
    <Collapsible className="rounded-2xl border border-sky-400/30 bg-slate-900 p-5 text-slate-50 shadow-xl shadow-slate-950/30" defaultOpen={defaultOpen} onOpenChange={onOpenChange} open={open}>
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-3 text-left font-black text-white">
        <span className="grid size-9 place-items-center rounded-lg border border-sky-400/25 bg-slate-800 text-cyan-200"><Icon className="size-4" /></span>
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-4 grid gap-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function ResourceLine({ resource, technical = false }: { resource: ObservedServiceView; technical?: boolean }) {
  return (
    <SupportInset>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-bold text-white">{resource.displayName}</p>
          <p className="mt-1 text-sm text-slate-400">{resource.userStatusDescription}</p>
        </div>
        <MetadataBadge>{resource.userStatusLabel || labelForOwnership(resource.ownershipState)}</MetadataBadge>
      </div>
      {technical && (
        <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
          <span>State: {resource.runtimeState || 'unknown'}</span>
          <span>Catalog: {resource.catalogAppId || 'Unknown'}</span>
          <span>Source: {resource.source}</span>
          <span>Actions: {resource.availableActions.map((action) => action.label || humanize(action.id)).join(', ') || 'None'}</span>
        </div>
      )}
    </SupportInset>
  );
}

function RepairLine({ app }: { app: AppRuntimeView }) {
  const repairEvents = (app.recentEvents || []).filter((event) => event.type.includes('repair') || event.type.includes('health') || event.type.includes('private_access')).slice(0, 3);
  return (
    <SupportInset>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-bold text-white">{app.appName}</p>
          <p className="mt-1 text-sm text-slate-400">{app.remediation?.summary || app.healthSnapshot?.detail || 'Autark-OS has not recorded repair detail for this app.'}</p>
        </div>
        <StatusBadge tone={repairTone(app.remediation?.tone)}>
          {app.remediation?.label || app.friendlyStatus}
        </StatusBadge>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
        <span>Health: {app.healthSnapshot?.status || app.friendlyStatus}</span>
        <span>Last repair: {app.settings?.lastRepairStatus ? humanize(app.settings.lastRepairStatus) : 'No repair recorded'}</span>
        <span>Attempted: {formatDate(app.settings?.lastRepairAttemptAt || undefined)}</span>
        <span>Next action: {app.remediation?.nextActionLabel || 'No action needed'}</span>
      </div>
      {repairEvents.length > 0 && (
        <div className="mt-3 grid gap-2 border-t border-slate-700/45 pt-3 text-xs text-slate-400">
          {repairEvents.map((event) => <span key={event.id}>{formatDate(event.createdAt)} - {humanize(event.type)}: {event.message}</span>)}
        </div>
      )}
    </SupportInset>
  );
}

function DiagnosticsLoadingState() {
  return (
    <PageShell>
      <PageLoadingState className="min-h-[520px]" model={{ description: 'Checking health, setup state, found apps, and recent logs.', title: 'Loading diagnostics' }} />
    </PageShell>
  );
}

function DiagnosticsErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <PageLoadError className="rounded-none border-x-0 border-t-0 px-6 py-4" model={{ message, title: 'Diagnostics could not refresh' }} onRetry={onRetry} />;
}

function hasRepairDetail(app: AppRuntimeView) {
  const state = app.remediation?.state;
  return Boolean(state && !['healthy', 'watching'].includes(state))
    || Boolean(app.settings?.lastRepairStatus)
    || (app.recentEvents || []).some((event) => event.type.includes('repair') || event.type.includes('health') || event.type.includes('private_access'));
}

function labelForOwnership(value: string) {
  if (value === 'owned_managed') return 'Installed';
  if (value === 'foreign_autark_os') return 'Found on this server';
  if (value === 'legacy_autark_os') return 'Recoverable Autark-OS app';
  if (value === 'external_docker') return 'Existing Docker app';
  return humanize(value || 'unknown');
}

function repairTone(tone?: string): StatusBadgeTone {
  if (tone === 'critical') return 'danger';
  if (tone === 'warning') return 'warning';
  if (tone === 'success') return 'success';
  return 'neutral';
}

export default SupportPage;
