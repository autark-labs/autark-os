import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clock3, ExternalLink, RotateCcw, ShieldCheck, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { DisabledAction } from '@/components/project-os/DisabledAction';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { AppAccessCheck, AppEvent, AppHealthSnapshot, AppRuntimeView, AppTelemetry } from '@/types/app';
import type { PrivateAccessReconciliationItem } from '@/types/network';
import { Diagnostic } from './ApplicationsPage.shared';
import { buildAppIssueGuidance } from './extensions/ApplicationsPage.issueActions';
import { formatDate, humanize } from './extensions/ApplicationsPage.logic';
import { appRemediationDisplay } from './extensions/ApplicationsPage.remediation';
import type { AppAction } from './extensions/ApplicationsPage.types';

type ApplicationsStabilityTabProps = {
  access?: AppAccessCheck;
  app: AppRuntimeView;
  autoRepairEnabled: boolean;
  health?: AppHealthSnapshot | null;
  onAction: (action: AppAction) => void;
  saving?: boolean;
  onAutoRepairChange: (enabled: boolean) => void;
  reconciliation?: PrivateAccessReconciliationItem | null;
  telemetry?: AppTelemetry | null;
};

export function ApplicationsStabilityTab({ access, app, autoRepairEnabled, health: liveHealth, onAction, onAutoRepairChange, reconciliation, saving = false, telemetry }: ApplicationsStabilityTabProps) {
  const stabilityEvents = app.recentEvents.filter(isStabilityEvent);
  const latestFailure = stabilityEvents.find((event) => event.type.includes('failed'));
  const latestSuccess = stabilityEvents.find((event) => event.type.includes('completed') || event.type === 'private_access_enabled');
  const latestRepair = stabilityEvents.find((event) => event.type.includes('repair') || event.type.includes('private_access'));
  const health = liveHealth || app.healthSnapshot;
  const issueGuidance = buildAppIssueGuidance({ access, app, health, reconciliation, telemetry });
  const remediation = appRemediationDisplay({ app, health });

  return (
    <div className="grid gap-4">
      {remediation && <RemediationSummaryCard remediation={remediation} />}
      {issueGuidance && <IssueGuidanceCard guidance={issueGuidance} onAction={onAction} />}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StabilityCard
          icon={autoRepairEnabled ? ShieldCheck : AlertTriangle}
          label="Background repair"
          tone={autoRepairEnabled ? 'green' : 'amber'}
          value={autoRepairEnabled ? 'On' : 'Off'}
          detail={autoRepairEnabled ? 'Project OS can try safe fixes automatically.' : 'Project OS will only watch and report.'}
        />
        <StabilityCard
          icon={health?.status === 'Ready' ? CheckCircle2 : AlertTriangle}
          label="Current health"
          tone={health?.status === 'Ready' ? 'green' : health?.status === 'Starting' ? 'amber' : 'red'}
          value={health?.status || app.friendlyStatus}
          detail={health?.message || app.healthCheck}
        />
        <StabilityCard
          icon={RotateCcw}
          label="Last fix"
          tone={latestSuccess ? 'green' : 'slate'}
          value={latestSuccess ? humanize(latestSuccess.type) : 'None yet'}
          detail={latestSuccess ? formatDate(latestSuccess.createdAt) : 'No successful repair recorded.'}
        />
        <StabilityCard
          icon={latestFailure ? AlertTriangle : Clock3}
          label="Latest failure"
          tone={latestFailure ? 'red' : 'slate'}
          value={latestFailure ? humanize(latestFailure.type) : 'None'}
          detail={latestFailure ? latestFailure.message : 'No repair failure recorded.'}
        />
      </section>

      <section className="rounded-lg border border-slate-700/30 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="font-bold text-white">Self-repair</h4>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">Project OS watches this app in the background and can retry safe fixes like restarting containers or recreating a private link.</p>
          </div>
          <DisabledAction disabled={saving} reason="Project OS is already saving the self-repair setting.">
            <label className="flex items-center gap-3 rounded-lg border border-slate-700/40 bg-slate-950/50 px-3 py-2 text-sm text-slate-200">
              <span>{saving ? 'Saving...' : autoRepairEnabled ? 'Automatic fixes on' : 'Automatic fixes off'}</span>
              <Switch checked={autoRepairEnabled} disabled={saving} onCheckedChange={onAutoRepairChange} />
            </label>
          </DisabledAction>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Diagnostic label="Last check" value={formatDate(health?.checkedAt)} />
          <Diagnostic label="Last repair attempt" value={formatDate(app.settings?.lastRepairAttemptAt)} />
          <Diagnostic label="Repair result" value={humanize(app.settings?.lastRepairStatus || 'No repair recorded')} />
          <Diagnostic label="Failure reason" value={latestFailure?.message || 'No current failure reason.'} />
        </div>
      </section>

      <section className="rounded-lg border border-slate-700/30 bg-slate-900/60 p-4">
        <div className="flex items-start gap-3">
          <Wrench className="mt-1 size-4 text-violet-300" />
          <div>
            <h4 className="font-bold text-white">Recent stability activity</h4>
            <p className="mt-1 text-sm text-slate-400">These are the checks and repairs Project OS has recorded for this app.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3">
          {stabilityEvents.length ? stabilityEvents.map((event) => <StabilityEventRow event={event} key={event.id} />) : (
            <div className="rounded-lg border border-slate-700/30 bg-slate-950/40 p-4 text-sm text-slate-400">No stability activity has been recorded yet.</div>
          )}
        </div>
      </section>

      {latestRepair?.message && (
        <section className="rounded-lg border border-violet-300/20 bg-violet-500/10 p-4 text-sm text-violet-100">
          <p className="font-semibold text-white">Most recent repair note</p>
          <p className="mt-1">{latestRepair.message}</p>
        </section>
      )}
    </div>
  );
}

