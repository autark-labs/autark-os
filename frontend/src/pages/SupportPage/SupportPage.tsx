import { PageHeader } from '@/components/layout/PageHeader';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, ChevronDown, CircleAlert, ClipboardList, Copy, Download, FileText, LifeBuoy, ListChecks, LockKeyhole, RefreshCw, Server, ShieldCheck, TerminalSquare } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SystemAPIClient } from '@/api/SystemAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { MetadataBadge } from '@/components/autark-os/MetadataBadge';
import { StatusBadge, type StatusBadgeTone } from '@/components/autark-os/StatusBadge';
import { ContextChip } from '@/components/autark-os/ContextChip';
import { ApplicationStateContent } from '@/components/autark-os/ApplicationStateNotice';
import { Button } from '@/components/ui/button';
import { PageLoadError } from '@/components/autark-os/PageLoadError';
import { PageLoadingState } from '@/components/autark-os/PageLoadingState';
import { PageShell } from '@/components/layout/PageShell';
import { ExtensionActionTarget } from '@/extensions/ExtensionActionTarget';
import { ProjectPrimaryButton } from '@/components/primitives/ProjectButtons';
import { showActionErrorNotification, showActionNotification } from '@/lib/actionNotifications';
import { copyText } from '@/lib/copyText';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSettingsDialog } from '@/contexts/SettingsDialogContext';
import { cn } from '@/lib/utils';
import { useApplicationStateRepository } from '@/repositories/applicationStateRepository';
import type { ApplicationView } from '@/types/applicationState';
import type { AppRuntimeView } from '@/types/app';
import type { SupportBundle, SupportFinding, SupportLogLine, SupportSummary, SystemDoctorStatus, SystemSetupStatus } from '@/types/system';
import { formatDate, humanize, productionConflictSummary, shortSha } from './SupportPage.logic';
import { downloadSupportReport } from './SupportPage.supportReport';
import { FindingCard, InfoLine, LogLine, RedactionRuleCard, RelatedLink, SectionHeader, SupportInset } from './SupportPage.components';

