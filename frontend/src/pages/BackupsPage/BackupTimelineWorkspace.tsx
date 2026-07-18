import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  AppWindow,
  ArchiveRestore,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  DatabaseBackup,
  Layers3,
  Loader2,
  Play,
  RefreshCw,
  Settings2,
  ShieldCheck,
} from 'lucide-react';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { StatusBadge } from '@/components/autark-os/StatusBadge';
import { ProjectDarkControlButton, ProjectPrimaryButton } from '@/components/primitives/ProjectButtons';
import { Surface } from '@/components/primitives/Surface';
import { cn } from '@/lib/utils';
import type { AppBackupStatus, BackupReport, RestorePoint } from '@/types/backup';
import {
  type BackupOperationAvailability,
  backupAppBadgeTone,
  backupStatusLabel,
  formatBackupBytes,
  formatBackupDate,
} from './BackupsPage.logic';

type TimelineScope = 'all' | 'app' | 'full';

type BackupTimelineWorkspaceProps = {
  appBackupAvailability: BackupOperationAvailability;
  fullBackupAvailability: BackupOperationAvailability;
  onCreateAppBackup: (app: AppBackupStatus) => void;
  onCreateFullBackup: () => void;
  onOpenRestoreDetails: (point: RestorePoint) => void;
  onOpenRestorePlan: (point: RestorePoint) => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
  onRunRoutineBackup: () => void;
  onVerifyRestorePoint: (point: RestorePoint) => void;
  refreshing: boolean;
  report: BackupReport;
  restoreAvailability: BackupOperationAvailability;
  routineBackupAvailability: BackupOperationAvailability;
  running: string | null;
  verifyAvailability: BackupOperationAvailability;
};

export function BackupTimelineWorkspace({
  appBackupAvailability,
  fullBackupAvailability,
  onCreateAppBackup,
  onCreateFullBackup,
  onOpenRestoreDetails,
  onOpenRestorePlan,
  onOpenSettings,
  onRefresh,
  onRunRoutineBackup,
  onVerifyRestorePoint,
  refreshing,
  report,
  restoreAvailability,
  routineBackupAvailability,
  running,
  verifyAvailability,
}: BackupTimelineWorkspaceProps) {
  const [scope, setScope] = useState<TimelineScope>('all');
  const [selectedRestorePointId, setSelectedRestorePointId] = useState<number | null>(null);
  const appBackupsRef = useRef<HTMLDivElement>(null);
  const allRestorePoints = useMemo(
    () => report.recentRestorePoints
      .filter((point) => point.status === 'completed')
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
    [report.recentRestorePoints],
  );
  const visibleRestorePoints = useMemo(
    () => allRestorePoints.filter((point) => scope === 'all' || (scope === 'full' ? point.scope === 'full' : point.scope !== 'full')),
    [allRestorePoints, scope],
  );
  const selectedRestorePoint = visibleRestorePoints.find((point) => point.id === selectedRestorePointId) ?? visibleRestorePoints[0] ?? null;
  const needsAttention = report.apps.filter((app) => app.status !== 'protected');
  const automaticBackupsEnabled = report.settings.automaticBackupsEnabled;
  const runRoutineDisabled = routineBackupAvailability.disabled || !automaticBackupsEnabled;
  const runRoutineReason = routineBackupAvailability.disabled
    ? routineBackupAvailability.reason
    : 'Turn on routine backups in Settings first.';

  useEffect(() => {
    setSelectedRestorePointId((current) => visibleRestorePoints.some((point) => point.id === current) ? current : visibleRestorePoints[0]?.id ?? null);
  }, [visibleRestorePoints]);

  function focusAppBackups() {
    appBackupsRef.current?.focus();
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
      <BackupsHeader
        onOpenSettings={onOpenSettings}
        onRefresh={onRefresh}
        protectedApps={report.protectedApps}
        refreshing={refreshing}
        totalApps={report.totalApps}
        updatedAt={report.checkedAt}
      />

      <BackupActionStrip
        automaticBackupsEnabled={automaticBackupsEnabled}
        fullBackupAvailability={fullBackupAvailability}
        needsAttentionCount={needsAttention.length}
        nextRunLabel={report.settings.nextRunLabel || formatBackupDate(report.settings.nextRoutineRun, report.settings.timeZone)}
        onCreateFullBackup={onCreateFullBackup}
        onFocusAppBackups={focusAppBackups}
        onRunRoutineBackup={onRunRoutineBackup}
        routineDisabled={runRoutineDisabled}
        routineReason={runRoutineReason}
        running={running}
      />

      <section className="flex min-h-[14rem] flex-1 flex-col overflow-hidden rounded-2xl border border-sky-300/20 bg-slate-900 shadow-lg shadow-slate-950/20">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-300/15 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-white">Backup timeline</h2>
            <p className="mt-1 text-xs text-sky-100/60">Select a restore point to inspect it without leaving the history.</p>
          </div>
          <TimelineScopeTabs onChange={setScope} value={scope} />
        </div>

        {visibleRestorePoints.length ? (
          <TimelineCanvas
            onSelect={setSelectedRestorePointId}
            points={visibleRestorePoints}
            selectedRestorePointId={selectedRestorePoint?.id ?? null}
            timeZone={report.settings.timeZone}
          />
        ) : (
          <TimelineEmptyState scope={scope} />
        )}
      </section>

      {selectedRestorePoint && (
        <RestorePointInspector
          onOpenDetails={() => onOpenRestoreDetails(selectedRestorePoint)}
          onOpenRestorePlan={() => onOpenRestorePlan(selectedRestorePoint)}
          onVerify={() => onVerifyRestorePoint(selectedRestorePoint)}
          point={selectedRestorePoint}
          restoreAvailability={restoreAvailability}
          running={running}
          timeZone={report.settings.timeZone}
          verifyAvailability={verifyAvailability}
        />
      )}

      <AppBackupStrip
        appBackupAvailability={appBackupAvailability}
        apps={report.apps}
        focusRef={appBackupsRef}
        onCreateAppBackup={onCreateAppBackup}
        running={running}
        timeZone={report.settings.timeZone}
      />
    </div>
  );
}

