import { AlertTriangle, AppWindow, Archive, CalendarClock, CheckCircle2, Clock3, Info, Layers3, Loader2, Play, RotateCcw, ShieldCheck, Sparkles, TimerReset } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SurfaceInset, SurfacePanel } from '@/components/project-os/ProjectOSComponents';
import { cn } from '@/lib/utils';
import type { AppBackupStatus, BackupReport, RestorePlan, RestorePoint } from '@/types/backup';
import { restorePointDetails } from './BackupsPage.restoreDetails';
import {
  backupAppBadgeTone,
  backupSchedulerLabel,
  backupSchedulerTone,
  backupStatusLabel,
  capitalizeBackupLabel,
  formatBackupBytes,
  formatBackupDate,
} from './BackupsPage.logic';

export function ProtectionPanel({ latestRestore, report }: { latestRestore: RestorePoint | null; report: BackupReport | null }) {
  const protectedPercent = report?.totalApps ? Math.round((report.protectedApps / report.totalApps) * 100) : 0;
  return (
    <SurfacePanel className="bg-slate-950/55 shadow-none">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-white">{report?.settings.automaticBackupsEnabled ? 'Routine protection on' : 'Routine protection off'}</p>
          <p className="mt-1 text-xs text-slate-400">{report?.settings.nextRunLabel || 'Schedule unavailable'}</p>
        </div>
        <span className={cn('grid size-11 place-items-center rounded-lg border', report?.settings.automaticBackupsEnabled ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-200' : 'border-amber-300/20 bg-amber-500/10 text-amber-100')}>
          <ShieldCheck className="size-5" />
        </span>
      </div>
      <div className="mt-5">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Protected apps</span>
          <span>{report?.protectedApps ?? 0}/{report?.totalApps ?? 0}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-400" style={{ width: `${protectedPercent}%` }} />
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <MiniStat icon={Archive} label="Restore points" value={`${report?.recentRestorePoints.length ?? 0}`} />
        <MiniStat icon={Clock3} label="Latest" value={latestRestore ? formatBackupDate(latestRestore.createdAt) : 'None'} />
      </div>
    </SurfacePanel>
  );
}

export function RoutineHealthPanel({ report, showAdvancedMetrics }: { report: BackupReport; showAdvancedMetrics: boolean }) {
  const tone = backupSchedulerTone(report.settings.schedulerHealth);
  return (
    <SurfacePanel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeader icon={TimerReset} title="Protection rhythm" description="Last good checkpoint, next scheduled run, and current scheduler status." />
        <Badge className={cn('border', tone)}>{backupSchedulerLabel(report.settings.schedulerHealth)}</Badge>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <FactRow label="Last successful backup" value={report.settings.lastSuccessfulRoutineRun ? formatBackupDate(report.settings.lastSuccessfulRoutineRun.createdAt) : 'None yet'} />
        <FactRow label="Next scheduled backup" value={report.settings.nextRoutineRun ? formatBackupDate(report.settings.nextRoutineRun) : 'Not scheduled'} />
        <FactRow label="Protected apps" value={`${report.protectedApps}/${report.totalApps}`} />
      </div>
      <SurfaceInset className="mt-4 text-sm leading-6 text-slate-300">{report.settings.schedulerMessage}</SurfaceInset>
      {showAdvancedMetrics && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <FactRow label="Last routine run" value={report.settings.lastRoutineRun ? `${backupStatusLabel(report.settings.lastRoutineRun.status)} · ${formatBackupDate(report.settings.lastRoutineRun.createdAt)}` : 'No routine run yet'} />
          <FactRow label="Last verified" value={report.settings.lastSuccessfulVerification ? formatBackupDate(report.settings.lastSuccessfulVerification.verifiedAt || report.settings.lastSuccessfulVerification.createdAt) : 'None yet'} />
        </div>
      )}
    </SurfacePanel>
  );
}

export function ActionCard({ busy, description, disabled = false, icon: Icon, label, onClick, title, tone }: { busy: boolean; description: string; disabled?: boolean; icon: LucideIcon; label: string; onClick: () => void; title: string; tone: 'violet' | 'sky' | 'emerald' }) {
  const tones = {
    violet: 'border-violet-300/20 bg-violet-500/10 text-violet-100',
    sky: 'border-sky-300/20 bg-sky-500/10 text-sky-100',
    emerald: 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100',
  };
  return (
    <button className={cn('group rounded-lg border p-4 text-left transition hover:-translate-y-0.5 hover:bg-slate-900/70 disabled:cursor-not-allowed disabled:opacity-50', tones[tone])} disabled={busy || disabled} onClick={onClick} type="button">
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-11 place-items-center rounded-lg border border-white/10 bg-slate-950/55 text-white">
          {busy ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" />}
        </span>
        <Badge className="border-white/10 bg-slate-950/60 text-current">{label}</Badge>
      </div>
      <p className="mt-4 font-black text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-current/75">{description}</p>
    </button>
  );
}

export function RoutineTimeline({ apps, latestRestore, nextRun, onDetails, onRestore, onVerify, points, running }: { apps: AppBackupStatus[]; latestRestore: RestorePoint | null; nextRun: string | null; onDetails: (point: RestorePoint) => void; onRestore: (point: RestorePoint, appId?: string | null) => void; onVerify: (point: RestorePoint) => void; points: RestorePoint[]; running: string | null }) {
  if (!points.length) {
    return <EmptyState title="No restore points yet" message="Run a routine backup after installing an app to create the first restore point." />;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/35 p-4">
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <TimelineSummary icon={CheckCircle2} label="Last successful backup" value={latestRestore ? formatBackupDate(latestRestore.createdAt) : 'None yet'} />
        <TimelineSummary icon={CalendarClock} label="Next scheduled backup" value={nextRun ? formatBackupDate(nextRun) : 'Not scheduled'} />
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {points.map((point, index) => (
          <TimelinePoint apps={apps} first={index === 0} key={point.id} onDetails={onDetails} onRestore={onRestore} onVerify={onVerify} point={point} running={running === `verify-${point.id}`} />
        ))}
      </div>
    </div>
  );
}

export function RestoreList({ apps, appRestorePoints, fullRestorePoints, onDetails, onRestore, onVerify, running }: { apps: AppBackupStatus[]; appRestorePoints: RestorePoint[]; fullRestorePoints: RestorePoint[]; onDetails: (point: RestorePoint) => void; onRestore: (point: RestorePoint, appId?: string | null) => void; onVerify: (point: RestorePoint) => void; running: string | null }) {
  const allPoints = [...fullRestorePoints, ...appRestorePoints].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  if (!allPoints.length) {
    return <EmptyState title="No restore points yet" message="Run a routine or manual backup to create the first restore point." />;
  }
  return (
    <div className="grid gap-3">
      {allPoints.map((point) => <RestorePointRow apps={apps} key={point.id} onDetails={onDetails} onRestore={onRestore} onVerify={onVerify} point={point} running={running === `verify-${point.id}`} />)}
    </div>
  );
}

export function AppBackupCard({ app, onRun, running, showAdvancedMetrics }: { app: AppBackupStatus; onRun: (app: AppBackupStatus) => void; running: boolean; showAdvancedMetrics: boolean }) {
  return (
    <SurfaceInset className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-white">{app.appName}</p>
            <Badge className={cn('border', backupAppBadgeTone(app.status))}>{backupStatusLabel(app.status)}</Badge>
            {app.backupContract.reviewRequired && <Badge className="border-amber-300/20 bg-amber-500/10 text-amber-100">Review</Badge>}
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">{app.message}</p>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-slate-700 bg-slate-950/60 text-slate-400">
          <AppWindow className="size-4" />
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Metric label="Data" value={formatBackupBytes(app.dataSizeBytes)} />
        <Metric label="Latest" value={app.latestBackup ? formatBackupDate(app.latestBackup.createdAt) : 'None'} />
      </div>
      {showAdvancedMetrics && (
        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/45 p-3">
          <p className="text-xs font-bold uppercase text-slate-500">Backup contract</p>
          <p className="mt-1 text-sm font-semibold text-slate-200">{app.backupContract.label}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{app.backupContract.summary}</p>
        </div>
      )}
      <Button className="mt-4 w-full border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" disabled={running || app.status === 'unprotected'} onClick={() => onRun(app)} size="sm" type="button" variant="outline">
        {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
        {running ? 'Running' : 'Back up app'}
      </Button>
    </SurfaceInset>
  );
}

export function RestorePointDetailsDialog({ apps, onClose, onRestore, onVerify, plan, point, running }: { apps: AppBackupStatus[]; onClose: () => void; onRestore: (point: RestorePoint) => void; onVerify: (point: RestorePoint) => void; plan: RestorePlan | null; point: RestorePoint | null; running: string | null }) {
  const open = Boolean(point);
  const details = point ? restorePointDetails(point, apps, plan) : null;
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-2xl border-white/10 bg-slate-950 text-slate-100">
        <DialogHeader>
          <DialogTitle>{details?.title || 'Restore point details'}</DialogTitle>
          <DialogDescription className="text-slate-400">Review what this backup contains before verifying or restoring it.</DialogDescription>
        </DialogHeader>
        {point && details && (
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <FactRow label="Created" value={formatBackupDate(point.createdAt)} />
              <FactRow label="Size" value={formatBackupBytes(point.sizeBytes)} />
              <FactRow label="Source" value={point.source} />
            </div>
            <InfoBlock title="Included apps" values={details.includedApps.length ? details.includedApps : ['No matching installed apps were found for this restore point.']} />
            <InfoBlock title="Verification" values={[details.verification, point.verificationMessage || 'No verification note recorded.', `Checksum: ${details.checksum}`]} />
            <InfoBlock title="Restore preview" values={[details.restoreSummary]} />
            <InfoBlock tone="warning" title="Warnings" values={details.warnings} />
            <InfoBlock title="Stored at" values={[details.location]} />
          </div>
        )}
        <DialogFooter>
          <Button className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" onClick={onClose} type="button" variant="outline">Close</Button>
          {point && (
            <>
              <Button className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" disabled={running === `verify-${point.id}`} onClick={() => onVerify(point)} type="button" variant="outline">
                {running === `verify-${point.id}` ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                Verify
              </Button>
              <Button className="bg-violet-600 text-white hover:bg-violet-500" onClick={() => onRestore(point)} type="button">
                <RotateCcw className="size-4" />
                Restore
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RestoreDialog({ appOptions, loading, onClose, onRestore, onTargetChange, plan, point, showAdvancedMetrics, targetAppId }: { appOptions: AppBackupStatus[]; loading: boolean; onClose: () => void; onRestore: () => void; onTargetChange: (appId: string | null) => void; plan: RestorePlan | null; point: RestorePoint | null; showAdvancedMetrics: boolean; targetAppId: string | null }) {
  const open = Boolean(point);
  const included = point?.includedAppIds.split(',').map((id) => id.trim()).filter(Boolean) ?? [];
  const selectableApps = point?.scope === 'full' ? appOptions.filter((app) => included.includes(app.appId)) : appOptions.filter((app) => app.appId === point?.appId);
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-2xl border-white/10 bg-slate-950 text-slate-100">
        <DialogHeader>
          <DialogTitle>{plan?.title || 'Restore backup'}</DialogTitle>
          <DialogDescription className="text-slate-400">{plan?.summary || 'Review what Project OS will restore before continuing.'}</DialogDescription>
        </DialogHeader>
        {point?.scope === 'full' && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/45 p-3">
            <label className="text-xs font-bold uppercase text-slate-500" htmlFor="restore-target">Restore target</label>
            <select className="mt-2 h-10 w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 text-sm text-slate-100" id="restore-target" onChange={(event) => onTargetChange(event.target.value || null)} value={targetAppId || ''}>
              <option value="">Everything in this full backup</option>
              {selectableApps.map((app) => <option key={app.appId} value={app.appId}>{app.appName} only</option>)}
            </select>
          </div>
        )}
        {plan && (
          <div className="grid gap-4">
            <InfoBlock title="Affected apps" values={plan.affectedApps.length ? plan.affectedApps : ['No installed app matches this restore point.']} />
            {plan.warnings.length > 0 && <InfoBlock tone="warning" title="Important warnings" values={plan.warnings} />}
            {showAdvancedMetrics && (
              <>
                <InfoBlock title="Archive verification" values={[`${plan.restoreConfidence}: ${plan.verificationMessage || 'No verification details recorded yet.'}`]} />
                <InfoBlock tone={plan.simulation.status === 'failed' || plan.simulation.status === 'warning' ? 'warning' : 'default'} title="Restore simulation" values={[plan.simulation.message, ...plan.simulation.details]} />
                <InfoBlock title="Steps Project OS will take" values={plan.steps} />
                <InfoBlock title="Backup contract check" values={plan.dryRunDetails.length ? plan.dryRunDetails : ['No app-specific backup contract details were found.']} />
              </>
            )}
          </div>
        )}
        <DialogFooter>
          <Button className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" onClick={onClose} type="button" variant="outline">Cancel</Button>
          <Button className="bg-violet-600 text-white hover:bg-violet-500" disabled={!plan?.executable || loading} onClick={onRestore} type="button">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
            Restore
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <SurfaceInset>
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm text-slate-200">{value}</p>
    </SurfaceInset>
  );
}

export function SectionHeader({ compact = false, description, icon: Icon, title }: { compact?: boolean; description?: string; icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className={cn('grid place-items-center rounded-lg border border-white/10 bg-slate-900 text-violet-300', compact ? 'size-9' : 'size-10')}>
        <Icon className="size-4" />
      </span>
      <div>
        <h2 className={cn('font-black text-white', compact ? 'text-lg' : 'text-xl')}>{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
      </div>
    </div>
  );
}

export function EmptyState({ compact = false, message, title }: { compact?: boolean; message: string; title: string }) {
  return (
    <div className={cn('rounded-lg border border-slate-800 bg-slate-900/40 text-center', compact ? 'p-4' : 'p-8')}>
      <p className="font-bold text-white">{title}</p>
      <p className="mt-1 text-sm text-slate-400">{message}</p>
    </div>
  );
}

export function AttentionCard({ app }: { app: AppBackupStatus }) {
  return (
    <div className="rounded-lg border border-amber-300/20 bg-amber-500/10 p-4 text-amber-100">
      <p className="font-bold text-white">{app.appName}</p>
      <p className="mt-1 text-sm text-amber-100/80">{app.message}</p>
    </div>
  );
}

function TimelinePoint({ apps, first, onDetails, onRestore, onVerify, point, running }: { apps: AppBackupStatus[]; first: boolean; onDetails: (point: RestorePoint) => void; onRestore: (point: RestorePoint, appId?: string | null) => void; onVerify: (point: RestorePoint) => void; point: RestorePoint; running: boolean }) {
  const included = point.includedAppIds.split(',').map((id) => id.trim()).filter(Boolean);
  const eligibleApps = apps.filter((app) => included.includes(app.appId));
  return (
    <div className="relative min-w-[260px]">
      {!first && <span className="absolute left-[-1rem] top-7 h-px w-4 bg-violet-400/40" />}
      <div className="rounded-lg border border-violet-300/20 bg-slate-950/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="grid size-12 place-items-center rounded-lg bg-gradient-to-br from-violet-600 to-sky-500 text-white shadow-po-brand-glow">
            <Archive className="size-5" />
          </span>
          <Badge className="border-sky-300/20 bg-sky-500/10 text-sky-100">Routine</Badge>
        </div>
        <p className="mt-4 text-lg font-black text-white">{formatBackupDate(point.createdAt)}</p>
        <p className="mt-1 text-xs text-slate-500">{formatBackupBytes(point.sizeBytes)} stored</p>
        <VerificationBadge point={point} />
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          <Sparkles className="size-3.5 text-violet-300" />
          {eligibleApps.length} app{eligibleApps.length === 1 ? '' : 's'} included
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" onClick={() => onDetails(point)} size="sm" type="button" variant="outline">
            <Info className="size-3.5" />
            Details
          </Button>
          <Button className="bg-violet-600 text-white hover:bg-violet-500" onClick={() => onRestore(point, null)} size="sm" type="button">
            Restore all
          </Button>
          <Button className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" disabled={!eligibleApps.length} onClick={() => onRestore(point, eligibleApps[0]?.appId || null)} size="sm" type="button" variant="outline">
            One app
          </Button>
          <Button className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" disabled={running} onClick={() => onVerify(point)} size="sm" type="button" variant="outline">
            {running ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
            Verify
          </Button>
        </div>
      </div>
    </div>
  );
}

function RestorePointRow({ apps, onDetails, onRestore, onVerify, point, running }: { apps: AppBackupStatus[]; onDetails: (point: RestorePoint) => void; onRestore: (point: RestorePoint, appId?: string | null) => void; onVerify: (point: RestorePoint) => void; point: RestorePoint; running: boolean }) {
  const included = point.includedAppIds.split(',').map((id) => id.trim()).filter(Boolean);
  const eligibleApps = point.scope === 'full' ? apps.filter((app) => included.includes(app.appId)) : apps.filter((app) => app.appId === point.appId);
  return (
    <SurfaceInset className="grid gap-3 p-4 xl:grid-cols-[minmax(0,1fr)_120px_130px_auto] xl:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-bold text-white">{point.scope === 'full' ? 'Full backup' : point.appName}</p>
          <Badge className={cn('border', point.source === 'automatic' ? 'border-sky-300/20 bg-sky-500/10 text-sky-100' : 'border-violet-300/20 bg-violet-500/10 text-violet-100')}>{point.source}</Badge>
          <Badge className="border-slate-700 bg-slate-950 text-slate-300">{point.scope}</Badge>
          <VerificationBadge point={point} />
        </div>
        <p className="mt-1 text-xs text-slate-500">{point.message}</p>
      </div>
      <Metric label="Size" value={formatBackupBytes(point.sizeBytes)} />
      <Metric label="Created" value={formatBackupDate(point.createdAt)} />
      <div className="flex flex-wrap gap-2 xl:justify-end">
        <Button className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" onClick={() => onDetails(point)} size="sm" type="button" variant="outline">
          <Info className="size-3.5" />
          Details
        </Button>
        {point.scope === 'full' && (
          <Button className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" onClick={() => onRestore(point, null)} size="sm" type="button" variant="outline">
            Restore all
          </Button>
        )}
        <Button className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" disabled={!eligibleApps.length} onClick={() => onRestore(point, eligibleApps[0]?.appId || null)} size="sm" type="button" variant="outline">
          Restore app
        </Button>
        <Button className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" disabled={running} onClick={() => onVerify(point)} size="sm" type="button" variant="outline">
          {running ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
          Verify
        </Button>
      </div>
    </SurfaceInset>
  );
}

function VerificationBadge({ point }: { point: RestorePoint }) {
  const status = point.verificationStatus || 'not_checked';
  const tone = status === 'verified'
    ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100'
    : status === 'failed'
      ? 'border-red-300/20 bg-red-500/10 text-red-100'
      : 'border-amber-300/20 bg-amber-500/10 text-amber-100';
  const label = status === 'verified' ? `Verified · ${capitalizeBackupLabel(point.restoreConfidence || 'unknown')}` : status === 'failed' ? 'Verification failed' : 'Not verified';
  return <Badge className={tone}>{label}</Badge>;
}

function MiniStat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <SurfaceInset>
      <Icon className="size-4 text-slate-500" />
      <p className="mt-2 text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-200">{value}</p>
    </SurfaceInset>
  );
}

function TimelineSummary({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-slate-950/60 p-3">
      <span className="grid size-9 place-items-center rounded-lg border border-violet-300/20 bg-violet-500/10 text-violet-200">
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
    <div className={cn('rounded-lg border p-3', tone === 'warning' ? 'border-amber-300/20 bg-amber-500/10 text-amber-100' : 'border-slate-800 bg-slate-900/45 text-slate-300')}>
      <p className="text-sm font-bold text-white">{title}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
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
