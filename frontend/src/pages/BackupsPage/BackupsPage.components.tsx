import { AppWindow, Archive, CalendarClock, CheckCircle2, Clock3, Info, Loader2, Play, RotateCcw, ShieldCheck, Sparkles, TimerReset } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { ProjectInlineEmptyState as EmptyState } from '@/components/primitives/EmptyState';
import { ProjectDarkControlButton, ProjectPrimaryButton } from '@/components/primitives/ProjectButtons';
import { ProjectInset, ProjectPanel } from '@/components/primitives/Surface';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { AppBackupStatus, BackupReport, RestorePlan, RestorePoint } from '@/types/backup';
import { restorePointDetails } from './BackupsPage.restoreDetails';
import {
  type BackupOperationAvailability,
  backupAppBadgeTone,
  backupSchedulerLabel,
  backupSchedulerTone,
  backupStatusLabel,
  capitalizeBackupLabel,
  formatBackupBytes,
  formatBackupDate,
} from './BackupsPage.logic';

export const BackupPanel = ProjectPanel;
export const BackupInset = ProjectInset;

export type RestoreFlowState = {
  error: string | null;
  phase: 'details' | 'plan_error' | 'planning' | 'confirm';
  plan: RestorePlan | null;
  point: RestorePoint;
  targetAppId: string | null;
};