function BackupsHeader({
  onOpenSettings,
  onRefresh,
  protectedApps,
  refreshing,
  totalApps,
  updatedAt,
}: {
  onOpenSettings: () => void;
  onRefresh: () => void;
  protectedApps: number;
  refreshing: boolean;
  totalApps: number;
  updatedAt: string | null;
}) {
  return (
    <Surface as="header" className="shrink-0 overflow-hidden border-sky-300/15 bg-[#07142b]/90 shadow-xl shadow-slate-950/20" tone="panel">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="hidden size-10 shrink-0 place-items-center rounded-xl border border-cyan-300/35 bg-cyan-400/10 text-cyan-200 sm:grid">
            <DatabaseBackup aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <h1 className="m-0 text-3xl font-semibold tracking-tight text-white sm:text-[2.1rem]">Backups</h1>
            <p className="m-0 text-sm text-sky-100/70">Recovery history and the next safe checkpoint.</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <HeaderMetric label="Protected" value={`${protectedApps}/${totalApps}`} />
          <HeaderMetric label="Last checked" value={formatUpdatedAt(updatedAt)} />
          <DisabledAction disabled={refreshing} reason="Backup status is already refreshing.">
            <button
              aria-label="Refresh backup status"
              className="grid size-10 place-items-center rounded-xl border border-sky-300/15 bg-slate-950/25 text-sky-100/70 transition hover:border-cyan-300/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={refreshing}
              onClick={onRefresh}
              type="button"
            >
              <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
            </button>
          </DisabledAction>
          <button
            aria-label="Backup settings"
            className="grid size-10 place-items-center rounded-xl border border-sky-300/15 bg-slate-950/25 text-sky-100/70 transition hover:border-cyan-300/30 hover:text-white"
            onClick={onOpenSettings}
            type="button"
          >
            <Settings2 className="size-4" />
          </button>
        </div>
      </div>
    </Surface>
  );
}

function HeaderMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-24 rounded-xl border border-sky-300/15 bg-slate-950/25 px-3 py-2 text-right">
      <p className="truncate text-sm font-semibold leading-none text-white">{value}</p>
      <p className="mt-1 text-[0.68rem] text-slate-400">{label}</p>
    </div>
  );
}

function BackupActionStrip({
  automaticBackupsEnabled,
  fullBackupAvailability,
  needsAttentionCount,
  nextRunLabel,
  onCreateFullBackup,
  onFocusAppBackups,
  onRunRoutineBackup,
  routineDisabled,
  routineReason,
  running,
}: {
  automaticBackupsEnabled: boolean;
  fullBackupAvailability: BackupOperationAvailability;
  needsAttentionCount: number;
  nextRunLabel: string;
  onCreateFullBackup: () => void;
  onFocusAppBackups: () => void;
  onRunRoutineBackup: () => void;
  routineDisabled: boolean;
  routineReason: string;
  running: string | null;
}) {
  return (
    <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-300/15 bg-slate-900/70 px-3 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-sky-100/70">
        <span className="flex items-center gap-2"><ShieldCheck className={cn('size-4', automaticBackupsEnabled ? 'text-emerald-300' : 'text-amber-300')} />{automaticBackupsEnabled ? `Routine backups on · ${nextRunLabel}` : 'Routine backups are off'}</span>
        {needsAttentionCount > 0 && <span className="flex items-center gap-1.5 text-amber-200"><CircleAlert className="size-3.5" />{needsAttentionCount} app{needsAttentionCount === 1 ? '' : 's'} need review</span>}
        <DisabledAction disabled={routineDisabled} reason={routineReason}>
          <button className="text-xs font-medium text-cyan-200 hover:text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={routineDisabled} onClick={onRunRoutineBackup} type="button">
            {running === 'routine' ? 'Running scheduled backup…' : 'Run scheduled backup now'}
          </button>
        </DisabledAction>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <DisabledAction disabled={fullBackupAvailability.disabled} reason={fullBackupAvailability.reason}>
          <ProjectPrimaryButton disabled={fullBackupAvailability.disabled} onClick={onCreateFullBackup} size="sm" type="button">
            {running === 'full' ? <Loader2 className="size-3.5 animate-spin" /> : <Layers3 className="size-3.5" />}
            {running === 'full' ? 'Backing up all' : 'Back up all'}
          </ProjectPrimaryButton>
        </DisabledAction>
        <ProjectDarkControlButton onClick={onFocusAppBackups} size="sm" type="button">
          <AppWindow className="size-3.5" />
          Back up an app
        </ProjectDarkControlButton>
      </div>
    </div>
  );
}

function TimelineScopeTabs({ onChange, value }: { onChange: (scope: TimelineScope) => void; value: TimelineScope }) {
  return (
    <div className="flex rounded-lg border border-sky-300/20 bg-slate-800 p-1" role="group" aria-label="Backup timeline scope">
      <TimelineScopeButton active={value === 'all'} label="All" onClick={() => onChange('all')} />
      <TimelineScopeButton active={value === 'full'} label="Full" onClick={() => onChange('full')} />
      <TimelineScopeButton active={value === 'app'} label="Apps" onClick={() => onChange('app')} />
    </div>
  );
}

function TimelineScopeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button aria-pressed={active} className={cn('rounded-md px-2.5 py-1 text-xs text-sky-100/65 transition hover:text-white', active && 'bg-cyan-300 text-slate-950 hover:text-slate-950')} onClick={onClick} type="button">{label}</button>;
}

function TimelineCanvas({
  onSelect,
  points,
  selectedRestorePointId,
  timeZone,
}: {
  onSelect: (id: number) => void;
  points: RestorePoint[];
  selectedRestorePointId: number | null;
  timeZone: string;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-4">
      <div className="relative flex h-full min-w-[44rem] items-center justify-between gap-4 px-2 before:absolute before:left-8 before:right-8 before:top-1/2 before:h-px before:bg-sky-300/25">
        {points.map((point) => (
          <TimelinePointButton active={point.id === selectedRestorePointId} key={point.id} onClick={() => onSelect(point.id)} point={point} timeZone={timeZone} />
        ))}
      </div>
    </div>
  );
}

