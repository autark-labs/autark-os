import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ClipboardList, Copy, Download, FileText, LifeBuoy, ListChecks, LockKeyhole, RefreshCw, Server, ShieldCheck, TerminalSquare } from 'lucide-react';
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
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { cn } from '@/lib/utils';
import { useApplicationStateRepository } from '@/repositories/applicationStateRepository';
import type { ObservedServiceView } from '@/types/observedService';
import type { AppRuntimeView } from '@/types/app';
import type { SupportBundle, SupportLogLine, SupportSummary, SystemDoctorStatus, SystemSetupStatus } from '@/types/system';
import { diagnosticsHeadline, diagnosticsSummaryRows, productionConflictSummary } from './SupportPage.diagnosticsModel';
import { formatDate, humanize, shortSha, summaryFromBundle } from './SupportPage.logic';
import { downloadSupportReport } from './SupportPage.supportReport';
import { FindingCard, InfoLine, LogLine, RedactionRuleCard, RelatedLink, SectionHeader, SupportInset, SupportPanel } from './SupportPage.components';

type SupportState = {
  bundle: SupportBundle | null;
  doctor: SystemDoctorStatus | null;
  logs: SupportLogLine[];
  setup: SystemSetupStatus | null;
  summary: SupportSummary | null;
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
  const appState = useApplicationStateRepository();
  const [state, setState] = useState<SupportState>(initialState);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bundleBusy, setBundleBusy] = useState(false);
  const [logsBusy, setLogsBusy] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logsContentRef = useRef<HTMLDivElement | null>(null);

  async function load(background = false) {
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
  }

  useEffect(() => {
    void load();
  }, [showAdvancedMetrics]);

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
    <PageShell>
      <Surface className="overflow-hidden" tone="panel">
        <div className="border-b border-sky-400/20 bg-slate-900 p-6 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-normal text-cyan-200">Diagnostics</p>
              <h1 className="mt-2 text-3xl font-black leading-none text-white md:text-5xl">Autark-OS Diagnostics</h1>
              <p className="mt-3 max-w-3xl text-sm text-slate-300 md:text-base">
                {headline === 'Ready'
                  ? 'Ready. Health checks, a support report, and technical logs are available when you need them.'
                  : headline === 'Status unavailable'
                    ? 'Autark-OS could not load current diagnostics. Try refreshing the health checks once the service is available.'
                    : 'Needs attention. Start with health checks, then generate a support report or view logs if you need more detail.'}
              </p>
            </div>
            <StatusBadge tone={headline === 'Ready' ? 'success' : 'warning'}>{headline}</StatusBadge>
          </div>
        </div>

        {error && <DiagnosticsErrorState message={error} onRetry={() => void load(true)} />}

        <div className="grid gap-3 p-5 md:grid-cols-5">
          {summaryRows.map((row) => <SummaryRow key={row.id} label={row.label} tone={row.tone} value={row.value} />)}
        </div>
      </Surface>

      {conflict && (
        <SupportPanel className={conflict.tone === 'warning' ? 'border-orange-400/45 bg-orange-500/10' : 'border-sky-400/30 bg-sky-500/10'}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black text-white">{conflict.title}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-200">{conflict.message}</p>
            </div>
            <ProjectPrimaryButton asChild className="shrink-0">
              <Link to="/resolve-existing-apps">Recover existing apps</Link>
            </ProjectPrimaryButton>
          </div>
        </SupportPanel>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <DiagnosticAction
          busy={refreshing}
          detail="Refresh host setup, app readiness, Docker, Tailscale, storage, and backup checks."
          icon={ListChecks}
          label="Run health checks"
          onClick={() => void load(true)}
        />
        <DiagnosticAction
          busy={bundleBusy}
          detail="Prepare a redacted support report with version, setup, health, and recent failure context."
          icon={ClipboardList}
          label="Generate support report"
          onClick={() => void generateBundle()}
        />
        <DiagnosticAction
          busy={logsBusy}
          detail="Open recent backend logs. Autark-OS masks secrets before showing them."
          icon={TerminalSquare}
          label="View technical logs"
          onClick={() => void viewLogs()}
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4">
          <SupportPanel>
            <SectionHeader icon={LifeBuoy} title="Recommended next steps" description="Support findings link to the page that owns the fix." />
            <div className="mt-4 grid gap-3">
              {findings.length ? findings.map((finding) => <FindingCard finding={finding} key={finding.id} />) : (
                <SupportInset className="border-emerald-300/20 bg-emerald-500/10 text-sm text-emerald-100">
                  No support findings need attention right now.
                </SupportInset>
              )}
            </div>
          </SupportPanel>

          <AdvancedSection defaultOpen={false} icon={Server} title="App ownership details">
            {ownershipResources.length ? ownershipResources.map((resource) => (
              <ResourceLine key={resource.id} resource={resource} />
            )) : <p className="text-sm text-slate-400">No found apps or ignored resources are currently visible.</p>}
          </AdvancedSection>

          <AdvancedSection defaultOpen={repairResources.length > 0} icon={ShieldCheck} title="App repair details">
            {repairResources.length ? repairResources.map((app) => (
              <RepairLine app={app} key={app.appId} />
            )) : <p className="text-sm text-slate-400">No app repair attempts or remediation states are currently visible.</p>}
          </AdvancedSection>

          <AdvancedSection defaultOpen={false} icon={FileText} title="Docker resources">
            {dockerResources.length ? dockerResources.map((resource) => (
              <ResourceLine key={resource.id} resource={resource} technical />
            )) : <p className="text-sm text-slate-400">No Docker resources were returned by the host inventory scan.</p>}
          </AdvancedSection>

          <AdvancedSection defaultOpen={false} icon={LockKeyhole} title="Tailscale details">
            <div className="grid gap-3 md:grid-cols-2">
              <InfoLine label="Tailscale" value={tailscaleCheck?.message || summary?.tailscaleStatus || 'Unknown'} />
              <InfoLine label="Private access permission" value={operatorCheck?.message || 'Waiting for Tailscale status.'} />
              <InfoLine label="Version" value={state.setup?.tailscaleVersion || 'Unknown'} />
              <InfoLine label="Instance" value={state.setup?.instanceSlug || 'Unknown'} />
            </div>
          </AdvancedSection>

          <AdvancedSection icon={TerminalSquare} onOpenChange={setLogsOpen} open={logsOpen} title="Recent logs">
            <div className="max-h-[380px] overflow-y-auto rounded-lg border border-slate-800 bg-black/55 p-3 font-mono text-xs leading-5 text-slate-300" ref={logsContentRef} tabIndex={-1}>
              {state.logs.length ? state.logs.map((line, index) => <LogLine key={`${line.line}-${index}`} line={line} />) : <p className="text-slate-500">No logs were available.</p>}
            </div>
          </AdvancedSection>

          <AdvancedSection defaultOpen={false} icon={ShieldCheck} title="Redaction rules">
            <div className="grid gap-3 md:grid-cols-2">
              {redactionRules.length ? redactionRules.map((rule) => <RedactionRuleCard rule={rule} key={rule.id} />) : <p className="text-sm text-slate-400">Redaction rules are unavailable.</p>}
            </div>
          </AdvancedSection>
        </div>

        <aside className="grid h-fit gap-5">
          <SupportPanel>
            <SectionHeader compact icon={ShieldCheck} title="Instance" description="Useful when comparing production and development hosts." />
            <div className="mt-4 grid gap-2 text-sm">
              <InfoLine label="Name" value={state.setup?.instanceSlug || 'Unknown'} />
              <InfoLine label="ID" value={state.setup?.instanceId || 'Unknown'} />
              <InfoLine label="Mode" value={state.setup?.devMode ? 'Development' : 'Production'} />
              <InfoLine label="Profiles" value={state.setup?.activeProfiles || 'default'} />
            </div>
          </SupportPanel>

          <SupportPanel>
            <SectionHeader compact icon={FileText} title="Version" description="Included in support context." />
            <div className="mt-4 grid gap-2 text-sm">
              <InfoLine label="Version" value={summary?.version?.version || 'Unknown'} />
              <InfoLine label="Build" value={summary?.version?.buildSha ? shortSha(summary.version.buildSha) : 'Unknown'} />
              <InfoLine label="Updates" value={summary?.version?.updateMessage || 'Update status unavailable.'} />
              <InfoLine label="Generated" value={formatDate(state.bundle?.generatedAt || summary?.checkedAt)} />
            </div>
          </SupportPanel>

          {(showAdvancedMetrics || state.bundle) && (
            <SupportPanel>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <SectionHeader compact icon={FileText} title="Support report" description="Redacted plain-text diagnostics for sharing with support." />
                {state.bundle && (
                  <div className="flex flex-wrap gap-2">
                    <ProjectDarkControlButton onClick={() => void copyBundle()} size="sm" type="button">
                      <Copy className="size-4" />
                      Copy report
                    </ProjectDarkControlButton>
                    <ProjectPrimaryButton onClick={downloadBundle} size="sm" type="button">
                      <Download className="size-4" />
                      Download report
                    </ProjectPrimaryButton>
                  </div>
                )}
              </div>
              <pre className="mt-4 max-h-[260px] select-text overflow-auto whitespace-pre-wrap rounded-lg border border-sky-400/25 bg-slate-950/70 p-4 text-xs leading-5 text-slate-400">{state.bundle?.bundleText || 'Generate a support report to preview redacted details.'}</pre>
            </SupportPanel>
          )}

          <SupportPanel>
            <SectionHeader compact icon={LifeBuoy} title="Related pages" description="Focused views for common support tasks." />
            <div className="mt-4 grid gap-2">
              <RelatedLink to="/settings" title="Settings" detail="Host setup checks and service-user guidance." />
              <RelatedLink to="/resolve-existing-apps" title="Resolve Existing Apps" detail="Review apps found on this server." />
              <RelatedLink to="/access" title="Access" detail="Tailscale, private links, and home network issues." />
              {showAdvancedMetrics && <RelatedLink to="/activity" title="Activity Log" detail="Detailed system events for advanced troubleshooting." />}
            </div>
          </SupportPanel>
        </aside>
      </div>
    </PageShell>
  );
}

