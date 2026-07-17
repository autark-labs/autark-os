import { AlertTriangle, CheckCircle2, Copy, HelpCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { LocalizedDateTime } from '@/components/autark-os/LocalizedDateTime';
import { Input } from '@/components/ui/input';
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
import { ProjectDarkControlButton } from '@/components/primitives/ProjectButtons';
import { ProjectInset, ProjectPanel } from '@/components/primitives/Surface';
import { cn } from '@/lib/utils';
import type { AppRuntimeView, InstallSettings } from '@/types/app';
import type { BackupSettingsSummary } from '@/types/backup';
import type { ProjectSettings, ProjectVersionInfo, SystemDoctorStatus, SystemMetrics, SystemSetupCheck, SystemSetupStatus } from '@/types/system';
import type { SettingsSection } from './SettingsPage.sections';

type SettingHelp = {
  title: string;
  body: string;
  usedFor: string[];
  tip: string;
};

const settingHelp: Record<string, SettingHelp> = {
  deviceName: {
    title: 'Device name',
    body: 'This is the friendly name Autark-OS uses for this homelab device in the interface and generated labels.',
    usedFor: ['Dashboard display', 'Support bundles', 'Network identification', 'Future device discovery'],
    tip: 'Choose a name that is easy to recognize on your network.',
  },
  timeZone: {
    title: 'Time zone',
    body: 'Sets the local time used to calculate and show automatic backup windows.',
    usedFor: ['Backup schedule calculation', 'Backup schedule display'],
    tip: 'Use an IANA time zone like America/Chicago for predictable scheduling.',
  },
  automaticRepairEnabled: {
    title: 'Automatic fixes',
    body: 'Lets Autark-OS attempt safe repairs such as restarting unhealthy apps or rebuilding missing private links.',
    usedFor: ['App guardian loop', 'Application stability', 'Private link repair'],
    tip: 'This updates installed apps now. Individual app overrides still live in Applications.',
  },
  automaticBackupsEnabled: {
    title: 'Automatic backups',
    body: 'Turns routine backup protection on or off for managed apps and updates their default backup policy.',
    usedFor: ['Installed app backup policy', 'Routine backup scheduler', 'Restore point planning'],
    tip: 'Manual backups will remain available even when automatic backups are off.',
  },
};

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

export type SettingsPanelBySectionProps = {
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

export function SettingsPanelBySection({ advancedChecks, apps, backupRoot, backupSchedule, copied, doctor, draft, metrics, onCopy, onUpdate, requiredChecks, sectionId, setup, version }: SettingsPanelBySectionProps) {
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
      <ReadOnlyRow label="Administrator sessions" note="Browser sessions expire after inactivity and end whenever the backend restarts." value="Protected cookie" />
      <ReadOnlyRow label="Lost password" note="Run this command on the Autark-OS server. It preserves apps, settings, and backups." value="sudo autark-os admin reset-password" />
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

function SettingsGroup({ children, description, title }: { children: ReactNode; description: string; title: string }) {
  return (
    <ProjectPanel>
      <div className="mb-6">
        <h2 className="text-xl font-black text-white">{title}</h2>
        <p className="mt-2 text-sm text-slate-400">{description}</p>
      </div>
      <ProjectInset className="divide-y divide-sky-400/15 overflow-hidden p-0">
        {children}
      </ProjectInset>
    </ProjectPanel>
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
          <button aria-label={`About ${label}`} className="grid size-8 place-items-center rounded-lg border border-sky-400/25 bg-slate-900 text-sky-100/70 transition hover:border-cyan-300/45 hover:text-cyan-100" type="button">
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
            <ul className="mt-2 list-disc space-y-1 pl-4">{help.usedFor.map((item) => <li key={item}>{item}</li>)}</ul>
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
      <SelectTrigger className="h-10 w-full border-sky-400/30 bg-slate-950 text-slate-100" id={id}><SelectValue /></SelectTrigger>
      <SelectContent className="border-sky-400/30 bg-slate-950 text-slate-100 shadow-xl shadow-slate-950/30">
        <SelectGroup>{options.map(([optionValue, label]) => <SelectItem className="focus:bg-slate-800 focus:text-white" key={optionValue} value={optionValue}>{label}</SelectItem>)}</SelectGroup>
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
          {check.actionCommand && <ProjectDarkControlButton className="mt-3 w-fit" onClick={() => onCopy(check.actionCommand || '', check.id)} size="sm" type="button"><Copy className="size-3.5" />{copied === check.id ? 'Copied' : check.actionLabel || 'Copy command'}</ProjectDarkControlButton>}
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
  if (!value || value === 'development' || value === 'unknown') return value || 'unknown';
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