function TimelinePointButton({ active, onClick, point, timeZone }: { active: boolean; onClick: () => void; point: RestorePoint; timeZone: string }) {
  const tone = restorePointTone(point);
  const title = point.scope === 'full' ? 'All protected apps' : point.appName;
  const kind = point.scope === 'full' ? 'Full checkpoint' : point.source === 'automatic' ? 'Routine backup' : 'App backup';
  return (
    <button
      aria-pressed={active}
      className={cn(
        'relative z-10 flex w-44 shrink-0 flex-col rounded-2xl border border-sky-300/20 bg-slate-800 p-3 text-left shadow-lg shadow-slate-950/25 transition hover:-translate-y-0.5 hover:border-cyan-300/40',
        active && 'border-cyan-300/55 bg-slate-700',
      )}
      onClick={onClick}
      type="button"
    >
      <span className={cn('grid size-8 place-items-center rounded-lg border border-sky-300/15 bg-slate-900', tone.text)}>
        {point.scope === 'full' ? <Layers3 className="size-4" /> : point.source === 'automatic' ? <CalendarClock className="size-4" /> : <AppWindow className="size-4" />}
      </span>
      <span className="mt-8 line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-white">{title}</span>
      <span className="mt-1 text-xs text-sky-100/60">{formatBackupDate(point.createdAt, timeZone)}</span>
      <span className={cn('mt-3 text-xs leading-5', tone.text)}>{kind}</span>
    </button>
  );
}