export function ProtectionPanel({ latestRestore, report }: { latestRestore: RestorePoint | null; report: BackupReport | null }) {
  const timeZone = report?.settings.timeZone || 'UTC';
  const protectedPercent = report?.totalApps ? Math.round((report.protectedApps / report.totalApps) * 100) : 0;
  return (
    <BackupInset className="bg-slate-900 shadow-none">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-white">{report?.settings.automaticBackupsEnabled ? 'Routine backups on' : 'Routine backups off'}</p>
          <p className="mt-1 text-xs text-slate-400">{report?.settings.nextRunLabel || 'Schedule unavailable'}</p>
        </div>
        <span className={cn('grid size-11 place-items-center rounded-lg border', report?.settings.automaticBackupsEnabled ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-200' : 'border-orange-400/45 bg-orange-500/10 text-orange-200')}>
          <ShieldCheck className="size-5" />
        </span>
      </div>
      <div className="mt-5">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Protected by restore point</span>
          <span>{report?.protectedApps ?? 0}/{report?.totalApps ?? 0}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-400" style={{ width: `${protectedPercent}%` }} />
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <MiniStat icon={Archive} label="Restore points" value={`${report?.recentRestorePoints.length ?? 0}`} />
        <MiniStat icon={Clock3} label="Latest" value={latestRestore ? formatBackupDate(latestRestore.createdAt, timeZone) : 'None'} />
      </div>
    </BackupInset>
  );
}

export function RoutineHealthPanel({ report, showAdvancedMetrics }: { report: BackupReport; showAdvancedMetrics: boolean }) {
  const tone = backupSchedulerTone(report.settings.schedulerHealth);
  const timeZone = report.settings.timeZone || 'UTC';
  return (
    <BackupPanel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeader icon={TimerReset} title="Protection rhythm" description="Last good checkpoint, next scheduled run, and current scheduler status." />
        <Badge className={cn('border', tone)}>{backupSchedulerLabel(report.settings.schedulerHealth)}</Badge>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <FactRow label="Last successful backup" value={report.settings.lastSuccessfulRoutineRun ? formatBackupDate(report.settings.lastSuccessfulRoutineRun.createdAt) : 'None yet'} />
        <FactRow label="Next scheduled backup" value={report.settings.nextRoutineRun ? formatBackupDate(report.settings.nextRoutineRun, timeZone) : 'Not scheduled'} />
        <FactRow label="Protected by restore point" value={`${report.protectedApps}/${report.totalApps}`} />
      </div>
      <BackupInset className="mt-4 text-sm leading-6 text-slate-300">{report.settings.schedulerMessage}</BackupInset>
      {showAdvancedMetrics && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <FactRow label="Last routine run" value={report.settings.lastRoutineRun ? `${backupStatusLabel(report.settings.lastRoutineRun.status)} · ${formatBackupDate(report.settings.lastRoutineRun.createdAt)}` : 'No routine run yet'} />
          <FactRow label="Last verified" value={report.settings.lastSuccessfulVerification ? formatBackupDate(report.settings.lastSuccessfulVerification.verifiedAt || report.settings.lastSuccessfulVerification.createdAt) : 'None yet'} />
        </div>
      )}
    </BackupPanel>
  );
}

export function ActionCard({ busy, description, disabled = false, disabledReason = 'This action is unavailable for the current backup state.', icon: Icon, label, onClick, title, tone }: { busy: boolean; description: string; disabled?: boolean; disabledReason?: string; icon: LucideIcon; label: string; onClick: () => void; title: string; tone: 'cyan' | 'sky' | 'emerald' }) {
  const tones = {
    cyan: 'border-cyan-300/35 bg-cyan-400/10 text-cyan-100',
    sky: 'border-sky-400/30 bg-sky-500/10 text-sky-100',
    emerald: 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100',
  };
  const isDisabled = busy || disabled;
  return (
    <DisabledAction className="w-full" disabled={isDisabled} reason={busy ? 'Wait for the current backup job to finish.' : disabledReason}>
      <button className={cn('group w-full rounded-lg border p-4 text-left transition hover:-translate-y-0.5 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50', tones[tone])} disabled={isDisabled} onClick={onClick} type="button">
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-11 place-items-center rounded-lg border border-sky-400/25 bg-slate-900 text-white">
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" />}
          </span>
          <Badge className="border-sky-400/20 bg-slate-900 text-current">{label}</Badge>
        </div>
        <p className="mt-4 font-black text-white">{title}</p>
        <p className="mt-2 text-sm leading-6 text-current/75">{description}</p>
      </button>
    </DisabledAction>
  );
}

export function RoutineTimeline({ apps, latestRestore, nextRun, onDetails, onRestore, onVerify, points, restoreAvailability, running, timeZone, verifyAvailability }: { apps: AppBackupStatus[]; latestRestore: RestorePoint | null; nextRun: string | null; onDetails: (point: RestorePoint) => void; onRestore: (point: RestorePoint, appId?: string | null) => void; onVerify: (point: RestorePoint) => void; points: RestorePoint[]; restoreAvailability: BackupOperationAvailability; running: string | null; timeZone: string; verifyAvailability: BackupOperationAvailability }) {
  if (!points.length) {
    return <EmptyState title="No restore points yet" description="Run a routine backup after installing an app to create the first restore point." />;
  }
  return (
    <BackupInset className="overflow-hidden p-4">
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <TimelineSummary icon={CheckCircle2} label="Last successful backup" value={latestRestore ? formatBackupDate(latestRestore.createdAt, timeZone) : 'None yet'} />
        <TimelineSummary icon={CalendarClock} label="Next scheduled backup" value={nextRun ? formatBackupDate(nextRun, timeZone) : 'Not scheduled'} />
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {points.map((point, index) => (
          <TimelinePoint apps={apps} first={index === 0} key={point.id} onDetails={onDetails} onRestore={onRestore} onVerify={onVerify} point={point} restoreAvailability={restoreAvailability} running={running === `verify-${point.id}`} timeZone={timeZone} verifyAvailability={verifyAvailability} />
        ))}
      </div>
    </BackupInset>
  );
}

export function RestoreList({ apps, appRestorePoints, fullRestorePoints, onDetails, onRestore, onVerify, restoreAvailability, running, timeZone, verifyAvailability }: { apps: AppBackupStatus[]; appRestorePoints: RestorePoint[]; fullRestorePoints: RestorePoint[]; onDetails: (point: RestorePoint) => void; onRestore: (point: RestorePoint, appId?: string | null) => void; onVerify: (point: RestorePoint) => void; restoreAvailability: BackupOperationAvailability; running: string | null; timeZone: string; verifyAvailability: BackupOperationAvailability }) {
  const allPoints = [...fullRestorePoints, ...appRestorePoints].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  if (!allPoints.length) {
    return <EmptyState title="No restore points yet" description="Run a routine or manual backup to create the first restore point." />;
  }
  return (
    <div className="grid gap-3">
      {allPoints.map((point) => <RestorePointRow apps={apps} key={point.id} onDetails={onDetails} onRestore={onRestore} onVerify={onVerify} point={point} restoreAvailability={restoreAvailability} running={running === `verify-${point.id}`} timeZone={timeZone} verifyAvailability={verifyAvailability} />)}
    </div>
  );
}

export function AppBackupCard({ app, onRun, operationAvailability, running, showAdvancedMetrics, timeZone }: { app: AppBackupStatus; onRun: (app: AppBackupStatus) => void; operationAvailability: BackupOperationAvailability; running: boolean; showAdvancedMetrics: boolean; timeZone: string }) {
  return (
    <BackupInset className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-white">{app.appName}</p>
            <Badge className={cn('border', backupAppBadgeTone(app.status))}>{backupStatusLabel(app.status)}</Badge>
            {app.backupContract.reviewRequired && <Badge className="border-orange-400/45 bg-orange-500/10 text-orange-200">Review</Badge>}
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">{app.message}</p>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-slate-700 bg-slate-950/60 text-slate-400">
          <AppWindow className="size-4" />
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Metric label="Data" value={formatBackupBytes(app.dataSizeBytes)} />
        <Metric label="Latest" value={app.latestBackup ? formatBackupDate(app.latestBackup.createdAt, timeZone) : 'None'} />
      </div>
      {showAdvancedMetrics && (
        <BackupInset className="mt-3 bg-slate-900 p-3">
          <p className="text-xs font-bold uppercase text-slate-500">Backup contract</p>
          <p className="mt-1 text-sm font-semibold text-slate-200">{app.backupContract.label}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{app.backupContract.summary}</p>
        </BackupInset>
      )}
      <DisabledAction className="mt-4 w-full" disabled={operationAvailability.disabled || app.status === 'unprotected'} reason={operationAvailability.disabled ? operationAvailability.reason : 'Turn backups on for this app before creating a restore point.'}>
        <ProjectDarkControlButton className="mt-4 w-full" disabled={operationAvailability.disabled || app.status === 'unprotected'} onClick={() => onRun(app)} size="sm" type="button">
          {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          {running ? 'Running' : 'Back up app'}
        </ProjectDarkControlButton>
      </DisabledAction>
    </BackupInset>
  );
}

export function RestoreFlowDialog({
  appOptions,
  flow,
  loading,
  onClose,
  onRestore,
  onRetryPlan,
  onTargetChange,
  onVerify,
  restoreAvailability,
  running,
  showAdvancedMetrics,
  timeZone,
  verifyAvailability,
}: {
  appOptions: AppBackupStatus[];
  flow: RestoreFlowState | null;
  loading: boolean;
  onClose: () => void;
  onRestore: () => void;
  onRetryPlan: () => void;
  onTargetChange: (appId: string | null) => void;
  onVerify: (point: RestorePoint) => void;
  restoreAvailability: BackupOperationAvailability;
  running: string | null;
  showAdvancedMetrics: boolean;
  timeZone: string;
  verifyAvailability: BackupOperationAvailability;
}) {
  const point = flow?.point ?? null;
  const plan = flow?.plan ?? null;
  const details = point ? restorePointDetails(point, appOptions, plan) : null;
  const included = point?.includedAppIds.split(',').map((id) => id.trim()).filter(Boolean) ?? [];
  const selectableApps = point?.scope === 'full'
    ? appOptions.filter((app) => included.includes(app.appId))
    : appOptions.filter((app) => app.appId === point?.appId);
  const reviewingDetails = flow?.phase === 'details';
  const planLoading = flow?.phase === 'planning';
  const planFailed = flow?.phase === 'plan_error';

  return (
    <Dialog open={Boolean(flow)} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto border-sky-400/30 bg-slate-900 text-slate-100 sm:w-full">
        <DialogHeader>
          <DialogTitle>{reviewingDetails ? details?.title || 'Restore point details' : plan?.title || 'Restore backup'}</DialogTitle>
          <DialogDescription className="text-slate-400">
            {reviewingDetails
              ? 'Review what this backup contains before verifying or restoring it.'
              : planLoading
                ? 'Autark-OS is checking the restore plan before it can be confirmed.'
                : planFailed
                  ? 'Autark-OS could not load a complete restore plan. Retry before restoring.'
                  : plan?.summary || 'Review what Autark-OS will restore before continuing.'}
          </DialogDescription>
        </DialogHeader>

        {reviewingDetails && point && details && (
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <FactRow label="Created" value={formatBackupDate(point.createdAt, timeZone)} />
              <FactRow label="Size" value={formatBackupBytes(point.sizeBytes)} />
              <FactRow label="Source" value={point.source} />
            </div>
            <InfoBlock title="Included apps" values={details.includedApps.length ? details.includedApps : ['No matching installed apps were found for this restore point.']} />
            <InfoBlock title="Verification" values={[details.verification, point.verificationMessage || 'No verification note recorded.', `Checksum: ${details.checksum}`]} />
            <InfoBlock tone="warning" title="Warnings" values={details.warnings} />
            <InfoBlock title="Stored at" values={[details.location]} />
            {flow.error && <RestoreIssue message={flow.error} onRetry={onRetryPlan} title="Restore plan unavailable" />}
            {flow.plan && <InfoBlock title="Restore preview" values={[details.restoreSummary]} />}
          </div>
        )}

        {planLoading && (
          <div className="grid place-items-center gap-3 rounded-lg border border-sky-400/25 bg-slate-950/60 p-6 text-center">
            <Loader2 className="size-5 animate-spin text-cyan-200" />
            <p className="text-sm text-slate-300">Loading the restore plan…</p>
          </div>
        )}

        {planFailed && <RestoreIssue message={flow?.error || 'Restore plan could not be loaded.'} onRetry={onRetryPlan} title="Restore plan unavailable" />}

        {flow?.phase === 'confirm' && point && (
          <div className="grid gap-4">
            {point.scope === 'full' && (
              <BackupInset>
                <label className="text-xs font-bold uppercase text-slate-500" htmlFor="restore-target">Restore target</label>
                <Select onValueChange={(value) => onTargetChange(value === 'all' ? null : value)} value={flow.targetAppId || 'all'}>
                  <SelectTrigger className="mt-2 h-10 w-full border-slate-700 bg-slate-950/70 text-slate-100" id="restore-target">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-slate-700 bg-slate-950 text-slate-100">
                    <SelectGroup>
                      <SelectItem className="focus:bg-slate-800 focus:text-white" value="all">Everything in this full backup</SelectItem>
                      {selectableApps.map((app) => (
                        <SelectItem className="focus:bg-slate-800 focus:text-white" key={app.appId} value={app.appId}>{app.appName} only</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </BackupInset>
            )}
            {plan && (
              <>
                <InfoBlock title="Autark-OS will restore" values={plan.affectedApps.length ? plan.affectedApps : ['No installed app matches this restore point.']} />
                <InfoBlock title="What will change" values={plan.steps.length ? plan.steps : ['Autark-OS will stop affected apps, replace their data with this restore point, then start them again.']} />
                <InfoBlock tone="warning" title="What is preserved" values={plan.warnings.length ? plan.warnings : ['A safety restore point is created before data is replaced. Other apps are left unchanged.']} />
                {flow.error && <RestoreIssue message={flow.error} onRetry={onRetryPlan} title="Restore could not start" />}
                {showAdvancedMetrics && (
                  <details className="rounded-lg border border-sky-400/20 bg-slate-950/60 p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-200">Technical restore details</summary>
                    <div className="mt-3 grid gap-3">
                      <InfoBlock title="Archive verification" values={[`${plan.restoreConfidence}: ${plan.verificationMessage || 'No verification details recorded yet.'}`]} />
                      <InfoBlock tone={plan.simulation.status === 'failed' || plan.simulation.status === 'warning' ? 'warning' : 'default'} title="Restore simulation" values={[plan.simulation.message, ...plan.simulation.details]} />
                      <InfoBlock title="Backup contract check" values={plan.dryRunDetails.length ? plan.dryRunDetails : ['No app-specific backup contract details were found.']} />
                    </div>
                  </details>
                )}
              </>
            )}
          </div>
        )}
        <DialogFooter>
          <ProjectDarkControlButton onClick={onClose} type="button">{reviewingDetails ? 'Close' : 'Cancel'}</ProjectDarkControlButton>
          {reviewingDetails && point && (
            <>
              <DisabledAction disabled={verifyAvailability.disabled} reason={verifyAvailability.reason}>
                <ProjectDarkControlButton disabled={verifyAvailability.disabled} onClick={() => onVerify(point)} type="button">
                  {running === `verify-${point.id}` ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                  Verify
                </ProjectDarkControlButton>
              </DisabledAction>
              <DisabledAction disabled={restoreAvailability.disabled} reason={restoreAvailability.reason}>
                <ProjectPrimaryButton disabled={restoreAvailability.disabled} onClick={() => onTargetChange(null)} type="button">
                  <RotateCcw className="size-4" />
                  Restore
                </ProjectPrimaryButton>
              </DisabledAction>
            </>
          )}
          {flow?.phase === 'confirm' && (
            <DisabledAction disabled={restoreAvailability.disabled || !plan?.executable || loading} reason={restoreAvailability.disabled ? restoreAvailability.reason : loading ? 'Wait for the restore job to start.' : 'This restore point cannot be restored until the complete restore plan is executable.'}>
              <ProjectPrimaryButton disabled={restoreAvailability.disabled || !plan?.executable || loading} onClick={onRestore} type="button">
                {loading ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                Restore now
              </ProjectPrimaryButton>
            </DisabledAction>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RestoreIssue({ message, onRetry, title }: { message: string; onRetry: () => void; title: string }) {
  return (
    <div className="rounded-lg border border-red-400/45 bg-red-500/10 p-4 text-sm text-red-100" role="alert">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 leading-5 text-red-100/80">{message}</p>
      <ProjectDarkControlButton className="mt-3" onClick={onRetry} size="sm" type="button">Retry plan</ProjectDarkControlButton>
    </div>
  );
}

export function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <BackupInset>
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm text-slate-200">{value}</p>
    </BackupInset>
  );
}

export function SectionHeader({ compact = false, description, icon: Icon, title }: { compact?: boolean; description?: string; icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className={cn('grid place-items-center rounded-lg border border-sky-400/25 bg-slate-800 text-cyan-200', compact ? 'size-9' : 'size-10')}>
        <Icon className="size-4" />
      </span>
      <div>
        <h2 className={cn('font-black text-white', compact ? 'text-lg' : 'text-xl')}>{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
      </div>
    </div>
  );
}

export function AttentionCard({ app }: { app: AppBackupStatus }) {
  return (
    <div className="rounded-lg border border-orange-400/45 bg-orange-500/10 p-4 text-orange-200">
      <p className="font-bold text-white">{app.appName}</p>
      <p className="mt-1 text-sm text-orange-100/80">{app.message}</p>
    </div>
  );
}

function TimelinePoint({ apps, first, onDetails, onRestore, onVerify, point, restoreAvailability, running, timeZone, verifyAvailability }: { apps: AppBackupStatus[]; first: boolean; onDetails: (point: RestorePoint) => void; onRestore: (point: RestorePoint, appId?: string | null) => void; onVerify: (point: RestorePoint) => void; point: RestorePoint; restoreAvailability: BackupOperationAvailability; running: boolean; timeZone: string; verifyAvailability: BackupOperationAvailability }) {
  const included = point.includedAppIds.split(',').map((id) => id.trim()).filter(Boolean);
  const eligibleApps = apps.filter((app) => included.includes(app.appId));
  return (
    <div className="relative min-w-[260px]">
      {!first && <span className="absolute left-[-1rem] top-7 h-px w-4 bg-cyan-300/40" />}
      <div className="rounded-lg border border-sky-400/30 bg-slate-900 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="grid size-12 place-items-center rounded-lg border border-cyan-300/40 bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-500/20">
            <Archive className="size-5" />
          </span>
          <Badge className="border-sky-300/20 bg-sky-500/10 text-sky-100">Routine</Badge>
        </div>
        <p className="mt-4 text-lg font-black text-white">{formatBackupDate(point.createdAt, timeZone)}</p>
        <p className="mt-1 text-xs text-slate-500">{formatBackupBytes(point.sizeBytes)} stored</p>
        <VerificationBadge point={point} />
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          <Sparkles className="size-3.5 text-cyan-200" />
          {eligibleApps.length} app{eligibleApps.length === 1 ? '' : 's'} included
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <ProjectDarkControlButton onClick={() => onDetails(point)} size="sm" type="button">
            <Info className="size-3.5" />
            Details
          </ProjectDarkControlButton>
          <DisabledAction disabled={restoreAvailability.disabled} reason={restoreAvailability.reason}>
            <ProjectPrimaryButton disabled={restoreAvailability.disabled} onClick={() => onRestore(point, null)} size="sm" type="button">
              Restore all
            </ProjectPrimaryButton>
          </DisabledAction>
          <DisabledAction disabled={restoreAvailability.disabled || !eligibleApps.length} reason={restoreAvailability.disabled ? restoreAvailability.reason : 'No currently installed app matches this restore point.'}>
            <ProjectDarkControlButton disabled={restoreAvailability.disabled || !eligibleApps.length} onClick={() => onRestore(point, eligibleApps[0]?.appId || null)} size="sm" type="button">
              One app
            </ProjectDarkControlButton>
          </DisabledAction>
          <DisabledAction disabled={verifyAvailability.disabled} reason={verifyAvailability.reason}>
            <ProjectDarkControlButton disabled={verifyAvailability.disabled} onClick={() => onVerify(point)} size="sm" type="button">
              {running ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
              Verify
            </ProjectDarkControlButton>
          </DisabledAction>
        </div>
      </div>
    </div>
  );
}

function RestorePointRow({ apps, onDetails, onRestore, onVerify, point, restoreAvailability, running, timeZone, verifyAvailability }: { apps: AppBackupStatus[]; onDetails: (point: RestorePoint) => void; onRestore: (point: RestorePoint, appId?: string | null) => void; onVerify: (point: RestorePoint) => void; point: RestorePoint; restoreAvailability: BackupOperationAvailability; running: boolean; timeZone: string; verifyAvailability: BackupOperationAvailability }) {
  const included = point.includedAppIds.split(',').map((id) => id.trim()).filter(Boolean);
  const eligibleApps = point.scope === 'full' ? apps.filter((app) => included.includes(app.appId)) : apps.filter((app) => app.appId === point.appId);
  return (
    <BackupInset className="grid gap-3 p-4 xl:grid-cols-[minmax(0,1fr)_120px_130px_auto] xl:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-bold text-white">{point.scope === 'full' ? 'Full backup' : point.appName}</p>
          <Badge className={cn('border', point.source === 'automatic' ? 'border-sky-300/20 bg-sky-500/10 text-sky-100' : 'border-cyan-300/35 bg-cyan-400/10 text-cyan-100')}>{point.source}</Badge>
          <Badge className="border-slate-700 bg-slate-950 text-slate-300">{point.scope}</Badge>
          <VerificationBadge point={point} />
        </div>
        <p className="mt-1 text-xs text-slate-500">{point.message}</p>
      </div>
      <Metric label="Size" value={formatBackupBytes(point.sizeBytes)} />
      <Metric label="Created" value={formatBackupDate(point.createdAt, timeZone)} />
      <div className="flex flex-wrap gap-2 xl:justify-end">
        <ProjectDarkControlButton onClick={() => onDetails(point)} size="sm" type="button">
          <Info className="size-3.5" />
          Details
        </ProjectDarkControlButton>
        {point.scope === 'full' && (
          <DisabledAction disabled={restoreAvailability.disabled} reason={restoreAvailability.reason}>
            <ProjectDarkControlButton disabled={restoreAvailability.disabled} onClick={() => onRestore(point, null)} size="sm" type="button">
              Restore all
            </ProjectDarkControlButton>
          </DisabledAction>
        )}
        <DisabledAction disabled={restoreAvailability.disabled || !eligibleApps.length} reason={restoreAvailability.disabled ? restoreAvailability.reason : 'No currently installed app matches this restore point.'}>
          <ProjectDarkControlButton disabled={restoreAvailability.disabled || !eligibleApps.length} onClick={() => onRestore(point, eligibleApps[0]?.appId || null)} size="sm" type="button">
            Restore app
          </ProjectDarkControlButton>
        </DisabledAction>
        <DisabledAction disabled={verifyAvailability.disabled} reason={verifyAvailability.reason}>
          <ProjectDarkControlButton disabled={verifyAvailability.disabled} onClick={() => onVerify(point)} size="sm" type="button">
            {running ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
            Verify
          </ProjectDarkControlButton>
        </DisabledAction>
      </div>
    </BackupInset>
  );
}

function VerificationBadge({ point }: { point: RestorePoint }) {
  const status = point.verificationStatus || 'not_checked';
  const tone = status === 'verified'
    ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100'
    : status === 'failed'
      ? 'border-red-400/40 bg-red-500/10 text-red-200'
      : 'border-orange-400/45 bg-orange-500/10 text-orange-200';
  const label = status === 'verified' ? `Verified · ${capitalizeBackupLabel(point.restoreConfidence || 'unknown')}` : status === 'failed' ? 'Verification failed' : 'Not verified';
  return <Badge className={tone}>{label}</Badge>;
}

function MiniStat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <BackupInset>
      <Icon className="size-4 text-slate-500" />
      <p className="mt-2 text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-200">{value}</p>
    </BackupInset>
  );
}

function TimelineSummary({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-sky-400/25 bg-slate-900 p-3">
      <span className="grid size-9 place-items-center rounded-lg border border-cyan-300/35 bg-cyan-400/10 text-cyan-100">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-bold uppercase text-slate-500">{label}</span>
        <span className="mt-1 block truncate text-sm font-semibold text-white">{value}</span>
      </span>
    </div>
  );
}

function InfoBlock({ title, tone = 'default', values }: { title: string; tone?: 'default' | 'warning'; values: string[] }) {
  return (
    <div className={cn('rounded-lg border p-3', tone === 'warning' ? 'border-orange-400/45 bg-orange-500/10 text-orange-200' : 'border-sky-400/25 bg-slate-800 text-slate-300')}>
      <p className="text-sm font-bold text-white">{title}</p>
      <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm">
        {values.map((value) => <li key={value}>{value}</li>)}
      </ul>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-200">{value}</p>
    </div>
  );
}
