import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  AppWindow,
  CheckCircle2,
  Code2,
  Copy,
  Database,
  Folder,
  Globe2,
  HardDrive,
  HelpCircle,
  KeyRound,
  Laptop,
  Loader2,
  Lock,
  Network,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { BackupAPIClient } from '@/api/BackupAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { SystemAPIClient } from '@/api/SystemAPIClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageErrorState, PageLoadingState } from '@/components/project-os/PageState';
import { PageShell, surfaceFrameClass, surfacePanelClass } from '@/components/project-os/ProjectOSComponents';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
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
import { poButtonClass, poCardClass, poNavItemClass } from '@/lib/projectOsStyleKit';
import { cn } from '@/lib/utils';
import { useApplicationStateRepository } from '@/repositories/applicationStateRepository';
import type { AppRuntimeView, InstallSettings } from '@/types/app';
import type { ProjectSettings, ProjectVersionInfo, SystemDoctorStatus, SystemMetrics, SystemSetupCheck, SystemSetupStatus } from '@/types/system';
import { shouldApplyProjectSettingsToApps } from './SettingsPage.logic';
import { defaultSettingsGroup, sectionsForGroup, settingsGroups as topLevelSettingsGroups } from './SettingsPage.sections';

type SettingsState = {
  backupRoot: string | null;
  doctor: SystemDoctorStatus | null;
  metrics: SystemMetrics | null;
  projectSettings: ProjectSettings | null;
  setup: SystemSetupStatus | null;
  version: ProjectVersionInfo | null;
};

type SettingsSection = 'general' | 'system' | 'network' | 'storage' | 'backups' | 'applications' | 'security' | 'updates' | 'remote-access' | 'advanced';
type SettingsGroupId = 'general' | 'backups' | 'network' | 'advanced';

type SettingHelp = {
  id: string;
  title: string;
  body: string;
  usedFor: string[];
  tip: string;
};

const sections: Array<{ id: SettingsSection; label: string; icon: LucideIcon; description: string }> = [
  { id: 'general', label: 'General', icon: Settings, description: 'Identity and display preferences' },
  { id: 'system', label: 'System', icon: Laptop, description: 'Host and service behavior' },
  { id: 'network', label: 'Network', icon: Globe2, description: 'Local network defaults' },
  { id: 'storage', label: 'Storage', icon: HardDrive, description: 'Data paths and disk warnings' },
  { id: 'backups', label: 'Backups', icon: Database, description: 'Automatic backup defaults' },
  { id: 'applications', label: 'Applications', icon: AppWindow, description: 'Install and repair behavior' },
  { id: 'security', label: 'Security', icon: Lock, description: 'Audit and access posture' },
  { id: 'updates', label: 'Updates', icon: RotateCcw, description: 'Release channel choices' },
  { id: 'remote-access', label: 'Remote Access', icon: Network, description: 'Private access settings' },
  { id: 'advanced', label: 'Advanced', icon: Code2, description: 'Raw system details' },
];

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
    body: 'This is the friendly name Project OS uses for this homelab device in the interface and generated labels.',
    usedFor: ['Dashboard display', 'Support bundles', 'Network identification', 'Future device discovery'],
    tip: 'Choose a name that is easy to recognize on your network.',
  },
  timeZone: {
    id: 'timeZone',
    title: 'Time zone',
    body: 'Controls how Project OS stores scheduling preferences for logs, backups, and future automation windows.',
    usedFor: ['Backup schedule display', 'Activity timestamps', 'Maintenance windows'],
    tip: 'Use an IANA time zone like America/Chicago for predictable scheduling.',
  },
  startOnBoot: {
    id: 'startOnBoot',
    title: 'Start Project OS on boot',
    body: 'Records whether Project OS should be treated as an always-on background service.',
    usedFor: ['Setup checks', 'Production install expectations', 'Future service management'],
    tip: 'Leave this on for a normal homelab appliance experience.',
  },
  automaticRepairEnabled: {
    id: 'automaticRepairEnabled',
    title: 'Automatic fixes',
    body: 'Lets Project OS attempt safe repairs such as restarting unhealthy apps or rebuilding missing private links.',
    usedFor: ['App guardian loop', 'Application stability', 'Private link repair'],
    tip: 'This updates installed apps now. Individual app overrides still live in Applications.',
  },
  automaticBackupsEnabled: {
    id: 'automaticBackupsEnabled',
    title: 'Automatic backups',
    body: 'Turns backup protection on or off for installed apps and stores the global default for future backup scheduling.',
    usedFor: ['Installed app backup policy', 'Future global backup scheduler', 'Restore point planning'],
    tip: 'Manual backups will remain available even when automatic backups are off.',
  },
  defaultInstallAccess: {
    id: 'defaultInstallAccess',
    title: 'Default install access',
    body: 'Stores the preferred access posture for new installs. Manifests can still require stricter behavior for safety.',
    usedFor: ['Marketplace defaults', 'Private access recommendations', 'Future install wizard defaults'],
    tip: 'Manifest default is safest while the catalog is still growing.',
  },
  updateChannel: {
    id: 'updateChannel',
    title: 'Update channel',
    body: 'Controls whether this install should prefer stable releases or preview functionality once update delivery is wired in.',
    usedFor: ['Future update checks', 'Release messaging', 'Support context'],
    tip: 'Use stable unless you are intentionally testing new Project OS features.',
  },
  advancedMetrics: {
    id: 'advancedMetrics',
    title: 'Show advanced metrics',
    body: 'Stores whether advanced resource and host details should be shown by default.',
    usedFor: ['Monitoring defaults', 'Support context', 'Power-user views'],
    tip: 'Keep this off if the interface feels too noisy.',
  },
};