type SupportState = {
  bundle: SupportBundle | null;
  doctor: SystemDoctorStatus | null;
  logs: SupportLogLine[];
  setup: SystemSetupStatus | null;
  summary: SupportSummary | null;
};

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
  const { openSettings } = useSettingsDialog();
  const appState = useApplicationStateRepository();
  const [state, setState] = useState<SupportState>(initialState);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bundleBusy, setBundleBusy] = useState(false);
  const [logsBusy, setLogsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        SystemAPIClient.supportLogs(160),
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
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function generateBundle() {
    setBundleBusy(true);
    try {
      const bundle = await SystemAPIClient.supportBundle();
      setState((current) => ({ ...current, bundle }));
      showActionNotification({ ok: true, severity: 'success', title: 'Support report ready', message: 'Download or copy the redacted report below.' }, 'Support report ready');
    } catch (err) {
      showActionErrorNotification(err, 'Support report failed');
    } finally {
      setBundleBusy(false);
    }
  }

  async function refreshLogs() {
    setLogsBusy(true);
    try {
      const logs = await SystemAPIClient.supportLogs(160);
      setState((current) => ({ ...current, logs }));
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
      showActionNotification({ ok: true, severity: 'success', title: 'Download started', message: 'Your browser is downloading the redacted report.' }, 'Download started');
      return;
    }
    showActionNotification({ ok: false, severity: 'warning', title: 'Download unavailable', message: 'Your browser could not start a download. Select the report below and copy it manually.' }, 'Download unavailable');
  }

  const summary = state.summary;
  const evidencedApplications = useMemo(() => appState.applications.filter((application) => Boolean(application.evidence)), [appState.applications]);
  const managedApps = useMemo(() => appState.applications.flatMap((application) => (
    application.relationship === 'managed' && application.runtime ? [application.runtime] : []
  )), [appState.applications]);
  const findings = summary?.findings || [];
  const redactionRules = state.bundle?.redactionRules || summary?.redactionRules || [];
  const healthChecks = notebookHealthChecks(state.doctor, state.setup);
  const conflict = productionConflictSummary(state.setup);
  const ownershipResources = useMemo(() => evidencedApplications
    .filter((application) => application.relationship !== 'managed' && application.relationship !== 'available'), [evidencedApplications]);
  const dockerResources = useMemo(() => evidencedApplications
    .filter((application) => application.evidence?.source === 'docker'), [evidencedApplications]);
  const repairResources = useMemo(() => managedApps.filter((app) => hasRepairDetail(app)), [managedApps]);
  const tailscaleCheck = state.setup?.checks?.find((check) => check.id === 'tailscale');

  if (loading) {
    return <DiagnosticsLoadingState />;
  }

  const refresh = () => void Promise.all([load(true), appState.refresh()]).catch(() => {});

  return (
    <PageShell>
      <ExtensionActionTarget actionId="review-diagnostics" routeId="diagnostics">
        {!summary ? <DiagnosticsErrorState message={error || 'Diagnostics are unavailable.'} onRetry={refresh} /> : (
          <section className="space-y-4">
            <DiagnosticsHeader error={error} onRefresh={refresh} refreshing={refreshing || logsBusy || appState.isFetching} checkedAt={summary.checkedAt} />
            <Tabs defaultValue="health" className="gap-0 rounded-2xl border border-border/50 bg-card">
              <TabsList aria-label="Diagnostics sections" className="mx-5 mt-2 gap-5 border-b border-border/30" variant="line">
                <TabsTrigger className="h-auto gap-2 px-3 py-3" value="health"><ListChecks aria-hidden="true" />Health checks</TabsTrigger>
                <TabsTrigger className="h-auto gap-2 px-3 py-3" value="report"><ClipboardList aria-hidden="true" />Support report</TabsTrigger>
                <TabsTrigger className="h-auto gap-2 px-3 py-3" value="logs"><TerminalSquare aria-hidden="true" />Technical logs</TabsTrigger>
              </TabsList>
              <TabsContent className="space-y-5 p-5" value="health">
                <HealthChecksWorkspace conflict={conflict} findings={findings} healthChecks={healthChecks} />
                <AdvancedSection icon={Server} title="System details">
                  <SystemDetailsWorkspace dockerResources={dockerResources} onOpenSettings={() => openSettings('advanced')} ownershipResources={ownershipResources} repairResources={repairResources} setup={state.setup} summary={summary} tailscaleCheck={tailscaleCheck?.message || summary.tailscaleStatus || 'Unknown'} />
                </AdvancedSection>
              </TabsContent>
              <TabsContent className="space-y-4 p-5" value="report">
                <SupportReportWorkspace bundle={state.bundle} busy={bundleBusy} onCopy={() => void copyBundle()} onDownload={downloadBundle} onGenerate={() => void generateBundle()} />
                <AdvancedSection icon={ShieldCheck} title="What gets redacted?">
                  <p>Redaction reduces sensitive context. Review the report before sharing it.</p>
                  <div className="grid gap-3 md:grid-cols-2">{redactionRules.length ? redactionRules.map(rule => <RedactionRuleCard rule={rule} key={rule.id} />) : <p>Redaction rules are unavailable.</p>}</div>
                </AdvancedSection>
              </TabsContent>
              <TabsContent className="space-y-4 p-5" value="logs">
                <TechnicalLogsWorkspace logs={state.logs} busy={logsBusy || refreshing} onRefresh={() => void refreshLogs()} />
              </TabsContent>
            </Tabs>
          </section>
        )}
      </ExtensionActionTarget>
    </PageShell>
  );
}