function RemediationSummaryCard({ remediation }: { remediation: ReturnType<typeof appRemediationDisplay> }) {
  const tone = remediation.tone === 'critical'
    ? 'border-red-300/25 bg-red-500/10 text-red-100'
    : remediation.tone === 'warning'
      ? 'border-amber-300/25 bg-amber-500/10 text-amber-100'
      : 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100';
  return (
    <section className={cn('rounded-lg border p-4', tone)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase text-current/70">Self-healing state</p>
          <h4 className="mt-1 text-lg font-black text-white">{remediation.label}</h4>
          <p className="mt-2 text-sm leading-6 text-current/85">{remediation.summary}</p>
        </div>
        <span className="rounded-full border border-white/10 bg-slate-950/40 px-3 py-1 text-xs font-bold text-white">{remediation.nextActionLabel}</span>
      </div>
    </section>
  );
}

function IssueGuidanceCard({ guidance, onAction }: { guidance: ReturnType<typeof buildAppIssueGuidance>; onAction: (action: AppAction) => void }) {
  if (!guidance) {
    return null;
  }
  const tone = guidance.tone === 'red'
    ? 'border-red-300/25 bg-red-500/10 text-red-100'
    : 'border-amber-300/25 bg-amber-500/10 text-amber-100';
  return (
    <section className={cn('rounded-lg border p-4', tone)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase text-current/70">Needs attention</p>
          <h4 className="mt-1 text-lg font-black text-white">{guidance.title}</h4>
          <p className="mt-2 text-sm leading-6 text-current/85">{guidance.summary}</p>
          <p className="mt-2 text-sm font-semibold text-white">{guidance.nextStep}</p>
        </div>
        <GuidancePrimaryAction guidance={guidance} onAction={onAction} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)]">
        <div className="rounded-lg border border-white/10 bg-slate-950/45 p-3">
          <p className="text-sm font-bold text-white">Before fixing</p>
          <ul className="mt-2 grid gap-1.5 text-sm text-current/80">
            {guidance.checklist.map((item) => <li className="flex gap-2" key={item}><span className="mt-2 size-1.5 shrink-0 rounded-full bg-current" />{item}</li>)}
          </ul>
        </div>
        {guidance.dangerousActions.length > 0 && (
          <div className="rounded-lg border border-red-300/20 bg-red-500/10 p-3">
            <p className="text-sm font-bold text-white">Advanced recovery</p>
            <p className="mt-1 text-xs leading-5 text-red-100/80">Always create a backup before using reinstall or reset options.</p>
            <div className="mt-3 grid gap-2">
              {guidance.dangerousActions.map((option) => (
                <Button asChild className="justify-start border-red-300/25 bg-slate-950/55 text-red-100 hover:bg-slate-900" key={option.label} size="sm" type="button" variant="outline">
                  <Link to={option.target} title={option.warning}>
                    <ExternalLink className="size-3.5" />
                    {option.label}
                  </Link>
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function GuidancePrimaryAction({ guidance, onAction }: { guidance: NonNullable<ReturnType<typeof buildAppIssueGuidance>>; onAction: (action: AppAction) => void }) {
  if (guidance.safeAction.kind === 'app-action' && guidance.safeAction.action === 'restart') {
    return (
      <Button className="bg-violet-600 text-white hover:bg-violet-500" onClick={() => onAction('restart')} type="button">
        <RotateCcw className="size-4" />
        {guidance.safeAction.label}
      </Button>
    );
  }
  if (guidance.safeAction.kind === 'link') {
    return (
      <Button asChild className="bg-violet-600 text-white hover:bg-violet-500" type="button">
        <Link to={guidance.safeAction.to}>
          <ExternalLink className="size-4" />
          {guidance.safeAction.label}
        </Link>
      </Button>
    );
  }
  return null;
}

function StabilityCard({ detail, icon: Icon, label, tone, value }: { detail: string; icon: LucideIcon; label: string; tone: 'green' | 'amber' | 'red' | 'slate'; value: string }) {
  const tones = {
    green: 'border-emerald-300/20 bg-emerald-500/10 text-emerald-200',
    amber: 'border-amber-300/20 bg-amber-500/10 text-amber-100',
    red: 'border-red-300/20 bg-red-500/10 text-red-100',
    slate: 'border-slate-700/40 bg-slate-950/45 text-slate-200',
  };
  return (
    <div className={cn('rounded-lg border p-4', tones[tone])}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase text-current/70">{label}</p>
        <Icon className="size-4" />
      </div>
      <p className="mt-3 text-lg font-bold text-white">{value}</p>
      <p className="mt-1 text-xs text-current/75">{detail}</p>
    </div>
  );
}

function StabilityEventRow({ event }: { event: AppEvent }) {
  const failed = event.type.includes('failed');
  const completed = event.type.includes('completed') || event.type === 'private_access_enabled';
  const started = event.type.includes('started') || event.type.includes('detected');
  return (
    <div className="grid gap-2 rounded-lg border border-slate-700/30 bg-slate-950/40 p-3 sm:grid-cols-[160px_minmax(0,1fr)_130px] sm:items-start">
      <span className={cn('inline-flex w-fit items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold', failed && 'border-red-300/25 bg-red-500/10 text-red-100', completed && 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100', started && !failed && !completed && 'border-violet-300/25 bg-violet-500/10 text-violet-100', !failed && !completed && !started && 'border-slate-700 bg-slate-900 text-slate-300')}>
        <span className="size-1.5 rounded-full bg-current" />
        {humanize(event.type)}
      </span>
      <p className="min-w-0 text-sm text-slate-300">{event.message}</p>
      <p className="text-xs text-slate-500 sm:text-right">{formatDate(event.createdAt)}</p>
    </div>
  );
}

function isStabilityEvent(event: AppEvent) {
  return event.type.startsWith('guardian_')
    || event.type.includes('repair')
    || event.type.includes('health')
    || event.type.includes('private_access');
}
