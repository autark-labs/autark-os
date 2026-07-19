import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  AppWindow,
  ArchiveRestore,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  DatabaseBackup,
  FileArchive,
  Folder,
  FolderArchive,
  FolderOpen,
  HardDrive,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { AppBackupStatus, BackupReport, RestorePoint } from '@/types/backup';
import {
  type BackupOperationAvailability,
  backupStatusLabel,
  formatBackupBytes,
  formatBackupDate,
} from './BackupsPage.logic';
import {
  backupNavigatorSearchWithSelection,
  parseBackupNavigatorRoute,
  type BackupDirectoryKey,
} from './BackupsPage.detailRoute';

type DirectoryKey = BackupDirectoryKey;

type WorkspaceProps = {
  appIconUrlById: Record<string, string | null>;
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

export function BackupColumnNavigatorWorkspace({
  appIconUrlById,
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
}: WorkspaceProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const restorePoints = useMemo(
    () => [...report.recentRestorePoints]
      .filter((point) => point.status === 'completed')
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
    [report.recentRestorePoints],
  );
  const route = useMemo(
    () => parseBackupNavigatorRoute(searchParams, report.apps, restorePoints),
    [report.apps, restorePoints, searchParams],
  );
  const directory = route.directory;
  const selectedApp = findApp(report.apps, directory);
  const directoryPoints = useMemo(
    () => restorePoints.filter((point) => pointMatchesDirectory(point, directory)),
    [directory, restorePoints],
  );
  const selectedPoint = directoryPoints.find((point) => point.id === route.restorePointId) ?? directoryPoints[0] ?? null;
  const attentionMessage = backupAttentionMessage(report);
  const routineDisabled = routineBackupAvailability.disabled || !report.settings.automaticBackupsEnabled;
  const routineReason = routineBackupAvailability.disabled
    ? routineBackupAvailability.reason
    : 'Turn on routine backups in Settings first.';

  function chooseDirectory(nextDirectory: DirectoryKey) {
    setSearchParams(backupNavigatorSearchWithSelection(searchParams, { directory: nextDirectory }), { replace: true });
  }

  function selectRestorePoint(restorePointId: number) {
    setSearchParams(backupNavigatorSearchWithSelection(searchParams, { directory, restorePointId }), { replace: true });
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

      <BackupActions
        attentionMessage={attentionMessage}
        appIconUrlById={appIconUrlById}
        apps={report.apps}
        fullBackupAvailability={fullBackupAvailability}
        nextRunLabel={report.settings.nextRunLabel || formatBackupDate(report.settings.nextRoutineRun, report.settings.timeZone)}
        onChooseApp={(appId) => chooseDirectory(appDirectoryKey(appId))}
        onCreateFullBackup={onCreateFullBackup}
        onRunRoutineBackup={onRunRoutineBackup}
        routineDisabled={routineDisabled}
        routineEnabled={report.settings.automaticBackupsEnabled}
        routineReason={routineReason}
        running={running}
      />

      <section className="grid min-h-[32rem] flex-1 overflow-hidden rounded-2xl border border-sky-300/20 bg-slate-900 shadow-lg shadow-slate-950/20 xl:grid-cols-[13rem_minmax(18rem,1fr)_20rem]">
        <FolderColumn
          apps={report.apps}
          attentionMessage={attentionMessage}
          appIconUrlById={appIconUrlById}
          directory={directory}
          onChooseDirectory={chooseDirectory}
          restorePoints={restorePoints}
        />

        <div className="flex min-h-0 min-w-0 flex-col border-y border-sky-300/15 xl:border-y-0 xl:border-r">
          <DirectoryHeader
            app={selectedApp}
            appBackupAvailability={appBackupAvailability}
            directory={directory}
            fileCount={directoryPoints.length}
            onCreateAppBackup={onCreateAppBackup}
            running={running}
          />
          {directoryPoints.length ? (
            <RestoreFileList
              appIconUrlById={appIconUrlById}
              onSelect={selectRestorePoint}
              points={directoryPoints}
              selectedPointId={selectedPoint?.id ?? null}
              timeZone={report.settings.timeZone}
            />
          ) : <EmptyDirectory app={selectedApp} />}
        </div>

        <aside className="hidden min-h-0 overflow-y-auto bg-slate-950/20 p-3 xl:block">
          <PreviewSlot
            app={selectedApp}
            appBackupAvailability={appBackupAvailability}
            appIconUrlById={appIconUrlById}
            onCreateAppBackup={onCreateAppBackup}
            onOpenDetails={onOpenRestoreDetails}
            onOpenRestorePlan={onOpenRestorePlan}
            onVerify={onVerifyRestorePoint}
            point={selectedPoint}
            restoreAvailability={restoreAvailability}
            running={running}
            settings={report.settings}
            timeZone={report.settings.timeZone}
            verifyAvailability={verifyAvailability}
          />
        </aside>
      </section>

      <div className="xl:hidden">
        <PreviewSlot
          app={selectedApp}
          appBackupAvailability={appBackupAvailability}
          appIconUrlById={appIconUrlById}
          compact
          onCreateAppBackup={onCreateAppBackup}
          onOpenDetails={onOpenRestoreDetails}
          onOpenRestorePlan={onOpenRestorePlan}
          onVerify={onVerifyRestorePoint}
          point={selectedPoint}
          restoreAvailability={restoreAvailability}
          running={running}
          settings={report.settings}
          timeZone={report.settings.timeZone}
          verifyAvailability={verifyAvailability}
        />
      </div>
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
          <span className="hidden size-10 shrink-0 place-items-center rounded-xl border border-cyan-300/35 bg-cyan-400/10 text-cyan-200 sm:grid"><DatabaseBackup aria-hidden="true" className="size-5" /></span>
          <div className="min-w-0"><h1 className="m-0 text-3xl font-semibold tracking-tight text-white sm:text-[2.1rem]">Backups</h1><p className="mt-1 text-sm text-sky-100/70">Browse recovery points like the files they protect.</p></div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <HeaderMetric label="Protected" value={`${protectedApps}/${totalApps}`} />
          <HeaderMetric label="Last checked" value={formatUpdatedAt(updatedAt)} />
          <DisabledAction disabled={refreshing} reason="Backup status is already refreshing."><button aria-label="Refresh backup status" className="grid size-10 place-items-center rounded-xl border border-sky-300/15 bg-slate-950/25 text-sky-100/70 transition hover:border-cyan-300/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={refreshing} onClick={onRefresh} type="button"><RefreshCw className={cn('size-4', refreshing && 'animate-spin')} /></button></DisabledAction>
          <button aria-label="Backup settings" className="grid size-10 place-items-center rounded-xl border border-sky-300/15 bg-slate-950/25 text-sky-100/70 transition hover:border-cyan-300/30 hover:text-white" onClick={onOpenSettings} type="button"><Settings2 className="size-4" /></button>
        </div>
      </div>
    </Surface>
  );
}

function HeaderMetric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-24 rounded-xl border border-sky-300/15 bg-slate-950/25 px-3 py-2 text-right"><p className="truncate text-sm font-semibold leading-none text-white">{value}</p><p className="mt-1 text-[0.68rem] text-slate-400">{label}</p></div>;
}

