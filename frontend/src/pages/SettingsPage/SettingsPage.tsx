import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  Copy,
  Database,
  HelpCircle,
  Loader2,
  Network,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackupAPIClient } from '@/api/BackupAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { SystemAPIClient } from '@/api/SystemAPIClient';
import { StatusBadge } from '@/components/autark-os/StatusBadge';
import { Input } from '@/components/ui/input';
import { PageShell } from '@/components/layout/PageShell';
import { ProjectDarkControlButton, ProjectPrimaryButton } from '@/components/primitives/ProjectButtons';
import { ProjectInset, ProjectPanel, Surface } from '@/components/primitives/Surface';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { LocalizedDateTime } from '@/components/autark-os/LocalizedDateTime';
import { PageLoadError } from '@/components/autark-os/PageLoadError';
import { PageLoadingState } from '@/components/autark-os/PageLoadingState';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select as UiSelect,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { showActionErrorNotification, showActionNotification } from '@/lib/actionNotifications';
import { copyText } from '@/lib/copyText';
import { cn } from '@/lib/utils';
import { useApplicationStateRepository } from '@/repositories/applicationStateRepository';
import { useSystemDoctorQuery } from '@/repositories/systemRepository';
import type { AppRuntimeView, InstallSettings } from '@/types/app';
import type { BackupSettingsSummary } from '@/types/backup';
import type { ProjectSettings, ProjectVersionInfo, SystemDoctorStatus, SystemMetrics, SystemSetupCheck, SystemSetupStatus } from '@/types/system';
import { defaultSettingsGroup, sectionsForGroup, settingsGroups as topLevelSettingsGroups } from './SettingsPage.sections';

type SettingsState = {
  backupRoot: string | null;
  backupSchedule: BackupSettingsSummary | null;
  doctor: SystemDoctorStatus | null;
  metrics: SystemMetrics | null;
  projectSettings: ProjectSettings | null;
  setup: SystemSetupStatus | null;
  version: ProjectVersionInfo | null;
};

type SettingsSection = 'general' | 'system' | 'network' | 'storage' | 'backups' | 'applications' | 'security' | 'remote-access' | 'advanced';
type SettingsGroupId = 'general' | 'backups' | 'network' | 'advanced';

type SettingHelp = {
  id: string;
  title: string;
  body: string;
  usedFor: string[];
  tip: string;
};

const groupIcons: Record<SettingsGroupId, LucideIcon> = {
  advanced: Code2,
  backups: Database,
  general: Settings,
  network: Network,
};

const settingHelp: Record<string, SettingHelp> = {
  deviceName: {
    id: 'deviceName',
    title: 'Device name',
    body: 'This is the friendly name Autark-OS uses for this homelab device in the interface and generated labels.',
    usedFor: ['Dashboard display', 'Support bundles', 'Network identification', 'Future device discovery'],
    tip: 'Choose a name that is easy to recognize on your network.',
  },
  timeZone: {
    id: 'timeZone',
    title: 'Time zone',
    body: 'Sets the local time used to calculate and show automatic backup windows.',
    usedFor: ['Backup schedule calculation', 'Backup schedule display'],
    tip: 'Use an IANA time zone like America/Chicago for predictable scheduling.',
  },
  automaticRepairEnabled: {
    id: 'automaticRepairEnabled',
    title: 'Automatic fixes',
    body: 'Lets Autark-OS attempt safe repairs such as restarting unhealthy apps or rebuilding missing private links.',
    usedFor: ['App guardian loop', 'Application stability', 'Private link repair'],
    tip: 'This updates installed apps now. Individual app overrides still live in Applications.',
  },
  automaticBackupsEnabled: {
    id: 'automaticBackupsEnabled',
    title: 'Automatic backups',
    body: 'Turns routine backup protection on or off for managed apps and updates their default backup policy.',
    usedFor: ['Installed app backup policy', 'Routine backup scheduler', 'Restore point planning'],
    tip: 'Manual backups will remain available even when automatic backups are off.',
  },
};

const SettingsPanel = ProjectPanel;
const SettingsInset = ProjectInset;

function SettingsLoadingState() {
  return (
    <PageShell>
      <PageLoadingState model={{ description: 'Reading appliance preferences, setup checks, and app defaults.', title: 'Loading settings' }} />
    </PageShell>
  );
}