function RestorePointInspector({
  onOpenDetails,
  onOpenRestorePlan,
  onVerify,
  point,
  restoreAvailability,
  running,
  timeZone,
  verifyAvailability,
}: {
  onOpenDetails: () => void;
  onOpenRestorePlan: () => void;
  onVerify: () => void;
  point: RestorePoint;
  restoreAvailability: BackupOperationAvailability;
  running: string | null;
  timeZone: string;
  verifyAvailability: BackupOperationAvailability;
}) {
  const tone = restorePointTone(point);
  const title = point.scope === 'full' ? 'All protected apps' : point.appName;
  const verificationLabel = point.verificationStatus === 'verified' ? 'Verified' : point.verificationStatus === 'failed' ? 'Verification failed' : 'Verify first';
  return (
    <section className="shrink-0 rounded-2xl border border-sky-300/20 bg-slate-900 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3 sm:items-center">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg border border-sky-300/15 bg-slate-800', tone.text)}>
            {point.verificationStatus === 'verified' ? <CheckCircle2 className="size-4" /> : <CircleAlert className="size-4" />}
          </span>
          <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{title}</p><p className="mt-0.5 text-xs text-sky-100/60">{formatBackupDate(point.createdAt, timeZone)} · {formatBackupBytes(point.sizeBytes)}</p></div>
        </div>
        <StatusBadge tone={tone.badgeTone}>{verificationLabel}</StatusBadge>
      </div>
      <p className="mt-3 text-xs leading-5 text-sky-100/65">{point.scope === 'full' ? 'Contains a recovery point for every protected app at this moment.' : `Contains the backup data Autark-OS recorded for ${point.appName}.`} Review the plan before any restore changes data.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <ProjectDarkControlButton onClick={onOpenDetails} size="sm" type="button">Details</ProjectDarkControlButton>
        <DisabledAction disabled={restoreAvailability.disabled} reason={restoreAvailability.reason}>
          <ProjectPrimaryButton disabled={restoreAvailability.disabled} onClick={onOpenRestorePlan} size="sm" type="button"><ArchiveRestore className="size-3.5" />Review restore plan</ProjectPrimaryButton>
        </DisabledAction>
        <DisabledAction disabled={verifyAvailability.disabled} reason={verifyAvailability.reason}>
          <ProjectDarkControlButton disabled={verifyAvailability.disabled} onClick={onVerify} size="sm" type="button">
            {running === `verify-${point.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
            {running === `verify-${point.id}` ? 'Verifying' : point.verificationStatus === 'verified' ? 'View verification' : 'Verify backup'}
          </ProjectDarkControlButton>
        </DisabledAction>
      </div>
    </section>
  );
}

function AppBackupStrip({
  appBackupAvailability,
  apps,
  focusRef,
  onCreateAppBackup,
  running,
  timeZone,
}: {
  appBackupAvailability: BackupOperationAvailability;
  apps: AppBackupStatus[];
  focusRef: RefObject<HTMLDivElement>;
  onCreateAppBackup: (app: AppBackupStatus) => void;
  running: string | null;
  timeZone: string;
}) {
  return (
    <section className="shrink-0 rounded-2xl border border-sky-300/20 bg-slate-900 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-white">Back up an app</h2><p className="mt-1 text-xs text-sky-100/60">Create a focused restore point without leaving this page.</p></div><span className="text-xs text-sky-100/55">{apps.length} app{apps.length === 1 ? '' : 's'}</span></div>
      <div ref={focusRef} className="mt-3 grid max-h-24 gap-2 overflow-y-auto pr-1 outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70" tabIndex={-1}>
        {apps.length ? apps.map((app) => <AppBackupRow app={app} availability={appBackupAvailability} key={app.appId} onCreateAppBackup={onCreateAppBackup} running={running === `app-${app.appId}`} timeZone={timeZone} />) : <p className="rounded-xl border border-sky-300/15 bg-slate-800 px-3 py-2 text-sm text-sky-100/65">Install an app to begin backup protection.</p>}
      </div>
    </section>
  );
}

function AppBackupRow({ app, availability, onCreateAppBackup, running, timeZone }: { app: AppBackupStatus; availability: BackupOperationAvailability; onCreateAppBackup: (app: AppBackupStatus) => void; running: boolean; timeZone: string }) {
  const disabled = availability.disabled || app.status === 'unprotected' || !app.backupAvailable;
  const disabledReason = availability.disabled ? availability.reason : app.backupUnavailableReason || 'Turn backups on for this app before creating a restore point.';
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-sky-300/15 bg-slate-800/80 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-sky-300/15 bg-slate-900 text-sky-100/70"><AppWindow className="size-3.5" /></span>
        <span className="min-w-0"><span className="block truncate text-sm font-medium text-white">{app.appName}</span><span className="block truncate text-xs text-sky-100/60">{app.latestBackup ? formatBackupDate(app.latestBackup.createdAt, timeZone) : 'No restore point'}</span></span>
      </div>
      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
        <StatusBadge tone={backupAppBadgeTone(app.status)}>{backupStatusLabel(app.status)}</StatusBadge>
        <DisabledAction disabled={disabled} reason={disabledReason}>
          <ProjectDarkControlButton disabled={disabled} onClick={() => onCreateAppBackup(app)} size="sm" type="button">
            {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            {running ? 'Running' : 'Back up'}
          </ProjectDarkControlButton>
        </DisabledAction>
      </div>
    </div>
  );
}

function TimelineEmptyState({ scope }: { scope: TimelineScope }) {
  const description = scope === 'full' ? 'Create a full backup to add the first checkpoint.' : scope === 'app' ? 'Create an app backup to add it to this timeline.' : 'Create a backup to add the first restore point.';
  return <div className="grid min-h-0 flex-1 place-items-center p-6 text-center"><div><CalendarClock className="mx-auto size-5 text-sky-100/55" /><p className="mt-3 text-sm font-semibold text-white">No restore points in this view</p><p className="mt-1 text-sm text-sky-100/60">{description}</p></div></div>;
}

function restorePointTone(point: RestorePoint) {
  if (point.verificationStatus === 'verified') return { badgeTone: 'success' as const, text: point.scope === 'full' ? 'text-cyan-200' : 'text-emerald-200' };
  if (point.verificationStatus === 'failed') return { badgeTone: 'danger' as const, text: 'text-red-200' };
  return { badgeTone: 'warning' as const, text: 'text-amber-200' };
}

function formatUpdatedAt(updatedAt: string | null) {
  if (!updatedAt) return 'Waiting';
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(updatedAt)) / 1000));
  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}