function BackupActions({
  attentionMessage,
  appIconUrlById,
  apps,
  fullBackupAvailability,
  nextRunLabel,
  onChooseApp,
  onCreateFullBackup,
  onRunRoutineBackup,
  routineDisabled,
  routineEnabled,
  routineReason,
  running,
}: {
  attentionMessage: string | null;
  appIconUrlById: Record<string, string | null>;
  apps: AppBackupStatus[];
  fullBackupAvailability: BackupOperationAvailability;
  nextRunLabel: string;
  onChooseApp: (appId: string) => void;
  onCreateFullBackup: () => void;
  onRunRoutineBackup: () => void;
  routineDisabled: boolean;
  routineEnabled: boolean;
  routineReason: string;
  running: string | null;
}) {
  return (
    <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-300/15 bg-slate-900/70 px-3 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-sky-100/70">
        <span className="flex items-center gap-2"><ShieldCheck className={cn('size-4', routineEnabled ? 'text-emerald-300' : 'text-amber-300')} />{routineEnabled ? `Routine backups on · ${nextRunLabel}` : 'Routine backups are off'}</span>
        {attentionMessage && <span className="flex items-center gap-1.5 text-amber-200"><CircleAlert className="size-3.5" />{attentionMessage}</span>}
        <DisabledAction disabled={routineDisabled} reason={routineReason}><button className="text-xs font-medium text-cyan-200 hover:text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={routineDisabled} onClick={onRunRoutineBackup} type="button">{running === 'routine' ? 'Running scheduled backup…' : 'Run scheduled backup now'}</button></DisabledAction>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <DisabledAction disabled={fullBackupAvailability.disabled} reason={fullBackupAvailability.reason}><ProjectPrimaryButton disabled={fullBackupAvailability.disabled} onClick={onCreateFullBackup} size="sm" type="button">{running === 'full' ? <Loader2 className="size-3.5 animate-spin" /> : <Layers3 className="size-3.5" />}{running === 'full' ? 'Backing up all' : 'Back up all'}</ProjectPrimaryButton></DisabledAction>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ProjectDarkControlButton size="sm" type="button"><AppWindow className="size-3.5" />Choose an app</ProjectDarkControlButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 border-sky-300/20 bg-slate-900 text-sky-50">
            <DropdownMenuLabel>Back up an app</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-sky-300/15" />
            {apps.length ? apps.map((app) => <DropdownMenuItem className="gap-2" key={app.appId} onSelect={() => onChooseApp(app.appId)}><BackupAppIcon iconUrl={appIconUrlById[app.appId]} /><span className="min-w-0 flex-1 truncate">{app.appName}</span><span className="text-xs text-sky-100/60">{backupStatusLabel(app.status)}</span></DropdownMenuItem>) : <DropdownMenuItem disabled>No installed apps</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function FolderColumn({
  apps,
  attentionMessage,
  appIconUrlById,
  directory,
  onChooseDirectory,
  restorePoints,
}: {
  apps: AppBackupStatus[];
  attentionMessage: string | null;
  appIconUrlById: Record<string, string | null>;
  directory: DirectoryKey;
  onChooseDirectory: (directory: DirectoryKey) => void;
  restorePoints: RestorePoint[];
}) {
  return (
    <aside className="min-h-0 overflow-y-auto bg-slate-950/30 p-3 xl:border-r xl:border-sky-300/15">
      <div className="flex items-center justify-between px-2 pb-2"><p className="text-xs font-semibold uppercase tracking-wide text-sky-100/65">Backup folders</p><span className="text-xs text-sky-100/65">{restorePoints.length} files</span></div>
      <nav aria-label="Backup folders" className="grid gap-1">
        <FolderButton active={directory === 'all'} count={restorePoints.length} icon={FolderOpen} label="All backups" onClick={() => onChooseDirectory('all')} />
        <FolderButton active={directory === 'full'} count={restorePoints.filter((point) => point.scope === 'full').length} icon={FolderArchive} label="Full checkpoints" onClick={() => onChooseDirectory('full')} />
        <p className="mt-3 px-2 text-xs font-semibold uppercase tracking-wide text-sky-100/65">App backups</p>
        {apps.map((app) => <FolderButton app={app} appIconUrl={appIconUrlById[app.appId]} active={directory === appDirectoryKey(app.appId)} count={restorePoints.filter((point) => point.appId === app.appId).length} icon={app.status === 'protected' ? Folder : CircleAlert} key={app.appId} label={app.appName} onClick={() => onChooseDirectory(appDirectoryKey(app.appId))} />)}
      </nav>
      {/* {attentionMessage && <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-400/5 p-3"><div className="flex items-center gap-2 text-amber-200"><CircleAlert className="size-3.5" /><span className="text-xs font-semibold">{attentionMessage}</span></div><p className="mt-1 text-xs leading-5 text-sky-100/60">Select an app folder to see its backup state and next action.</p></div>} */}
    </aside>
  );
}

function FolderButton({
  active,
  app,
  appIconUrl,
  count,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  app?: AppBackupStatus;
  appIconUrl?: string | null;
  count: number;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  const needsAttention = Boolean(app && app.status !== 'protected');
  return <button className={cn('flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-slate-800', active && 'bg-cyan-300/15 text-cyan-100', needsAttention && !active && 'text-amber-100/85')} onClick={onClick} type="button">{app ? <BackupAppIcon className={cn(active && 'ring-1 ring-cyan-300/40', needsAttention && 'ring-1 ring-amber-300/35')} iconUrl={appIconUrl} /> : <Icon className={cn('size-4 shrink-0 text-sky-100/55', active && 'text-cyan-200', needsAttention && 'text-amber-200')} />}<span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{label}</span><span className="block truncate text-xs text-sky-100/65">{app ? backupStatusLabel(app.status) : `${count} ${count === 1 ? 'file' : 'files'}`}</span></span><span className="shrink-0 text-xs text-sky-100/65">{count}</span><ChevronRight className="size-3.5 shrink-0 text-sky-100/35" /></button>;
}

function DirectoryHeader({
  app,
  appBackupAvailability,
  directory,
  fileCount,
  onCreateAppBackup,
  running,
}: {
  app: AppBackupStatus | null;
  appBackupAvailability: BackupOperationAvailability;
  directory: DirectoryKey;
  fileCount: number;
  onCreateAppBackup: (app: AppBackupStatus) => void;
  running: string | null;
}) {
  const disabled = appBackupAvailability.disabled || !app?.backupAvailable || app.status === 'unprotected';
  const reason = appBackupAvailability.disabled ? appBackupAvailability.reason : app?.backupUnavailableReason || 'Turn backups on for this app before creating a restore point.';
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-sky-300/15 px-3 py-3">
      <div className="min-w-0"><div className="flex min-w-0 items-center gap-1 text-xs text-sky-100/55"><HardDrive className="size-3.5 shrink-0" /><span className="truncate">{directoryPath(directory, app)}</span></div><p className="mt-1 text-sm font-semibold text-white">{directoryTitle(directory, app)} <span className="font-normal text-sky-100/50">· {fileCount} {fileCount === 1 ? 'file' : 'files'}</span></p></div>
      {app ? <DisabledAction disabled={disabled} reason={reason}><ProjectDarkControlButton disabled={disabled} onClick={() => onCreateAppBackup(app)} size="sm" type="button">{running === `app-${app.appId}` ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}{running === `app-${app.appId}` ? 'Backing up' : 'Back up this app'}</ProjectDarkControlButton></DisabledAction> : <span className="rounded-md border border-sky-300/20 bg-slate-800 px-2 py-1 text-xs text-sky-100/65">Newest first</span>}
    </div>
  );
}

function RestoreFileList({
  appIconUrlById,
  onSelect,
  points,
  selectedPointId,
  timeZone,
}: {
  appIconUrlById: Record<string, string | null>;
  onSelect: (id: number) => void;
  points: RestorePoint[];
  selectedPointId: number | null;
  timeZone: string;
}) {
  return <div className="min-h-0 flex-1 overflow-y-auto p-2">{groupPoints(points).map(([label, group]) => <div key={label}><p className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-sky-100/65">{label}</p>{group.map((point) => <RestoreFileRow active={point.id === selectedPointId} appIconUrl={appIconUrlById[point.appId]} key={point.id} onClick={() => onSelect(point.id)} point={point} timeZone={timeZone} />)}</div>)}</div>;
}

function RestoreFileRow({ active, appIconUrl, onClick, point, timeZone }: { active: boolean; appIconUrl?: string | null; onClick: () => void; point: RestorePoint; timeZone: string }) {
  const tone = restorePointTone(point);
  return <button className={cn('flex w-full min-w-0 items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-slate-800', active && 'bg-cyan-300/15 ring-1 ring-cyan-300/30')} onClick={onClick} type="button">{point.scope === 'full' ? <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg border border-sky-300/15 bg-slate-950', tone.text)}><FileArchive className="size-4" /></span> : <BackupAppIcon className="size-9 rounded-lg" iconUrl={appIconUrl} />}<span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-white" title={restoreFileName(point)}>{restoreFileName(point)}</span><span className="mt-0.5 block truncate text-xs text-sky-100/60">{formatBackupDate(point.createdAt, timeZone)} · {formatBackupBytes(point.sizeBytes)}</span></span><StatusBadge tone={tone.badgeTone}>{verificationLabel(point)}</StatusBadge></button>;
}

function PreviewSlot({
  app,
  appBackupAvailability,
  appIconUrlById,
  compact = false,
  onCreateAppBackup,
  onOpenDetails,
  onOpenRestorePlan,
  onVerify,
  point,
  restoreAvailability,
  running,
  settings,
  timeZone,
  verifyAvailability,
}: {
  app: AppBackupStatus | null;
  appBackupAvailability: BackupOperationAvailability;
  appIconUrlById: Record<string, string | null>;
  compact?: boolean;
  onCreateAppBackup: (app: AppBackupStatus) => void;
  onOpenDetails: (point: RestorePoint) => void;
  onOpenRestorePlan: (point: RestorePoint) => void;
  onVerify: (point: RestorePoint) => void;
  point: RestorePoint | null;
  restoreAvailability: BackupOperationAvailability;
  running: string | null;
  settings: BackupReport['settings'];
  timeZone: string;
  verifyAvailability: BackupOperationAvailability;
}) {
  if (!point) return <EmptyPreview app={app} appBackupAvailability={appBackupAvailability} onCreateAppBackup={onCreateAppBackup} running={running} />;
  const tone = restorePointTone(point);
  const selectedApp = app ?? null;
  const appBackupDisabled = appBackupAvailability.disabled || !selectedApp?.backupAvailable || selectedApp.status === 'unprotected';
  const appBackupReason = appBackupAvailability.disabled ? appBackupAvailability.reason : selectedApp?.backupUnavailableReason || 'Turn backups on for this app before creating a restore point.';
  return (
    <section className={cn('rounded-xl border border-sky-300/20 bg-slate-900 p-4', compact && 'mt-3')}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-2">{point.scope === 'full' ? <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg border border-sky-300/15 bg-slate-800', tone.text)}>{point.verificationStatus === 'verified' ? <CheckCircle2 className="size-4" /> : <CircleAlert className="size-4" />}</span> : <BackupAppIcon className="size-8 rounded-lg" iconUrl={appIconUrlById[point.appId]} />}<div className="min-w-0"><p className="line-clamp-2 break-words text-sm font-semibold leading-5 text-white">{point.scope === 'full' ? 'Full checkpoint' : point.appName}</p><p className="mt-0.5 text-xs text-sky-100/60">{formatBackupDate(point.createdAt, timeZone)} · {formatBackupBytes(point.sizeBytes)}</p></div></div><StatusBadge tone={tone.badgeTone}>{verificationLabel(point)}</StatusBadge></div>
      <p className="mt-3 text-xs leading-5 text-sky-100/65">{point.scope === 'full' ? 'This file contains a recovery point for every protected app at that moment.' : `This file contains the backup data Autark-OS recorded for ${point.appName}.`} Review the plan before restoring anything.</p>
      <div className="mt-4 grid gap-2"><PreviewFact icon={point.scope === 'full' ? Layers3 : AppWindow} label="Restore scope" value={point.scope === 'full' ? 'All protected apps' : point.appName} /><PreviewFact icon={point.verificationStatus === 'verified' ? CheckCircle2 : Clock3} label="Verification" value={verificationDetail(point)} /><PreviewFact icon={CalendarClock} label="Next scheduled backup" value={settings.nextRunLabel || formatBackupDate(settings.nextRoutineRun, timeZone)} /></div>
      <div className="mt-4 flex flex-wrap gap-2"><DisabledAction disabled={restoreAvailability.disabled} reason={restoreAvailability.reason}><ProjectPrimaryButton disabled={restoreAvailability.disabled} onClick={() => onOpenRestorePlan(point)} size="sm" type="button"><ArchiveRestore className="size-3.5" />Review restore plan</ProjectPrimaryButton></DisabledAction><DisabledAction disabled={verifyAvailability.disabled} reason={verifyAvailability.reason}><ProjectDarkControlButton disabled={verifyAvailability.disabled} onClick={() => onVerify(point)} size="sm" type="button">{running === `verify-${point.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}{running === `verify-${point.id}` ? 'Verifying' : point.verificationStatus === 'verified' ? 'View verification' : 'Verify file'}</ProjectDarkControlButton></DisabledAction></div>
      <div className="mt-2 flex flex-wrap gap-2"><ProjectDarkControlButton onClick={() => onOpenDetails(point)} size="sm" type="button">Details</ProjectDarkControlButton>{point.scope !== 'full' && selectedApp && <DisabledAction disabled={appBackupDisabled} reason={appBackupReason}><ProjectDarkControlButton disabled={appBackupDisabled} onClick={() => onCreateAppBackup(selectedApp)} size="sm" type="button"><Play className="size-3.5" />Back up again</ProjectDarkControlButton></DisabledAction>}</div>
    </section>
  );
}

function PreviewFact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return <div className="flex items-center gap-2 rounded-lg border border-sky-300/15 bg-slate-950/30 px-2.5 py-2"><Icon className="size-3.5 shrink-0 text-sky-100/60" /><span className="min-w-0"><span className="block text-[0.65rem] text-slate-400">{label}</span><span className="block break-words text-xs leading-4 font-medium text-sky-50">{value}</span></span></div>;
}

function EmptyDirectory({ app }: { app: AppBackupStatus | null }) {
  const description = app?.backupUnavailableReason || app?.message || 'Create a backup to add the first recovery file.';
  return <div className="grid min-h-0 flex-1 place-items-center p-6 text-center"><div><Folder className="mx-auto size-5 text-sky-100/50" /><p className="mt-3 text-sm font-semibold text-white">{app ? `No backup files for ${app.appName}` : 'This folder is empty'}</p><p className="mt-1 max-w-xs text-sm leading-6 text-sky-100/60">{description}</p></div></div>;
}

function EmptyPreview({
  app,
  appBackupAvailability,
  onCreateAppBackup,
  running,
}: {
  app: AppBackupStatus | null;
  appBackupAvailability: BackupOperationAvailability;
  onCreateAppBackup: (app: AppBackupStatus) => void;
  running: string | null;
}) {
  if (!app) return <div className="rounded-xl border border-sky-300/15 bg-slate-900 p-4 text-sm text-sky-100/65">Select a backup file to review its recovery details.</div>;
  const disabled = appBackupAvailability.disabled || !app.backupAvailable || app.status === 'unprotected';
  const reason = appBackupAvailability.disabled ? appBackupAvailability.reason : app.backupUnavailableReason || 'Turn backups on for this app before creating a restore point.';
  return <section className="rounded-xl border border-sky-300/20 bg-slate-900 p-4"><div className="flex items-center gap-2"><CircleAlert className="size-4 text-amber-200" /><p className="text-sm font-semibold text-white">No recovery file yet</p></div><p className="mt-2 text-xs leading-5 text-sky-100/65">{app.message || `Create the first backup for ${app.appName}.`}</p><DisabledAction disabled={disabled} reason={reason}><ProjectPrimaryButton className="mt-4" disabled={disabled} onClick={() => onCreateAppBackup(app)} size="sm" type="button">{running === `app-${app.appId}` ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}{running === `app-${app.appId}` ? 'Backing up' : 'Back up this app'}</ProjectPrimaryButton></DisabledAction></section>;
}

function BackupAppIcon({ className, iconUrl }: { className?: string; iconUrl?: string | null }) {
  return (
    <span aria-hidden="true" className={cn('relative grid size-5 shrink-0 place-items-center overflow-hidden rounded-md border border-sky-300/15 bg-slate-800', className)}>
      <AppWindow className="size-3 text-sky-100/60" />
      {iconUrl && <img alt="" className="absolute inset-0 size-full object-contain p-0.5" onError={(event) => { event.currentTarget.style.display = 'none'; }} src={iconUrl} />}
    </span>
  );
}

function appDirectoryKey(appId: string): DirectoryKey {
  return `app:${appId}`;
}

function findApp(apps: AppBackupStatus[], directory: DirectoryKey) {
  return directory.startsWith('app:') ? apps.find((app) => app.appId === directory.slice(4)) ?? null : null;
}

function pointMatchesDirectory(point: RestorePoint, directory: DirectoryKey) {
  if (directory === 'all') return true;
  if (directory === 'full') return point.scope === 'full';
  return point.appId === directory.slice(4);
}

function directoryPath(directory: DirectoryKey, app: AppBackupStatus | null) {
  if (directory === 'all') return 'Backups';
  if (directory === 'full') return 'Backups / Full checkpoints';
  return `Backups / App backups / ${app?.appName || 'App'}`;
}

function directoryTitle(directory: DirectoryKey, app: AppBackupStatus | null) {
  if (directory === 'all') return 'All backup files';
  if (directory === 'full') return 'Full checkpoints';
  return `${app?.appName || 'App'} backups`;
}

function groupPoints(points: RestorePoint[]): Array<readonly [string, RestorePoint[]]> {
  return points.length < 2 ? [['Latest', points]] : [['Latest', [points[0]]], ['Earlier', points.slice(1)]];
}

function restoreFileName(point: RestorePoint) {
  if (point.scope === 'full') return `checkpoint-${point.createdAt.slice(0, 10)}.autark-backup`;
  return `${point.appName.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}-${point.createdAt.slice(0, 10)}.autark-backup`;
}

function restorePointTone(point: RestorePoint) {
  if (point.verificationStatus === 'verified') return { badgeTone: 'success' as const, text: point.scope === 'full' ? 'text-cyan-200' : 'text-emerald-200' };
  if (point.verificationStatus === 'failed') return { badgeTone: 'danger' as const, text: 'text-red-200' };
  return { badgeTone: 'warning' as const, text: 'text-amber-200' };
}

function verificationLabel(point: RestorePoint) {
  if (point.verificationStatus === 'verified') return 'Verified';
  if (point.verificationStatus === 'failed') return 'Review';
  return 'Verify';
}

function verificationDetail(point: RestorePoint) {
  if (point.verificationStatus === 'verified') return 'Verified after creation';
  if (point.verificationStatus === 'failed') return 'Verification needs review';
  return 'Not verified yet';
}

function backupAttentionMessage(report: BackupReport) {
  if (report.failedBackups > 0) return `${report.failedBackups} backup ${report.failedBackups === 1 ? 'run needs' : 'runs need'} review`;
  const appCount = report.apps.filter((app) => app.status !== 'protected').length;
  return appCount ? `${appCount} app${appCount === 1 ? '' : 's'} need review` : null;
}

function formatUpdatedAt(updatedAt: string | null) {
  if (!updatedAt) return 'Waiting';
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(updatedAt)) / 1000));
  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}