function SettingsErrorState({ actionLabel = 'Retry', message, onAction, title }: { actionLabel?: string; message: string; onAction: () => void; title: string }) {
  return <PageLoadError model={{ actionLabel, message, title }} onRetry={onAction} />;
}

function SettingsPage() {
  const navigate = useNavigate();
  const { setProjectSettings } = useProjectSettings();
  const appState = useApplicationStateRepository();
  const doctorQuery = useSystemDoctorQuery();
  const [activeGroup, setActiveGroup] = useState<SettingsGroupId>('general');
  const [state, setState] = useState<SettingsState>({ backupRoot: null, backupSchedule: null, doctor: null, metrics: null, projectSettings: null, setup: null, version: null });
  const [draft, setDraft] = useState<ProjectSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [refreshConfirmationOpen, setRefreshConfirmationOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);

  async function load(background = false) {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setLoadError(null);
    try {
      const [setup, metrics, projectSettings, version, backupReport] = await Promise.all([
        SystemAPIClient.setupStatus(),
        SystemAPIClient.metrics(),
        SystemAPIClient.settings(),
        SystemAPIClient.version(),
        BackupAPIClient.report().catch((backupError) => {
          console.warn('Unable to load backup destination for Settings.', backupError);
          return null;
        }),
      ]);
      setState((current) => ({ ...current, backupRoot: backupReport?.backupRoot ?? null, backupSchedule: backupReport?.settings ?? null, metrics, projectSettings, setup, version }));
      setDraft(projectSettings);
    } catch (loadError) {
      setLoadError(apiErrorMessage(loadError, 'Settings could not be loaded.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const requiredChecks = useMemo(() => state.setup?.checks?.filter((check) => ['service-user', 'runtime-root', 'docker', 'fileops', 'tailscale', 'tailscale-operator'].includes(check.id)) ?? [], [state.setup]);
  const advancedChecks = useMemo(() => state.setup?.checks?.filter((check) => !requiredChecks.includes(check)) ?? [], [requiredChecks, state.setup]);
  const activeGroupId = defaultSettingsGroup(activeGroup) as SettingsGroupId;
  const activeGroupMeta = topLevelSettingsGroups.find((group) => group.id === activeGroupId) || topLevelSettingsGroups[0];
  const ActiveGroupIcon = groupIcons[activeGroupId];
  const dirty = Boolean(draft && state.projectSettings && JSON.stringify(draft) !== JSON.stringify(state.projectSettings));
  const doctor = doctorQuery.data ?? state.doctor;

  useEffect(() => {
    if (!dirty) {
      return undefined;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) {
      return undefined;
    }
    const guardNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const anchor = (event.target instanceof Element ? event.target.closest('a[href]') : null) as HTMLAnchorElement | null;
      if (!anchor || anchor.target || anchor.hasAttribute('download')) {
        return;
      }
      const destination = anchor.href;
      if (!destination || destination === window.location.href || destination.startsWith('mailto:') || destination.startsWith('tel:')) {
        return;
      }
      event.preventDefault();
      setPendingNavigation(destination);
    };
    document.addEventListener('click', guardNavigation, true);
    return () => document.removeEventListener('click', guardNavigation, true);
  }, [dirty]);

  async function copy(value: string, id: string) {
    const result = await copyText(value);
    if (!result.ok) {
      showActionNotification({ ok: false, severity: 'warning', title: 'Copy unavailable', message: result.message }, 'Copy unavailable');
      return;
    }
    setCopied(id);
    showActionNotification({ ok: true, severity: 'success', title: 'Command copied', message: value }, 'Command copied');
    window.setTimeout(() => setCopied(null), 1600);
  }

  function updateDraft(update: Partial<ProjectSettings>) {
    setDraft((current) => (current ? { ...current, ...update } : current));
  }

  async function save() {
    if (!draft) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const result = await SystemAPIClient.updateSettings(draft);
      const saved = result.settings;
      setState((current) => ({ ...current, projectSettings: saved }));
      setDraft(saved);
      setProjectSettings(saved);
      if (result.appDefaults.updatedApps > 0) {
        try {
          await appState.refresh();
        } catch (refreshError) {
          console.warn('Settings were saved, but managed apps could not refresh immediately.', refreshError);
        }
      }
      showActionNotification({
        ok: true,
        severity: 'success',
        title: 'Settings saved',
        message: result.appDefaults.message,
      }, 'Settings saved');
    } catch (saveError) {
      const message = apiErrorMessage(saveError, 'Settings could not be saved.');
      setSaveError(message);
      showActionErrorNotification(saveError, 'Settings could not be saved');
    } finally {
      setSaving(false);
    }
  }

  function requestRefresh() {
    if (dirty) {
      setRefreshConfirmationOpen(true);
      return;
    }
    void load(true);
    void doctorQuery.refetch();
  }

  function continueNavigation() {
    if (!pendingNavigation) {
      return;
    }
    const destination = new URL(pendingNavigation, window.location.origin);
    if (destination.origin === window.location.origin) {
      navigate(destination.pathname + destination.search + destination.hash);
      return;
    }
    window.location.assign(destination.toString());
  }

  if (loading) {
    return <SettingsLoadingState />;
  }

  if (!draft) {
    return (
      <PageShell>
        <SettingsErrorState actionLabel="Try again" message={loadError || 'Autark-OS could not load settings.'} onAction={() => void load()} title="Settings are unavailable" />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Surface as="header" className="overflow-hidden" tone="panel">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-sky-400/20 bg-slate-900 p-6 md:p-7">
          <div>
            <p className="text-xs font-black uppercase tracking-normal text-cyan-200">Settings</p>
            <h1 className="mt-2 text-3xl font-black leading-tight text-white md:text-4xl">Autark-OS controls</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Direct controls for this appliance: identity, managed-app defaults, backups, and advanced host details. Changes apply when you save them.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={dirty ? 'warning' : 'success'}>
              {dirty ? 'Unsaved changes' : 'Saved'}
            </StatusBadge>
            <DisabledAction disabled={refreshing || saving} reason={saving ? 'Wait for the current save to finish.' : 'Settings are already refreshing.'}>
              <ProjectDarkControlButton disabled={refreshing || saving} onClick={requestRefresh} type="button">
                <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
                Refresh
              </ProjectDarkControlButton>
            </DisabledAction>
            <DisabledAction disabled={!dirty || saving} reason={saving ? 'Autark-OS is already saving these settings.' : 'Make a change before saving settings.'}>
              <ProjectPrimaryButton disabled={!dirty || saving} onClick={() => void save()} type="button">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {saving ? 'Saving' : 'Save changes'}
              </ProjectPrimaryButton>
            </DisabledAction>
          </div>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-3">
          <SettingsStatusCard icon={CheckCircle2} label="Save state" tone={dirty ? 'orange' : 'green'} value={dirty ? 'Review changes' : 'No pending changes'} />
          <SettingsStatusCard icon={ShieldCheck} label="Setup" tone={state.setup?.status === 'ready' ? 'green' : 'orange'} value={state.setup?.headline || 'Setup status unavailable'} />
          <SettingsStatusCard icon={ActiveGroupIcon} label="Selected" tone={activeGroupId === 'advanced' ? 'cyan' : 'slate'} value={activeGroupMeta.label} />
        </div>
      </Surface>

      {loadError && <SettingsErrorState message={loadError} onAction={() => { void load(true); void doctorQuery.refetch(); }} title="Settings could not refresh" />}
      {saveError && <SettingsErrorState actionLabel="Try save again" message={`${saveError} Your edits are still here.`} onAction={() => void save()} title="Settings could not save" />}

      <Surface as="nav" className="grid gap-2 p-2 sm:grid-cols-2 xl:grid-cols-4" tone="panel">
        {topLevelSettingsGroups.map((group) => {
          const groupId = group.id as SettingsGroupId;
          const Icon = groupIcons[groupId];
          const active = activeGroupId === group.id;
          return (
            <button
              className={cn(
                'flex min-w-0 items-start gap-3 rounded-xl border p-3 text-left text-sm transition',
                active
                  ? 'border-cyan-300/45 bg-cyan-400/10 text-cyan-100 shadow-sm shadow-cyan-950/20'
                  : 'border-sky-400/20 bg-slate-800 text-sky-100/80 hover:border-cyan-300/35 hover:bg-slate-700 hover:text-white'
              )}
              key={group.id}
              onClick={() => setActiveGroup(groupId)}
              type="button"
            >
              <Icon className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0">
                <span className="block font-bold">{group.label}</span>
                <span className="mt-1 block text-xs leading-5 opacity-75">{group.description}</span>
              </span>
            </button>
          );
        })}
      </Surface>

      <div className="grid gap-5">
        <Surface as="main" className="p-5" tone="panel">
          <SettingsInset className="mb-5">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-cyan-300/25 bg-cyan-400/10 text-cyan-200">
                <ActiveGroupIcon className="size-4" />
              </span>
              <div>
                <h2 className="text-lg font-black text-white">{activeGroupMeta.label}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-400">{activeGroupMeta.description}</p>
              </div>
            </div>
          </SettingsInset>
          <div className="grid gap-5">
            {sectionsForGroup(activeGroupId).map((sectionId) => (
              <SettingsPanelBySection
                advancedChecks={advancedChecks}
                apps={appState.apps}
                backupRoot={state.backupRoot}
                backupSchedule={state.backupSchedule}
                copied={copied}
                doctor={doctor}
                draft={draft}
                key={sectionId}
                metrics={state.metrics}
                onCopy={copy}
                onUpdate={updateDraft}
                requiredChecks={requiredChecks}
                sectionId={sectionId as SettingsSection}
                setup={state.setup}
                version={state.version}
              />
            ))}
          </div>
        </Surface>
      </div>

      <AlertDialog open={refreshConfirmationOpen} onOpenChange={setRefreshConfirmationOpen}>
        <AlertDialogContent className="border-orange-400/30 bg-slate-950 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">Refreshing reloads the saved appliance settings and removes the edits on this page.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={refreshing}>Keep editing</AlertDialogCancel>
            <AlertDialogAction className="bg-orange-500 text-white hover:bg-orange-400" disabled={refreshing} onClick={() => {
              setRefreshConfirmationOpen(false);
              void load(true);
              void doctorQuery.refetch();
            }}>
              Discard and refresh
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(pendingNavigation)} onOpenChange={(open) => !open && setPendingNavigation(null)}>
        <AlertDialogContent className="border-orange-400/30 bg-slate-950 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">Your settings edits have not been saved. Keep editing or discard them before leaving this page.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction className="bg-orange-500 text-white hover:bg-orange-400" onClick={continueNavigation}>
              Discard and leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

function GeneralPanel({ draft, onUpdate }: PanelProps) {
  return (
    <SettingsGroup description="Name this appliance and set the local time used for routine backups." title="General">
      <SettingRow controlId="settings-device-name" helpId="deviceName" label="Device name" note="This name is used to identify your device on the network.">
        <Input className="max-w-md border-sky-400/30 bg-slate-950 text-slate-100" id="settings-device-name" onChange={(event) => onUpdate({ deviceName: event.target.value })} value={draft.deviceName} />
      </SettingRow>
      <SettingRow controlId="settings-time-zone" helpId="timeZone" label="Time zone" note="Used to calculate and show routine backup schedules.">
        <SettingsSelect id="settings-time-zone" value={draft.timeZone} onChange={(value) => onUpdate({ timeZone: value })} options={[['America/Chicago', '(UTC-06:00) Central Time'], ['America/New_York', '(UTC-05:00) Eastern Time'], ['America/Denver', '(UTC-07:00) Mountain Time'], ['America/Los_Angeles', '(UTC-08:00) Pacific Time'], ['UTC', 'UTC']]} />
      </SettingRow>
    </SettingsGroup>
  );
}

function SystemPanel({ checks, copied, doctor, metrics, onCopy, setup, version }: SystemPanelProps) {
  return (
    <SettingsGroup description="Core service behavior and host readiness." title="System">
      <ReadOnlyRow label="Run mode" note={`Active profiles: ${setup?.activeProfiles || 'default'}`} value={setup?.devMode ? 'Development' : 'Production'} />
      <ReadOnlyRow label="Autark-OS version" note={version?.buildSha ? `Build ${shortSha(version.buildSha)}` : 'Build metadata'} value={version?.version || 'Unknown'} />
      <ReadOnlyRow label="Readiness" note={doctor?.readiness.summary || 'First-boot readiness status.'} value={doctor?.readiness.headline || setup?.headline || 'Unknown'} />
      <ReadOnlyRow label="Backend API" note="Frontend API origin." value={apiOrigin(setup)} />
      <ReadOnlyRow label="Runtime folder" note="Where Autark-OS stores app data and local state." value={metrics?.runtimeRoot || 'Unknown'} />
      <div className="mt-5 grid gap-3">
        {checks.map((check) => <SetupCheckRow check={check} copied={copied} key={check.id} onCopy={onCopy} />)}
      </div>
    </SettingsGroup>
  );
}

function NetworkPanel({ setup }: { setup: SystemSetupStatus | null }) {
  return (
    <SettingsGroup description="Review local and private-network availability." title="Network">
      <ReadOnlyRow label="Tailscale" note="Used for private app links." value={setup?.tailscaleVersion || 'Not detected'} />
      <ReadOnlyRow label="Local access URL" note="Base URL used for local web access." value={apiOrigin(setup)} />
    </SettingsGroup>
  );
}

function StoragePanel({ metrics }: { metrics: SystemMetrics | null }) {
  return (
    <SettingsGroup description="Manage storage locations and thresholds." title="Storage">
      <ReadOnlyRow label="Data root" note="Location for app data and persistent storage." value={metrics?.runtimeRoot || 'Unknown'} />
      <ReadOnlyRow label="Runtime disk used" note="Autark-OS data usage on the runtime disk." value={percentLabel(metrics?.runtimeUsedPercent)} />
      <ReadOnlyRow label="Runtime disk free" note="Available space for app data and backups." value={formatBytes(metrics?.runtimeUsableBytes ?? 0)} />
    </SettingsGroup>
  );
}

function BackupsPanel({ apps, backupRoot, backupSchedule, draft, onUpdate }: PanelProps & { apps: AppRuntimeView[]; backupRoot: string | null; backupSchedule: BackupSettingsSummary | null }) {
  const protectedApps = apps.filter((app) => app.canonicalBackupState === 'protected_by_restore_point').length;
  return (
    <SettingsGroup description="Control automatic backup behavior for all app data." title="Backups">
      <SettingRow controlId="settings-automatic-backups" helpId="automaticBackupsEnabled" label="Automatic backups" note="Back up all supported app data on a schedule.">
        <Switch checked={draft.automaticBackupsEnabled} id="settings-automatic-backups" onCheckedChange={(checked) => onUpdate({ automaticBackupsEnabled: checked })} />
      </SettingRow>
      <SettingRow controlId="settings-backup-frequency" helpId="automaticBackupsEnabled" label="Backup frequency" note="How often Autark-OS should create automatic backups.">
        <SettingsSelect id="settings-backup-frequency" value={draft.backupFrequency} onChange={(value) => onUpdate({ backupFrequency: value })} options={[['hourly', 'Hourly'], ['daily', 'Daily'], ['weekly', 'Weekly']]} />
      </SettingRow>
      <SettingRow controlId="settings-backup-time" helpId="automaticBackupsEnabled" label="Backup time" note="Preferred time for scheduled backups.">
        <Input className="max-w-40 border-sky-400/30 bg-slate-950 text-slate-100" id="settings-backup-time" onChange={(event) => onUpdate({ backupTime: event.target.value })} type="time" value={draft.backupTime} />
      </SettingRow>
      <SettingRow controlId="settings-backup-retention" helpId="automaticBackupsEnabled" label="Retention" note="How many days automatic backups should be kept.">
        <Input className="max-w-28 border-sky-400/30 bg-slate-950 text-slate-100" id="settings-backup-retention" max={90} min={1} onChange={(event) => onUpdate({ backupRetentionDays: Number(event.target.value) })} type="number" value={draft.backupRetentionDays} />
      </SettingRow>
      <ReadOnlyRow label="Backup folder" note="Current destination used by routine and manual restore points." value={backupRoot || 'Unavailable'} />
      <ReadOnlyRow label="Next scheduled backup" note={`Shown in ${draft.timeZone}.`} value={<LocalizedDateTime model={{ empty: 'Not scheduled', timeZone: draft.timeZone, value: backupSchedule?.nextRoutineRun }} />} />
      <ReadOnlyRow label="Apps protected" note="Installed apps with at least one completed restore point." value={`${protectedApps}/${apps.length}`} />
    </SettingsGroup>
  );
}

function ApplicationsPanel({ apps, draft, onUpdate }: PanelProps & { apps: AppRuntimeView[] }) {
  const autoRepairApps = apps.filter((app) => settingsForApp(app).autoRepairEnabled ?? true).length;
  return (
    <SettingsGroup description="Configure app defaults and automatic management." title="Applications">
      <SettingRow controlId="settings-automatic-repair" helpId="automaticRepairEnabled" label="Automatic fixes" note="Allow Autark-OS to try safe repairs when apps become unhealthy.">
        <Switch checked={draft.automaticRepairEnabled} id="settings-automatic-repair" onCheckedChange={(checked) => onUpdate({ automaticRepairEnabled: checked })} />
      </SettingRow>
      <ReadOnlyRow label="Repair coverage" note="Installed apps currently allowing automatic fixes." value={`${autoRepairApps}/${apps.length}`} />
      <ReadOnlyRow label="Startup grace" note="Newly started apps get time to boot before warnings appear." value="Enabled" />
    </SettingsGroup>
  );
}

function SecurityPanel({ setup }: { setup: SystemSetupStatus | null }) {
  return (
    <SettingsGroup description="Configure security and access options." title="Security">
      <ReadOnlyRow label="Service user" note="Recommended production user for backend operations." value={setup?.expectedUser || 'autarkos'} />
      <ReadOnlyRow label="Docker socket access" note="Required for Autark-OS to manage containers." value={setup?.dockerVersion ? 'Available' : 'Not detected'} />
    </SettingsGroup>
  );
}

function RemoteAccessPanel({ apps, setup }: { apps: AppRuntimeView[]; setup: SystemSetupStatus | null }) {
  const privateApps = apps.filter((app) => app.settings?.tailscaleEnabled || app.desiredAccess?.mode === 'private' || app.desiredAccess?.mode === 'local-and-private').length;
  return (
    <SettingsGroup description="Configure secure access from your private devices." title="Remote Access">
      <ReadOnlyRow label="Tailscale status" note="Private links require a connected Tailscale device." value={setup?.tailscaleVersion || 'Not detected'} />
      <ReadOnlyRow label="Private apps" note="Apps currently marked for private access." value={`${privateApps}`} />
    </SettingsGroup>
  );
}

function AdvancedPanel({ checks, copied, metrics, onCopy, setup, version }: SystemPanelProps) {
  return (
    <SettingsGroup description="Low-level Autark-OS values for power users." title="Advanced">
      <div className="rounded-lg border border-cyan-300/25 bg-cyan-400/10 p-4 text-sm leading-6 text-cyan-100">
        Advanced details expose host checks, raw paths, and runtime facts for troubleshooting.
      </div>
      <ReadOnlyRow label="Installed version" note={version?.buildDate ? `Built ${version.buildDate}` : 'Current Autark-OS build.'} value={version?.version || 'Unknown'} />
      <ReadOnlyRow label="Build" note="Used when sharing support details." value={version?.buildSha || 'Unknown'} />
      <ReadOnlyRow label="Backend port" note="Local API port." value={setup?.backendPort || '8082'} />
      <ReadOnlyRow label="Install path" note="Where Autark-OS binaries are installed." value={version?.installPath || 'Unknown'} />
      <ReadOnlyRow label="Backend jar" note="Active backend artifact path." value={version?.backendJar || 'Unknown'} />
      <ReadOnlyRow label="Java" note="Backend runtime version." value={metrics?.javaVersion || 'Unknown'} />
      <ReadOnlyRow label="Processors" note="CPU processors visible to Autark-OS." value={`${metrics?.availableProcessors ?? 0}`} />
      <div className="mt-5 grid gap-3">
        {checks.map((check) => <SetupCheckRow check={check} copied={copied} key={check.id} onCopy={onCopy} />)}
      </div>
    </SettingsGroup>
  );
}

function SettingsStatusCard({ icon: Icon, label, tone, value }: { icon: LucideIcon; label: string; tone: 'green' | 'orange' | 'slate' | 'cyan'; value: string }) {
  const tones = {
    cyan: 'border-cyan-300/25 bg-cyan-400/10 text-cyan-100',
    green: 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100',
    orange: 'border-orange-300/30 bg-orange-500/10 text-orange-100',
    slate: 'border-slate-700/60 bg-slate-900/55 text-slate-300',
  };
  return (
    <div className={cn('rounded-lg border p-4', tones[tone])}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase text-current/70">{label}</p>
        <Icon className="size-4" />
      </div>
      <p className="mt-3 line-clamp-2 text-sm font-black text-white">{value}</p>
    </div>
  );
}

type PanelProps = {
  draft: ProjectSettings;
  onUpdate: (update: Partial<ProjectSettings>) => void;
};

type SystemPanelProps = {
  checks: SystemSetupCheck[];
  copied: string | null;
  doctor: SystemDoctorStatus | null;
  metrics: SystemMetrics | null;
  onCopy: (value: string, id: string) => void;
  setup: SystemSetupStatus | null;
  version: ProjectVersionInfo | null;
};

type SettingsPanelBySectionProps = {
  advancedChecks: SystemSetupCheck[];
  apps: AppRuntimeView[];
  backupRoot: string | null;
  backupSchedule: BackupSettingsSummary | null;
  copied: string | null;
  doctor: SystemDoctorStatus | null;
  draft: ProjectSettings;
  metrics: SystemMetrics | null;
  onCopy: (value: string, id: string) => void;
  onUpdate: (update: Partial<ProjectSettings>) => void;
  requiredChecks: SystemSetupCheck[];
  sectionId: SettingsSection;
  setup: SystemSetupStatus | null;
  version: ProjectVersionInfo | null;
};

function SettingsPanelBySection({ advancedChecks, apps, backupRoot, backupSchedule, copied, doctor, draft, metrics, onCopy, onUpdate, requiredChecks, sectionId, setup, version }: SettingsPanelBySectionProps) {
  switch (sectionId) {
    case 'general':
      return <GeneralPanel draft={draft} onUpdate={onUpdate} />;
    case 'system':
      return <SystemPanel checks={requiredChecks} copied={copied} doctor={doctor} metrics={metrics} onCopy={onCopy} setup={setup} version={version} />;
    case 'applications':
      return <ApplicationsPanel apps={apps} draft={draft} onUpdate={onUpdate} />;
    case 'backups':
      return <BackupsPanel apps={apps} backupRoot={backupRoot} backupSchedule={backupSchedule} draft={draft} onUpdate={onUpdate} />;
    case 'storage':
      return <StoragePanel metrics={metrics} />;
    case 'network':
      return <NetworkPanel setup={setup} />;
    case 'remote-access':
      return <RemoteAccessPanel apps={apps} setup={setup} />;
    case 'security':
      return <SecurityPanel setup={setup} />;
    case 'advanced':
      return <AdvancedPanel checks={advancedChecks} copied={copied} doctor={doctor} metrics={metrics} onCopy={onCopy} setup={setup} version={version} />;
    default:
      return null;
  }
}

function SettingsGroup({ children, description, title }: { children: ReactNode; description: string; title: string }) {
  return (
    <SettingsPanel>
      <div className="mb-6">
        <h2 className="text-xl font-black text-white">{title}</h2>
        <p className="mt-2 text-sm text-slate-400">{description}</p>
      </div>
      <SettingsInset className="divide-y divide-sky-400/15 overflow-hidden p-0">
        {children}
      </SettingsInset>
    </SettingsPanel>
  );
}

function SettingRow({ children, controlId, helpId, label, note }: { children: ReactNode; controlId: string; helpId: string; label: string; note: string }) {
  const help = settingHelp[helpId] || settingHelp.deviceName;
  return (
    <div className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(260px,360px)_32px] md:items-center">
      <label htmlFor={controlId}>
        <span className="block text-sm font-bold text-white">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-400">{note}</span>
      </label>
      <div>{children}</div>
      <Popover>
        <PopoverTrigger asChild>
          <button
            aria-label={`About ${label}`}
            className="grid size-8 place-items-center rounded-lg border border-sky-400/25 bg-slate-900 text-sky-100/70 transition hover:border-cyan-300/45 hover:text-cyan-100"
            type="button"
          >
            <HelpCircle data-icon="inline-start" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 border-sky-400/30 bg-slate-900 p-3 text-slate-100 shadow-xl shadow-slate-950/30">
          <PopoverHeader>
            <PopoverTitle className="text-sm">{help.title}</PopoverTitle>
            <PopoverDescription className="text-xs leading-5 text-slate-400">{help.body}</PopoverDescription>
          </PopoverHeader>
          <div className="mt-3 rounded-lg border border-sky-400/25 bg-slate-800 p-3 text-xs text-slate-300">
            <p className="font-bold text-white">Used for</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {help.usedFor.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <p className="mt-3 text-slate-400"><span className="font-bold text-slate-200">Tip:</span> {help.tip}</p>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ReadOnlyRow({ label, note, value }: { label: string; note: string; value: ReactNode }) {
  return (
    <div className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(260px,360px)_32px] md:items-center">
      <div>
        <p className="text-sm font-bold text-white">{label}</p>
        <p className="mt-1 text-xs leading-5 text-slate-400">{note}</p>
      </div>
      <code className="block overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-sky-400/25 bg-slate-950 px-3 py-2 text-sm text-slate-300">{value}</code>
      <span />
    </div>
  );
}

function SettingsSelect({ id, onChange, options, value }: { id: string; onChange: (value: string) => void; options: Array<[string, string]>; value: string }) {
  return (
    <UiSelect onValueChange={onChange} value={value}>
      <SelectTrigger className="h-10 w-full border-sky-400/30 bg-slate-950 text-slate-100" id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="border-sky-400/30 bg-slate-950 text-slate-100 shadow-xl shadow-slate-950/30">
        <SelectGroup>
          {options.map(([optionValue, label]) => (
            <SelectItem className="focus:bg-slate-800 focus:text-white" key={optionValue} value={optionValue}>{label}</SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </UiSelect>
  );
}

function SetupCheckRow({ check, copied, onCopy }: { check: SystemSetupCheck; copied: string | null; onCopy: (value: string, id: string) => void }) {
  const Icon = check.status === 'ok' ? CheckCircle2 : AlertTriangle;
  return (
    <div className={cn('rounded-lg border p-4', check.status === 'ok' ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100' : 'border-orange-300/30 bg-orange-500/10 text-orange-100')}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white">{check.label}</p>
          <p className="mt-1 text-sm text-slate-300">{check.message}</p>
          {check.detail && <p className="mt-2 break-words text-xs text-slate-500">{check.detail}</p>}
          {check.actionCommand && (
            <ProjectDarkControlButton className="mt-3 w-fit" onClick={() => onCopy(check.actionCommand || '', check.id)} size="sm" type="button">
              <Copy className="size-3.5" />
              {copied === check.id ? 'Copied' : check.actionLabel || 'Copy command'}
            </ProjectDarkControlButton>
          )}
        </div>
      </div>
    </div>
  );
}

function settingsForApp(app: AppRuntimeView): InstallSettings {
  return {
    accessUrl: app.settings?.accessUrl || app.accessUrl || null,
    privateAccessUrl: app.settings?.privateAccessUrl || null,
    tailscaleEnabled: Boolean(app.settings?.tailscaleEnabled),
    storageSubfolders: app.settings?.storageSubfolders || {},
    backup: app.settings?.backup || { enabled: true, frequency: 'daily', retention: 7 },
    desiredAccessMode: app.settings?.desiredAccessMode || app.desiredAccess?.mode || null,
    privateAccessRequirement: app.settings?.privateAccessRequirement || app.desiredAccess?.privateAccessRequirement || null,
    expectedLocalPort: app.settings?.expectedLocalPort ?? app.desiredAccess?.expectedLocalPort ?? null,
    expectedProtocol: app.settings?.expectedProtocol || app.desiredAccess?.expectedProtocol || null,
    lastAccessCheckAt: app.settings?.lastAccessCheckAt || null,
    lastSuccessfulAccessAt: app.settings?.lastSuccessfulAccessAt || null,
    lastRepairAttemptAt: app.settings?.lastRepairAttemptAt || null,
    lastRepairStatus: app.settings?.lastRepairStatus || null,
    autoRepairEnabled: app.settings?.autoRepairEnabled ?? true,
  };
}

function apiOrigin(setup: SystemSetupStatus | null) {
  const configured = import.meta.env.VITE_AUTARK_OS_BACKEND_URL as string | undefined;
  if (configured) return configured;
  return `${window.location.protocol}//${window.location.hostname}:${setup?.backendPort || '8082'}`;
}

function percentLabel(value?: number | null) {
  if (value == null || value < 0) return 'Unknown';
  return `${Math.round(value)}% used`;
}

function shortSha(value: string) {
  if (!value || value === 'development' || value === 'unknown') {
    return value || 'unknown';
  }
  return value.length > 12 ? value.slice(0, 12) : value;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}

export default SettingsPage;