function SettingsPage() {
  const { setProjectSettings } = useProjectSettings();
  const appState = useApplicationStateRepository();
  const [activeGroup, setActiveGroup] = useState<SettingsGroupId>('general');
  const [state, setState] = useState<SettingsState>({ backupRoot: null, doctor: null, metrics: null, projectSettings: null, setup: null, version: null });
  const [draft, setDraft] = useState<ProjectSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function load(background = false) {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const [setup, metrics, projectSettings, version, doctor, backupReport] = await Promise.all([
        SystemAPIClient.setupStatus(),
        SystemAPIClient.metrics(),
        SystemAPIClient.settings(),
        SystemAPIClient.version(),
        SystemAPIClient.doctor(),
        BackupAPIClient.report().catch((backupError) => {
          console.warn('Unable to load backup destination for Settings.', backupError);
          return null;
        }),
      ]);
      setState({ backupRoot: backupReport?.backupRoot ?? null, doctor, metrics, projectSettings, setup, version });
      setDraft(projectSettings);
    } catch (loadError) {
      setError(apiErrorMessage(loadError, 'Settings could not be loaded.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const requiredChecks = useMemo(() => state.setup?.checks?.filter((check) => ['service-user', 'runtime-root', 'docker', 'tailscale', 'tailscale-operator'].includes(check.id)) ?? [], [state.setup]);
  const advancedChecks = useMemo(() => state.setup?.checks?.filter((check) => !requiredChecks.includes(check)) ?? [], [requiredChecks, state.setup]);
  const activeGroupId = defaultSettingsGroup(activeGroup) as SettingsGroupId;
  const activeGroupMeta = topLevelSettingsGroups.find((group) => group.id === activeGroupId) || topLevelSettingsGroups[0];
  const ActiveGroupIcon = groupIcons[activeGroupId];
  const dirty = Boolean(draft && state.projectSettings && JSON.stringify(draft) !== JSON.stringify(state.projectSettings));

  async function copy(value: string, id: string) {
    await navigator.clipboard.writeText(value);
    setCopied(id);
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
    setError(null);
    setMessage(null);
    try {
      const previous = state.projectSettings;
      const saved = await SystemAPIClient.updateSettings(draft);
      if (shouldApplyProjectSettingsToApps(previous, saved)) {
        await SystemAPIClient.applyAppDefaults(saved);
        await appState.refresh();
      }
      setState((current) => ({ ...current, projectSettings: saved }));
      setDraft(saved);
      setProjectSettings(saved);
      setMessage('Settings saved.');
    } catch (saveError) {
      setError(apiErrorMessage(saveError, 'Settings could not be saved.'));
    } finally {
      setSaving(false);
    }
  }

  if (loading || appState.isLoading || !draft) {
    return (
      <PageLoadingState label="Loading settings" sublabel="Reading appliance preferences, setup checks, and app defaults." />
    );
  }

  return (
    <PageShell className="po-page-tall" maxWidth="max-w-po-page-wide">
      <header className={surfaceFrameClass}>
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 bg-po-hero-settings p-6 md:p-7">
        <div>
          <p className="text-xs font-black uppercase tracking-normal text-violet-300">Settings</p>
          <h1 className="mt-2 text-3xl font-black leading-tight text-white md:text-4xl">Project OS controls</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Direct controls for this appliance: identity, services, app defaults, backups, updates, and advanced host details.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={cn('border', dirty ? 'border-amber-300/25 bg-amber-500/10 text-amber-100' : 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100')}>
            {dirty ? 'Unsaved changes' : 'Saved'}
          </Badge>
          <Button className={poButtonClass('quiet')} disabled={refreshing} onClick={() => void load(true)} type="button" variant="outline">
            <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
            Refresh
          </Button>
          <Button className={poButtonClass('primary')} disabled={!dirty || saving} onClick={() => void save()} type="button">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {saving ? 'Saving' : 'Save changes'}
          </Button>
        </div>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-3">
          <SettingsStatusCard icon={CheckCircle2} label="Save state" tone={dirty ? 'amber' : 'green'} value={dirty ? 'Review changes' : 'No pending changes'} />
          <SettingsStatusCard icon={ShieldCheck} label="Setup" tone={state.setup?.status === 'ready' ? 'green' : 'amber'} value={state.setup?.headline || 'Setup status unavailable'} />
          <SettingsStatusCard icon={ActiveGroupIcon} label="Selected" tone={activeGroupId === 'advanced' ? 'violet' : 'slate'} value={activeGroupMeta.label} />
        </div>
      </header>

      {error && <PageErrorState message={error} onRetry={() => void load(true)} title="Settings could not refresh" />}
      {message && <div className="rounded-lg border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</div>}

      <nav className={cn(surfacePanelClass, 'grid gap-2 bg-slate-950/55 p-2 sm:grid-cols-2 xl:grid-cols-4')}>
        {topLevelSettingsGroups.map((group) => {
          const groupId = group.id as SettingsGroupId;
          const Icon = groupIcons[groupId];
          const active = activeGroupId === group.id;
          return (
            <button
              className={poNavItemClass(active)}
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
      </nav>

      <div className="grid gap-5">
        <main className={cn(surfacePanelClass, 'bg-slate-950/60 shadow-po-panel')}>
          <div className={poCardClass('normal', 'mb-5 bg-slate-900/40')}>
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-violet-300/20 bg-violet-500/10 text-violet-200">
                <ActiveGroupIcon className="size-4" />
              </span>
              <div>
                <h2 className="text-lg font-black text-white">{activeGroupMeta.label}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-400">{activeGroupMeta.description}</p>
              </div>
            </div>
          </div>
          <div className="grid gap-5">
            {sectionsForGroup(activeGroupId).map((sectionId) => (
              <SettingsPanelBySection
                advancedChecks={advancedChecks}
                apps={appState.apps}
                backupRoot={state.backupRoot}
                copied={copied}
                doctor={state.doctor}
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
        </main>
      </div>
    </PageShell>
  );
}

function GeneralPanel({ draft, onUpdate }: PanelProps) {
  return (
    <SettingsGroup description="Basic system settings and preferences." title="General">
      <SettingRow helpId="deviceName" label="Device name" note="This name is used to identify your device on the network.">
        <Input className="max-w-md border-slate-700 bg-slate-950/70 text-slate-100" onChange={(event) => onUpdate({ deviceName: event.target.value })} value={draft.deviceName} />
      </SettingRow>
      <SettingRow helpId="timeZone" label="Time zone" note="Used for system services, logs, and backup schedules.">
        <SettingsSelect value={draft.timeZone} onChange={(value) => onUpdate({ timeZone: value })} options={[['America/Chicago', '(UTC-06:00) Central Time'], ['America/New_York', '(UTC-05:00) Eastern Time'], ['America/Denver', '(UTC-07:00) Mountain Time'], ['America/Los_Angeles', '(UTC-08:00) Pacific Time'], ['UTC', 'UTC']]} />
      </SettingRow>
      <SettingRow helpId="language" label="Language" note="Select the language for the Project OS interface.">
        <SettingsSelect value={draft.language} onChange={(value) => onUpdate({ language: value })} options={[['en-US', 'English (US)'], ['en-GB', 'English (UK)']]} />
      </SettingRow>
      <SettingRow helpId="temperatureUnit" label="Temperature unit" note="Preferred unit for temperature displays.">
        <SettingsSelect value={draft.temperatureUnit} onChange={(value) => onUpdate({ temperatureUnit: value })} options={[['fahrenheit', 'Fahrenheit (°F)'], ['celsius', 'Celsius (°C)']]} />
      </SettingRow>
      <SettingRow helpId="dateFormat" label="Date format" note="Choose how dates are displayed.">
        <SettingsSelect value={draft.dateFormat} onChange={(value) => onUpdate({ dateFormat: value })} options={[['MMM d, yyyy', 'Jan 5, 2026'], ['yyyy-MM-dd', '2026-01-05'], ['MM/dd/yyyy', '01/05/2026']]} />
      </SettingRow>
      <SettingRow helpId="timeFormat" label="Time format" note="Choose 12 or 24 hour time format.">
        <SettingsSelect value={draft.timeFormat} onChange={(value) => onUpdate({ timeFormat: value })} options={[['12-hour', '12-hour'], ['24-hour', '24-hour']]} />
      </SettingRow>
    </SettingsGroup>
  );
}

function SystemPanel({ checks, copied, doctor, metrics, onCopy, onUpdate, settings, setup, version }: SystemPanelProps) {
  return (
    <SettingsGroup description="Core service behavior and host readiness." title="System">
      <SettingRow helpId="startOnBoot" label="Start Project OS on boot" note="Automatically start Project OS services when the system boots.">
        <Switch checked={settings.startOnBoot} onCheckedChange={(checked) => onUpdate({ startOnBoot: checked })} />
      </SettingRow>
      <ReadOnlyRow label="Run mode" note={`Active profiles: ${setup?.activeProfiles || 'default'}`} value={setup?.devMode ? 'Development' : 'Production'} />
      <ReadOnlyRow label="Project OS version" note={version?.buildSha ? `Build ${shortSha(version.buildSha)}` : 'Build metadata'} value={version?.version || 'Unknown'} />
      <ReadOnlyRow label="Readiness" note={doctor?.readiness.summary || 'First-boot readiness status.'} value={doctor?.readiness.headline || setup?.headline || 'Unknown'} />
      <ReadOnlyRow label="Backend API" note="Frontend API origin." value={apiOrigin(setup)} />
      <ReadOnlyRow label="Runtime folder" note="Where Project OS stores app data and local state." value={metrics?.runtimeRoot || 'Unknown'} />
      <div className="mt-5 grid gap-3">
        {checks.map((check) => <SetupCheckRow check={check} copied={copied} key={check.id} onCopy={onCopy} />)}
      </div>
    </SettingsGroup>
  );
}

function NetworkPanel({ draft, onUpdate, setup }: PanelProps & { setup: SystemSetupStatus | null }) {
  return (
    <SettingsGroup description="Configure network behavior and local service defaults." title="Network">
      <ReadOnlyRow label="Tailscale" note="Used for private app links." value={setup?.tailscaleVersion || 'Not detected'} />
      <SettingRow helpId="defaultInstallAccess" label="Default install access" note="Preferred access posture for new app installs.">
        <SettingsSelect value={draft.defaultInstallAccess} onChange={(value) => onUpdate({ defaultInstallAccess: value })} options={[['manifest-default', 'Manifest default'], ['local', 'Local only'], ['private', 'Private network'], ['local-and-private', 'Local and private']]} />
      </SettingRow>
      <ReadOnlyRow label="Hostname (mDNS)" note="Local hostname for network discovery." value={draft.deviceName.toLowerCase().replaceAll(' ', '-') + '.local'} />
      <ReadOnlyRow label="Local access URL" note="Base URL used for local web access." value={apiOrigin(setup)} />
    </SettingsGroup>
  );
}

function StoragePanel({ metrics }: { metrics: SystemMetrics | null }) {
  return (
    <SettingsGroup description="Manage storage locations and thresholds." title="Storage">
      <ReadOnlyRow label="Data root" note="Location for app data and persistent storage." value={metrics?.runtimeRoot || 'Unknown'} />
      <ReadOnlyRow label="Runtime disk used" note="Project OS data usage on the runtime disk." value={percentLabel(metrics?.runtimeUsedPercent)} />
      <ReadOnlyRow label="Runtime disk free" note="Available space for app data and backups." value={formatBytes(metrics?.runtimeUsableBytes ?? 0)} />
      <SettingRow helpId="advancedMetrics" label="Show advanced disk info" note="Show detailed disk usage and filesystem information.">
        <Badge className="border-slate-700 bg-slate-950 text-slate-300">Coming soon</Badge>
      </SettingRow>
    </SettingsGroup>
  );
}

function BackupsPanel({ apps, backupRoot, draft, onUpdate }: PanelProps & { apps: AppRuntimeView[]; backupRoot: string | null }) {
  const protectedApps = apps.filter((app) => settingsForApp(app).backup.enabled).length;
  return (
    <SettingsGroup description="Control automatic backup behavior for all app data." title="Backups">
      <SettingRow helpId="automaticBackupsEnabled" label="Automatic backups" note="Back up all supported app data on a schedule.">
        <Switch checked={draft.automaticBackupsEnabled} onCheckedChange={(checked) => onUpdate({ automaticBackupsEnabled: checked })} />
      </SettingRow>
      <SettingRow helpId="automaticBackupsEnabled" label="Backup frequency" note="How often Project OS should create automatic backups.">
        <SettingsSelect value={draft.backupFrequency} onChange={(value) => onUpdate({ backupFrequency: value })} options={[['hourly', 'Hourly'], ['daily', 'Daily'], ['weekly', 'Weekly']]} />
      </SettingRow>
      <SettingRow helpId="automaticBackupsEnabled" label="Backup time" note="Preferred time for scheduled backups.">
        <Input className="max-w-40 border-slate-700 bg-slate-950/70 text-slate-100" onChange={(event) => onUpdate({ backupTime: event.target.value })} type="time" value={draft.backupTime} />
      </SettingRow>
      <SettingRow helpId="automaticBackupsEnabled" label="Retention" note="How many days automatic backups should be kept.">
        <Input className="max-w-28 border-slate-700 bg-slate-950/70 text-slate-100" max={90} min={1} onChange={(event) => onUpdate({ backupRetentionDays: Number(event.target.value) })} type="number" value={draft.backupRetentionDays} />
      </SettingRow>
      <ReadOnlyRow label="Backup folder" note="Current destination used by routine and manual restore points." value={backupRoot || 'Unavailable'} />
      <ReadOnlyRow label="Protected apps" note="Installed apps that currently have backup protection enabled." value={`${protectedApps}/${apps.length}`} />
    </SettingsGroup>
  );
}

function ApplicationsPanel({ apps, draft, onUpdate }: PanelProps & { apps: AppRuntimeView[] }) {
  const autoRepairApps = apps.filter((app) => settingsForApp(app).autoRepairEnabled ?? true).length;
  return (
    <SettingsGroup description="Configure app defaults and automatic management." title="Applications">
      <SettingRow helpId="automaticRepairEnabled" label="Automatic fixes" note="Allow Project OS to try safe repairs when apps become unhealthy.">
        <Switch checked={draft.automaticRepairEnabled} onCheckedChange={(checked) => onUpdate({ automaticRepairEnabled: checked })} />
      </SettingRow>
      <ReadOnlyRow label="Repair coverage" note="Installed apps currently allowing automatic fixes." value={`${autoRepairApps}/${apps.length}`} />
      <ReadOnlyRow label="Startup grace" note="Newly started apps get time to boot before warnings appear." value="Enabled" />
    </SettingsGroup>
  );
}

function SecurityPanel({ draft, onUpdate, setup }: PanelProps & { setup: SystemSetupStatus | null }) {
  return (
    <SettingsGroup description="Configure security and access options." title="Security">
      <ReadOnlyRow label="Service user" note="Recommended production user for backend operations." value={setup?.expectedUser || 'projectos'} />
      <SettingRow helpId="advancedMetrics" label="Audit logging" note="Record important system and user actions.">
        <Switch checked={draft.showAdvancedMetrics} onCheckedChange={(checked) => onUpdate({ showAdvancedMetrics: checked })} />
      </SettingRow>
      <ReadOnlyRow label="Docker socket access" note="Required for Project OS to manage containers." value={setup?.dockerVersion ? 'Available' : 'Not detected'} />
    </SettingsGroup>
  );
}

function UpdatesPanel({ draft, onUpdate, version }: PanelProps & { version: ProjectVersionInfo | null }) {
  return (
    <SettingsGroup description="Choose how Project OS should handle future updates." title="Updates">
      <ReadOnlyRow label="Installed version" note={version?.buildDate ? `Built ${version.buildDate}` : 'Current Project OS build.'} value={version?.version || 'Unknown'} />
      <ReadOnlyRow label="Build" note="Used when sharing support details." value={version?.buildSha || 'Unknown'} />
      <SettingRow helpId="updateChannel" label="Update channel" note="Choose stable releases or preview functionality.">
        <SettingsSelect value={draft.updateChannel} onChange={(value) => onUpdate({ updateChannel: value })} options={[['stable', 'Stable'], ['preview', 'Preview']]} />
      </SettingRow>
      <ReadOnlyRow label="Update checks" note={version?.updateMessage || 'Update delivery is not implemented yet.'} value={version?.updateStatus === 'unavailable' ? 'Unavailable until signed releases exist' : humanize(version?.updateStatus || 'unknown')} />
    </SettingsGroup>
  );
}

function RemoteAccessPanel({ apps, draft, onUpdate, setup }: PanelProps & { apps: AppRuntimeView[]; setup: SystemSetupStatus | null }) {
  const privateApps = apps.filter((app) => app.settings?.tailscaleEnabled || app.desiredAccess?.mode === 'private' || app.desiredAccess?.mode === 'local-and-private').length;
  return (
    <SettingsGroup description="Configure secure access from your private devices." title="Remote Access">
      <ReadOnlyRow label="Tailscale status" note="Private links require a connected Tailscale device." value={setup?.tailscaleVersion || 'Not detected'} />
      <ReadOnlyRow label="Private apps" note="Apps currently marked for private access." value={`${privateApps}`} />
      <SettingRow helpId="defaultInstallAccess" label="Prefer private installs" note="Set default install access to private network.">
        <Switch checked={draft.defaultInstallAccess === 'private'} onCheckedChange={(checked) => onUpdate({ defaultInstallAccess: checked ? 'private' : 'manifest-default' })} />
      </SettingRow>
    </SettingsGroup>
  );
}

function AdvancedPanel({ checks, copied, metrics, onCopy, onUpdate, settings, setup, version }: SystemPanelProps) {
  return (
    <SettingsGroup description="Low-level Project OS values for power users." title="Advanced">
      <div className="rounded-lg border border-violet-300/20 bg-violet-500/10 p-4 text-sm leading-6 text-violet-100">
        Advanced settings expose host details, raw paths, and instrumentation defaults. Keep these available for troubleshooting, but change them intentionally.
      </div>
      <SettingRow helpId="advancedMetrics" label="Show advanced metrics" note="Default advanced instrumentation visibility.">
        <Switch checked={settings.showAdvancedMetrics} onCheckedChange={(checked) => onUpdate({ showAdvancedMetrics: checked })} />
      </SettingRow>
      <ReadOnlyRow label="Backend port" note="Local API port." value={setup?.backendPort || '8082'} />
      <ReadOnlyRow label="Install path" note="Where Project OS binaries are installed." value={version?.installPath || 'Unknown'} />
      <ReadOnlyRow label="Backend jar" note="Active backend artifact path." value={version?.backendJar || 'Unknown'} />
      <ReadOnlyRow label="Java" note="Backend runtime version." value={metrics?.javaVersion || 'Unknown'} />
      <ReadOnlyRow label="Processors" note="CPU processors visible to Project OS." value={`${metrics?.availableProcessors ?? 0}`} />
      <div className="mt-5 grid gap-3">
        {checks.map((check) => <SetupCheckRow check={check} copied={copied} key={check.id} onCopy={onCopy} />)}
      </div>
    </SettingsGroup>
  );
}

function SettingsStatusCard({ icon: Icon, label, tone, value }: { icon: LucideIcon; label: string; tone: 'green' | 'amber' | 'slate' | 'violet'; value: string }) {
  const tones = {
    amber: 'border-amber-300/20 bg-amber-500/10 text-amber-100',
    green: 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100',
    slate: 'border-slate-700/60 bg-slate-900/55 text-slate-300',
    violet: 'border-violet-300/20 bg-violet-500/10 text-violet-100',
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

type SystemPanelProps = PanelProps & {
  checks: SystemSetupCheck[];
  copied: string | null;
  doctor: SystemDoctorStatus | null;
  metrics: SystemMetrics | null;
  onCopy: (value: string, id: string) => void;
  settings: ProjectSettings;
  setup: SystemSetupStatus | null;
  version: ProjectVersionInfo | null;
};

type SettingsPanelBySectionProps = {
  advancedChecks: SystemSetupCheck[];
  apps: AppRuntimeView[];
  backupRoot: string | null;
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

function SettingsPanelBySection({ advancedChecks, apps, backupRoot, copied, doctor, draft, metrics, onCopy, onUpdate, requiredChecks, sectionId, setup, version }: SettingsPanelBySectionProps) {
  switch (sectionId) {
    case 'general':
      return <GeneralPanel draft={draft} onUpdate={onUpdate} />;
    case 'system':
      return <SystemPanel checks={requiredChecks} copied={copied} doctor={doctor} draft={draft} metrics={metrics} onCopy={onCopy} onUpdate={onUpdate} settings={draft} setup={setup} version={version} />;
    case 'applications':
      return <ApplicationsPanel apps={apps} draft={draft} onUpdate={onUpdate} />;
    case 'backups':
      return <BackupsPanel apps={apps} backupRoot={backupRoot} draft={draft} onUpdate={onUpdate} />;
    case 'storage':
      return <StoragePanel metrics={metrics} />;
    case 'network':
      return <NetworkPanel draft={draft} onUpdate={onUpdate} setup={setup} />;
    case 'remote-access':
      return <RemoteAccessPanel apps={apps} draft={draft} onUpdate={onUpdate} setup={setup} />;
    case 'security':
      return <SecurityPanel draft={draft} onUpdate={onUpdate} setup={setup} />;
    case 'updates':
      return <UpdatesPanel draft={draft} onUpdate={onUpdate} version={version} />;
    case 'advanced':
      return <AdvancedPanel checks={advancedChecks} copied={copied} doctor={doctor} draft={draft} metrics={metrics} onCopy={onCopy} onUpdate={onUpdate} settings={draft} setup={setup} version={version} />;
    default:
      return null;
  }
}

function SettingsGroup({ children, description, title }: { children: ReactNode; description: string; title: string }) {
  return (
    <section>
      <div className="mb-6">
        <h2 className="text-xl font-black text-white">{title}</h2>
        <p className="mt-2 text-sm text-slate-400">{description}</p>
      </div>
      <div className={poCardClass('normal', 'divide-y divide-white/10 p-0')}>
        {children}
      </div>
    </section>
  );
}

function SettingRow({ children, helpId, label, note }: { children: ReactNode; helpId: string; label: string; note: string }) {
  const help = settingHelp[helpId] || settingHelp.deviceName;
  return (
    <div className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(260px,360px)_32px] md:items-center">
      <div>
        <p className="text-sm font-bold text-white">{label}</p>
        <p className="mt-1 text-xs leading-5 text-slate-400">{note}</p>
      </div>
      <div>{children}</div>
      <Popover>
        <PopoverTrigger asChild>
          <Button aria-label={`About ${label}`} className="text-slate-500 hover:text-violet-200" size="icon" type="button" variant="ghost">
            <HelpCircle data-icon="inline-start" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 border-po-border bg-po-surface-elevated p-3 text-po-text shadow-po-lg">
          <PopoverHeader>
            <PopoverTitle className="text-sm">{help.title}</PopoverTitle>
            <PopoverDescription className="text-xs leading-5 text-po-text-muted">{help.body}</PopoverDescription>
          </PopoverHeader>
          <div className="mt-3 rounded-po-sm border border-po-border bg-po-surface-inset p-3 text-xs text-po-text-secondary">
            <p className="font-bold text-po-text">Used for</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {help.usedFor.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <p className="mt-3 text-po-text-muted"><span className="font-bold text-po-text-secondary">Tip:</span> {help.tip}</p>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ReadOnlyRow({ label, note, value }: { label: string; note: string; value: string }) {
  return (
    <div className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(260px,360px)_32px] md:items-center">
      <div>
        <p className="text-sm font-bold text-white">{label}</p>
        <p className="mt-1 text-xs leading-5 text-slate-400">{note}</p>
      </div>
      <code className="block overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-300">{value}</code>
      <span />
    </div>
  );
}

function SettingsSelect({ onChange, options, value }: { onChange: (value: string) => void; options: Array<[string, string]>; value: string }) {
  return (
    <UiSelect onValueChange={onChange} value={value}>
      <SelectTrigger className="h-10 w-full border-slate-700 bg-slate-950/70 text-slate-100">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="border-slate-700 bg-slate-950 text-slate-100">
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
    <div className={cn('rounded-lg border p-4', check.status === 'ok' ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100' : 'border-amber-300/20 bg-amber-500/10 text-amber-100')}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white">{check.label}</p>
          <p className="mt-1 text-sm text-slate-300">{check.message}</p>
          {check.detail && <p className="mt-2 break-words text-xs text-slate-500">{check.detail}</p>}
          {check.actionCommand && (
            <Button className={poButtonClass('quiet', 'mt-3 w-fit')} onClick={() => onCopy(check.actionCommand || '', check.id)} size="sm" type="button" variant="outline">
              <Copy className="size-3.5" />
              {copied === check.id ? 'Copied' : check.actionLabel || 'Copy command'}
            </Button>
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
  const configured = import.meta.env.VITE_PROJECT_OS_BACKEND_URL as string | undefined;
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

function humanize(value: string) {
  return value.replaceAll('-', ' ').replaceAll('_', ' ');
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