function DiagnosticsHeader({ error, onRefresh, refreshing, checkedAt }: { error: string | null; onRefresh: () => void; refreshing: boolean; checkedAt?: string }) {
  return (
    <PageHeader icon={ListChecks} title="Diagnostics" description="Check this server. Collect context when you need help.">
      <div className="flex min-h-8 w-48 items-center justify-end text-xs text-muted-foreground">
        {error ? <ContextChip label="Checks stale" title="Last refresh failed"><p>{error}</p><p>Previous checks remain visible. Use Refresh to try again.</p></ContextChip> : <span>{refreshing ? 'Checking…' : `Checked ${formatDate(checkedAt)}`}</span>}
      </div>
      <Button variant="outline" aria-disabled={refreshing} aria-busy={refreshing} onClick={refreshing ? undefined : onRefresh} type="button"><RefreshCw aria-hidden="true" className={cn('size-4', refreshing && 'animate-spin')} />Refresh</Button>
    </PageHeader>
  );
}

function HealthChecksWorkspace({ conflict, findings, healthChecks }: { conflict: ReturnType<typeof productionConflictSummary>; findings: SupportFinding[]; healthChecks: NotebookHealthCheck[] }) {
  return (
    <div className="space-y-5">
      <WorkspaceHeading description="Current setup, app readiness, access, storage, and backup signals." title="Health checks" />
      {conflict && (
        <div className={cn('rounded-xl border p-3', conflict.tone === 'warning' ? 'border-amber-300/30 bg-amber-400/10' : 'border-cyan-300/25 bg-cyan-400/10')}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-sm font-semibold text-white">{conflict.title}</p><p className="mt-1 text-xs leading-5 text-sky-100/70">{conflict.message}</p></div>
            <ProjectPrimaryButton asChild className="h-8 shrink-0 px-2.5 text-xs"><Link to="/apps">Review existing apps</Link></ProjectPrimaryButton>
          </div>
        </div>
      )}
      <div className="divide-y divide-border/30">
        {healthChecks.length ? healthChecks.map((check) => <NotebookHealthCheckRow check={check} key={`${check.label}-${check.status}`} />) : <p className="text-sm text-muted-foreground">Health checks are unavailable. Refresh to try again.</p>}
      </div>
      {findings.length ? <div className="space-y-3">{findings.map(finding => <FindingCard finding={finding} key={finding.id} />)}</div> : <p className="text-sm text-muted-foreground">No support findings reported.</p>}
    </div>
  );
}

function NotebookHealthCheckRow({ check }: { check: NotebookHealthCheck }) {
  const Icon = check.tone === 'warning' ? CircleAlert : check.tone === 'success' ? CheckCircle2 : ListChecks;
  return (
    <div className="flex items-center gap-3 py-4">
      <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg border', check.tone === 'warning' ? 'border-amber-300/25 bg-amber-400/10 text-amber-100' : check.tone === 'success' ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100' : 'border-sky-300/20 bg-slate-900 text-sky-100')}><Icon aria-hidden="true" className="size-3.5" /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white">{check.label}</span><span className="mt-0.5 block text-xs leading-5 text-sky-100/60">{check.detail}</span></span>
      <span className={cn('shrink-0 text-xs font-semibold', check.tone === 'warning' ? 'text-amber-100' : check.tone === 'success' ? 'text-emerald-100' : 'text-sky-100/75')}>{check.status}</span>
    </div>
  );
}

