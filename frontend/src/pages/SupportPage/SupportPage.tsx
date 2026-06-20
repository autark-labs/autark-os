import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ClipboardList, Copy, FileText, LifeBuoy, LockKeyhole, RefreshCw, ShieldCheck, TerminalSquare, Tags } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageErrorState, PageLoadingState } from '@/components/project-os/PageState';
import { PageShell, SurfaceFrame, SurfacePanel } from '@/components/project-os/ProjectOSComponents';
import { SystemAPIClient } from '@/api/SystemAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { cn } from '@/lib/utils';
import type { SupportBundle, SupportLogLine, SupportSummary, SystemDoctorStatus } from '@/types/system';
import { BasicSupportCard, CommandCard, FindingCard, InfoLine, LogLine, RedactionRuleCard, RelatedLink, SectionHeader, SignalCard, statusIcon, statusTone } from './SupportPage.components';
import { formatDate, humanize, shortSha, summaryFromBundle } from './SupportPage.logic';

type SupportState = {
  bundle: SupportBundle | null;
  doctor: SystemDoctorStatus | null;
  logs: SupportLogLine[];
  summary: SupportSummary | null;
};

function SupportPage() {
  const { showAdvancedMetrics } = useProjectSettings();
  const [state, setState] = useState<SupportState>({ bundle: null, doctor: null, logs: [], summary: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function load(background = false) {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      if (showAdvancedMetrics) {
        const [logs, bundle, doctor] = await Promise.all([
          SystemAPIClient.supportLogs(160),
          SystemAPIClient.supportBundle(),
          SystemAPIClient.doctor(),
        ]);
        setState({ bundle, doctor, logs, summary: summaryFromBundle(bundle) });
      } else {
        const [summary, logs, doctor] = await Promise.all([
          SystemAPIClient.supportSummary(),
          SystemAPIClient.supportLogs(80),
          SystemAPIClient.doctor(),
        ]);
        setState({ bundle: null, doctor, logs, summary });
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Support data could not be loaded.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, [showAdvancedMetrics]);

  async function copy(value: string, id: string) {
    await navigator.clipboard.writeText(value);
    setCopied(id);
    window.setTimeout(() => setCopied(null), 1600);
  }

  const summary = state.summary;
  const errorLogs = useMemo(() => state.logs.filter((line) => line.level === 'error').length, [state.logs]);
  const warningLogs = useMemo(() => state.logs.filter((line) => line.level === 'warning').length, [state.logs]);
  const findings = summary?.findings || state.bundle?.findings || [];
  const redactionRules = summary?.redactionRules || state.bundle?.redactionRules || [];

  if (loading) {
    return (
      <PageLoadingState label="Loading support console" sublabel="Collecting safe diagnostics, findings, and recent logs." />
    );
  }

  return (
    <PageShell>
      <SurfaceFrame>
        <div className="border-b border-white/10 bg-po-hero-support p-6 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-normal text-sky-300">Support Console</p>
              <h1 className="mt-2 text-3xl font-black leading-none text-white md:text-5xl">Safe diagnostics</h1>
              <p className="mt-3 max-w-3xl text-sm text-slate-300 md:text-base">
                {showAdvancedMetrics
                  ? 'Inspect Project OS behavior, copy a redacted support bundle, and use safe local commands without opening a browser shell.'
                  : 'Check Project OS health and jump to the right page when something needs attention.'}
              </p>
            </div>
            <Button className="gap-2 border border-sky-300/20 bg-sky-500/15 text-sky-100 hover:bg-sky-500/25" disabled={refreshing} onClick={() => void load(true)}>
              <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>

        {error && <PageErrorState className="rounded-none border-x-0 border-t-0 px-6 py-4" message={error} onRetry={() => void load(true)} title="Support data could not refresh" />}

        <div className="grid gap-4 p-5 lg:grid-cols-5">
          <SignalCard icon={statusIcon(summary?.status)} label="Support status" value={summary?.headline || 'Unknown'} detail={summary?.summary || 'Project OS could not load support status.'} tone={statusTone(summary?.status)} />
          <SignalCard icon={Tags} label="Version" value={summary?.version?.version || 'Unknown'} detail={summary?.version?.buildSha ? `Build ${shortSha(summary.version.buildSha)}. Updates: ${summary.version.updateStatus}.` : 'Build metadata unavailable.'} tone="sky" />
          <SignalCard icon={ShieldCheck} label="Readiness" value={state.doctor?.readiness.headline || summary?.backendHealth || 'Unknown'} detail={state.doctor?.readiness.summary || 'First-boot readiness status from Project OS doctor.'} tone={state.doctor?.readiness.canCompleteOnboarding ? 'green' : 'amber'} />
          <SignalCard icon={AlertTriangle} label="Findings" value={`${findings.length}`} detail={`${errorLogs} error log line(s), ${warningLogs} warning line(s) in recent logs.`} tone={findings.length ? 'amber' : 'slate'} />
          <SignalCard icon={LockKeyhole} label="Redaction" value={summary?.redacted ? 'Enabled' : 'Unknown'} detail="Secrets, credentials, and tailnet URLs are masked in support data." tone="violet" />
        </div>
      </SurfaceFrame>

      <SafeDiagnosticsOverview doctor={state.doctor} findings={findings} redactionRules={redactionRules} showAdvancedMetrics={showAdvancedMetrics} summary={summary} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="grid gap-5">
          <SurfacePanel>
            <SectionHeader icon={LifeBuoy} title="Recommended next steps" description="Support findings link directly to the page that owns the fix." />
            <div className="mt-4 grid gap-3">
              {findings.length ? findings.map((finding) => <FindingCard finding={finding} key={finding.id} />) : (
                <div className="rounded-lg border border-emerald-300/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                  No support findings need attention right now.
                </div>
              )}
            </div>
          </SurfacePanel>

          <SurfacePanel>
            {showAdvancedMetrics ? (
              <>
                <SectionHeader icon={FileText} title="Project OS logs" description="Recent backend logs are bounded and redacted before display." />
                <div className="mt-4 max-h-[380px] overflow-y-auto rounded-lg border border-slate-800 bg-black/55 p-3 font-mono text-xs leading-5 text-slate-300">
                  {state.logs.length ? state.logs.map((line, index) => <LogLine key={`${line.line}-${index}`} line={line} />) : <p className="text-slate-500">No logs were available. Recent activity will still appear in the support bundle.</p>}
                </div>
              </>
            ) : (
              <>
                <SectionHeader icon={FileText} title="Recent problems" description="Project OS hides detailed logs in Basic mode and shows the important signals first." />
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <BasicSupportCard label="Errors" value={`${errorLogs}`} detail={errorLogs ? 'Review Monitoring or enable Advanced mode to inspect logs.' : 'No recent error lines found.'} tone={errorLogs ? 'red' : 'green'} />
                  <BasicSupportCard label="Warnings" value={`${warningLogs}`} detail={warningLogs ? 'Some recent warnings were reported.' : 'No recent warnings found.'} tone={warningLogs ? 'amber' : 'green'} />
                </div>
                <div className="mt-4 rounded-lg border border-violet-300/20 bg-violet-500/10 p-4 text-sm text-violet-100">
                  Support bundles, raw logs, and terminal commands are available in Advanced mode.
                  <Button asChild className="ml-0 mt-3 border-violet-300/30 bg-slate-950/50 text-violet-100 hover:bg-slate-900 sm:ml-3 sm:mt-0" size="sm" type="button" variant="outline">
                    <Link to="/settings">Open Settings</Link>
                  </Button>
                </div>
              </>
            )}
          </SurfacePanel>

          {showAdvancedMetrics && <SurfacePanel>
            <SectionHeader icon={ClipboardList} title="Support bundle" description="Copy this when you need to share troubleshooting context. It is redacted by the backend." />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button className="bg-violet-600 text-white hover:bg-violet-500" disabled={!state.bundle?.bundleText} onClick={() => state.bundle?.bundleText && copy(state.bundle.bundleText, 'bundle')} type="button">
                <Copy className="size-4" />
                {copied === 'bundle' ? 'Copied' : 'Copy support bundle'}
              </Button>
              <Badge className="border-emerald-300/20 bg-emerald-500/10 text-emerald-200" variant="outline">Redaction enabled</Badge>
              <span className="text-xs text-slate-500">Generated {formatDate(state.bundle?.generatedAt)}</span>
            </div>
            <pre className="mt-4 max-h-[320px] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950/70 p-4 text-xs leading-5 text-slate-400">{state.bundle?.bundleText || 'Support bundle unavailable.'}</pre>
          </SurfacePanel>}
        </div>

        <aside className="grid gap-5">
          <SurfacePanel>
            <SectionHeader compact icon={LockKeyhole} title="Redaction review" description="What Project OS masks before showing support data." />
            <div className="mt-4 grid gap-3">
              {redactionRules.map((rule) => <RedactionRuleCard rule={rule} key={rule.id} />)}
              {!redactionRules.length && <p className="text-sm text-slate-500">Redaction rules are unavailable.</p>}
            </div>
          </SurfacePanel>

          <SurfacePanel>
            <SectionHeader compact icon={Tags} title="Version and updates" description="Included in support context for troubleshooting." />
            <div className="mt-4 grid gap-2 text-sm">
              <InfoLine label="Version" value={summary?.version?.version || state.bundle?.version?.version || 'Unknown'} />
              <InfoLine label="Build" value={summary?.version?.buildSha || state.bundle?.version?.buildSha || 'Unknown'} />
              <InfoLine label="Updates" value={summary?.version?.updateMessage || state.bundle?.version?.updateMessage || 'Update status unavailable.'} />
              {showAdvancedMetrics && <InfoLine label="Install path" value={summary?.version?.installPath || state.bundle?.version?.installPath || 'Unknown'} />}
              {showAdvancedMetrics && <InfoLine label="Runtime path" value={summary?.version?.runtimePath || state.bundle?.version?.runtimePath || 'Unknown'} />}
            </div>
          </SurfacePanel>

          {showAdvancedMetrics && <SurfacePanel>
            <SectionHeader compact icon={ClipboardList} title="Included areas" description="The support bundle includes high-level app, network, storage, and backup context." />
            <div className="mt-4 grid gap-3">
              {(state.bundle?.domainSummaries || []).map((area) => (
                <div className="rounded-lg border border-slate-700/45 bg-slate-900/45 p-3" key={area.id}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold text-white">{area.label}</p>
                    <Badge className="border-slate-600/60 bg-slate-950/60 text-slate-300" variant="outline">{humanize(area.status)}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">{area.headline}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{area.summary}</p>
                </div>
              ))}
              {!state.bundle?.domainSummaries?.length && <p className="text-sm text-slate-500">Support area summaries are unavailable.</p>}
            </div>
          </SurfacePanel>}

          {showAdvancedMetrics && <SurfacePanel>
            <SectionHeader compact icon={TerminalSquare} title="Safe commands" description="Copy-only commands for the local terminal. The browser does not execute them." />
            <div className="mt-4 grid gap-3">
              {(summary?.commands || []).map((command) => (
                <CommandCard command={command.command} copied={copied} description={command.description} id={command.id} key={command.id} label={command.label} onCopy={copy} />
              ))}
            </div>
          </SurfacePanel>}

          <SurfacePanel>
            <SectionHeader compact icon={LifeBuoy} title="Related pages" description="Jump to focused views for common support tasks." />
            <div className="mt-4 grid gap-2">
              <RelatedLink to="/monitoring" title="Monitoring" detail="Activity timeline, stability, and resource graphs." />
              <RelatedLink to="/settings" title="Settings" detail="Host setup checks and service-user guidance." />
              <RelatedLink to="/apps" title="My Apps" detail="App health, repair actions, and connection details." />
              <RelatedLink to="/access" title="Access" detail="Tailscale, private links, and network issues." />
            </div>
          </SurfacePanel>
        </aside>
      </div>
    </PageShell>
  );
}

function SafeDiagnosticsOverview({ doctor, findings, redactionRules, showAdvancedMetrics, summary }: { doctor: SystemDoctorStatus | null; findings: SupportSummary['findings']; redactionRules: SupportSummary['redactionRules']; showAdvancedMetrics: boolean; summary: SupportSummary | null }) {
  return (
    <section className="grid gap-4 lg:grid-cols-5">
      <DiagnosticStep
        icon={ClipboardList}
        label="Checked"
        text={doctor ? `${doctor.readiness.headline}: ${doctor.readiness.summary}` : summary ? `Backend: ${summary.backendHealth || 'unknown'}, Docker: ${summary.dockerStatus || 'unknown'}, Tailscale: ${summary.tailscaleStatus || 'unknown'}.` : 'Project OS could not load diagnostic checks yet.'}
        tone="sky"
      />
      <DiagnosticStep
        icon={findings.length ? AlertTriangle : ShieldCheck}
        label="Found"
        text={findings.length ? `${findings.length} finding${findings.length === 1 ? '' : 's'} need review. Start with recommended next steps.` : 'No support findings need attention right now.'}
        tone={findings.length ? 'amber' : 'green'}
      />
      <DiagnosticStep
        icon={LockKeyhole}
        label="Redacted"
        text={summary?.redacted ? `${redactionRules.length || 'Standard'} masking rules hide secrets before display.` : 'Redaction status is unavailable.'}
        tone="violet"
      />
      <DiagnosticStep
        icon={Copy}
        label="Safe to share"
        text={showAdvancedMetrics ? 'Use the redacted support bundle when you need to share troubleshooting context.' : 'Basic mode shows the summary only; enable Advanced to copy the redacted bundle.'}
        tone="slate"
      />
      <DiagnosticStep
        icon={LifeBuoy}
        label="Next"
        text={findings[0]?.actionLabel ? `${findings[0].actionLabel}: ${findings[0].title}` : 'No immediate support action is needed.'}
        tone={findings.length ? 'amber' : 'green'}
      />
    </section>
  );
}

function DiagnosticStep({ icon: Icon, label, text, tone }: { icon: LucideIcon; label: string; text: string; tone: 'green' | 'amber' | 'sky' | 'slate' | 'violet' }) {
  const tones = {
    amber: 'border-amber-300/20 bg-amber-500/10 text-amber-100',
    green: 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100',
    sky: 'border-sky-300/20 bg-sky-500/10 text-sky-100',
    slate: 'border-slate-700/60 bg-slate-900/55 text-slate-300',
    violet: 'border-violet-300/20 bg-violet-500/10 text-violet-100',
  };
  return (
    <div className={cn('rounded-lg border p-4', tones[tone])}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase text-current/70">{label}</p>
        <Icon className="size-4" />
      </div>
      <p className="mt-3 text-sm leading-6 text-current/80">{text}</p>
    </div>
  );
}

export default SupportPage;