function SummaryRow({ label, tone, value }: { label: string; tone: string; value: string }) {
  const tones = {
    success: 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100',
    warning: 'border-orange-400/45 bg-orange-500/10 text-orange-200',
    neutral: 'border-slate-700/60 bg-slate-900/55 text-slate-300',
  } as Record<string, string>;
  return (
    <div className={cn('rounded-lg border p-4', tones[tone] || tones.neutral)}>
      <p className="text-xs font-bold uppercase text-current/70">{label}</p>
      <p className="mt-2 text-lg font-black text-white">{value}</p>
    </div>
  );
}

function DiagnosticAction({ busy = false, detail, icon: Icon, label, onClick }: { busy?: boolean; detail: string; icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <DisabledAction className="w-full" disabled={busy} reason="Autark-OS is already preparing support information.">
      <button className="w-full rounded-xl border border-sky-400/30 bg-slate-900 p-5 text-left shadow-xl shadow-slate-950/30 transition hover:border-cyan-300/45 hover:bg-slate-800" disabled={busy} onClick={onClick} type="button">
        <div className="flex items-center justify-between gap-3">
          <span className="grid size-10 place-items-center rounded-lg border border-cyan-300/35 bg-cyan-400/10 text-cyan-100">
            {busy ? <RefreshCw className="size-5 animate-spin" /> : <Icon className="size-5" />}
          </span>
          <span className="text-sm font-bold uppercase text-slate-500">Action</span>
        </div>
        <p className="mt-4 text-xl font-black text-white">{label}</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">{detail}</p>
      </button>
    </DisabledAction>
  );
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