function SupportReportWorkspace({ bundle, busy, onCopy, onDownload, onGenerate }: { bundle: SupportBundle | null; busy: boolean; onCopy: () => void; onDownload: () => void; onGenerate: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <WorkspaceHeading description="Review redacted context before sharing it." title="Support report" />
        <Button aria-disabled={busy} aria-busy={busy} onClick={busy ? undefined : onGenerate}><ClipboardList aria-hidden="true" className={cn('size-4', busy && 'animate-spin')} />{busy ? 'Generating…' : bundle ? 'Regenerate report' : 'Generate report'}</Button>
      </div>
      {bundle ? <>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Snapshot · Generated {formatDate(bundle.generatedAt)}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCopy}><Copy aria-hidden="true" className="size-4" />Copy report</Button>
            <Button variant="outline" size="sm" onClick={onDownload}><Download aria-hidden="true" className="size-4" />Download report</Button>
          </div>
        </div>
        <pre aria-label="Report preview" tabIndex={0} className="max-h-80 select-text overflow-auto whitespace-pre-wrap rounded-xl border border-border/50 bg-background p-4 text-xs leading-6 text-muted-foreground">{bundle.bundleText}</pre>
      </> : <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 p-6 text-center text-muted-foreground">
        <ClipboardList aria-hidden="true" className="size-7" />
        <p>No report generated yet.</p><p className="text-xs">Generate a report to review, copy or download it.</p>
      </div>}
    </div>
  );
}

function TechnicalLogsWorkspace({ logs, busy, onRefresh }: { logs: SupportLogLine[]; busy: boolean; onRefresh: () => void }) {
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <WorkspaceHeading description="Recent backend events with sensitive details masked." title="Technical logs" />
        <Button variant="outline" aria-disabled={busy} aria-busy={busy} onClick={busy ? undefined : onRefresh}><RefreshCw aria-hidden="true" className={cn('size-4', busy && 'animate-spin')} />{busy ? 'Loading…' : 'Refresh logs'}</Button>
      </div>
      <div aria-label="Redacted logs" role="region" tabIndex={0} className="max-h-96 min-h-64 overflow-auto rounded-xl border border-border/50 bg-background p-4 font-mono text-xs leading-6">
        {logs.length ? logs.map((line, index) => <LogLine key={`${line.line}-${index}`} line={line} />) : <p className="text-muted-foreground">{busy ? 'Loading recent events…' : 'No logs were available.'}</p>}
      </div>
    </>
  );
}

function SystemDetailsWorkspace({ dockerResources, onOpenSettings, ownershipResources, repairResources, setup, summary, tailscaleCheck }: { dockerResources: ApplicationView[]; onOpenSettings: () => void; ownershipResources: ApplicationView[]; repairResources: AppRuntimeView[]; setup: SystemSetupStatus | null; summary: SupportSummary | null; tailscaleCheck: string }) {
  return (
    <div className="grid min-h-full content-start gap-3">
      <section className="grid gap-3 rounded-xl border border-sky-300/15 bg-slate-950/25 p-3 md:grid-cols-2">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-sky-100/55">Instance</p><div className="mt-2 grid gap-2 text-sm"><InfoLine label="Name" value={setup?.instanceSlug || 'Unknown'} /><InfoLine label="ID" value={setup?.instanceId || 'Unknown'} /><InfoLine label="Mode" value={setup?.devMode ? 'Development' : 'Production'} /><InfoLine label="Profiles" value={setup?.activeProfiles || 'default'} /></div></div>
        <div><p className="text-xs font-semibold uppercase tracking-wide text-sky-100/55">Version</p><div className="mt-2 grid gap-2 text-sm"><InfoLine label="Version" value={summary?.version?.version || 'Unknown'} /><InfoLine label="Build" value={summary?.version?.buildSha ? shortSha(summary.version.buildSha) : 'Unknown'} /><InfoLine label="Generated" value={formatDate(summary?.checkedAt)} /></div></div>
      </section>
      <ApplicationStateContent>
      <AdvancedSection defaultOpen={false} icon={Server} title="App ownership details">{ownershipResources.length ? ownershipResources.map((application) => <ResourceLine application={application} key={application.id} />) : <p className="text-sm text-slate-400">No apps require ownership review.</p>}</AdvancedSection>
      <AdvancedSection defaultOpen={repairResources.length > 0} icon={ShieldCheck} title="App repair details">{repairResources.length ? repairResources.map((app) => <RepairLine app={app} key={app.appId} />) : <p className="text-sm text-slate-400">No app repair attempts or remediation states are currently visible.</p>}</AdvancedSection>
      <AdvancedSection defaultOpen={false} icon={FileText} title="Docker resources">{dockerResources.length ? dockerResources.map((application) => <ResourceLine application={application} key={application.id} technical />) : <p className="text-sm text-slate-400">No matching Docker evidence is present in the app inventory.</p>}</AdvancedSection>
      </ApplicationStateContent>
      <AdvancedSection defaultOpen={false} icon={LockKeyhole} title="Tailscale details"><div className="grid gap-3 md:grid-cols-2"><InfoLine label="Tailscale" value={tailscaleCheck} /><InfoLine label="Version" value={setup?.tailscaleVersion || 'Unknown'} /><InfoLine label="Instance" value={setup?.instanceSlug || 'Unknown'} /></div></AdvancedSection>
      <section className="rounded-xl border border-sky-300/15 bg-slate-950/25 p-3"><SectionHeader compact icon={LifeBuoy} title="Related pages" description="Focused views for common support tasks." /><div className="mt-3 grid gap-2 sm:grid-cols-2"><RelatedLink onClick={onOpenSettings} title="Settings" detail="Host setup checks and appliance runtime checks." /><RelatedLink to="/apps" title="My Apps" detail="Review apps that need recovery or conflict resolution." /><RelatedLink to="/access" title="Access" detail="Tailscale, private links, and home network issues." /><RelatedLink to="/activity" title="Activity Log" detail="Detailed system events for advanced troubleshooting." /></div></section>
    </div>
  );
}

function WorkspaceHeading({ description, title }: { description: string; title: string }) {
  return <div><h2 className="text-lg font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>;
}

function notebookHealthChecks(doctor: SystemDoctorStatus | null, setup: SystemSetupStatus | null): NotebookHealthCheck[] {
  const checks = doctor?.checks?.length ? doctor.checks : setup?.checks || [];
  return checks.map((check) => ({
    detail: check.detail || check.message || 'No additional detail is available.',
    label: check.label,
    status: notebookCheckStatus(check.status),
    tone: notebookStatusTone(check.status),
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

function AdvancedSection({ children, defaultOpen = false, icon: Icon, title }: { children: ReactNode; defaultOpen?: boolean; icon: LucideIcon; title: string }) {
  return (
    <Collapsible className="rounded-xl border border-border/50 bg-background/40 p-4" defaultOpen={defaultOpen}>
      <CollapsibleTrigger className="group flex w-full items-center gap-2 text-left text-sm font-medium">
        <ChevronDown aria-hidden="true" className="size-4 -rotate-90 transition-transform group-data-[state=open]:rotate-0" />
        <Icon aria-hidden="true" className="size-4 text-muted-foreground" />{title}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-4 space-y-3 text-sm text-muted-foreground">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function ResourceLine({ application, technical = false }: { application: ApplicationView; technical?: boolean }) {
  const evidence = application.evidence;
  return (
    <SupportInset>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-bold text-white">{application.name}</p>
          <p className="mt-1 text-sm text-slate-400">{application.relationshipDescription}</p>
        </div>
        <MetadataBadge>{evidence?.statusLabel || application.relationshipLabel}</MetadataBadge>
      </div>
      {technical && (
        <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
          <span>State: {application.runtime?.state || evidence?.runtimeState || 'unknown'}</span>
          <span>Catalog: {application.id}</span>
          <span>Source: {evidence?.source || 'Unknown'}</span>
          <span>Relationship: {application.relationshipLabel}</span>
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
          {app.remediation?.label || app.state}
        </StatusBadge>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
        <span>Health: {app.healthSnapshot?.status || app.state}</span>
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

function repairTone(tone?: string): StatusBadgeTone {
  if (tone === 'critical') return 'danger';
  if (tone === 'warning') return 'warning';
  if (tone === 'success') return 'success';
  return 'neutral';
}

export default SupportPage;
