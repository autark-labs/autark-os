import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { DisabledAction } from '@/components/project-os/DisabledAction';
import { AlertTriangle, Archive, CheckCircle2, Cpu, ExternalLink, HardDrive, Network, Save, ShieldCheck, SlidersHorizontal, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InstalledAppsAPIClient } from '@/api/InstalledAppsAPIClient';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { useAppTelemetryQuery } from '@/repositories/appManagementRepository';
import type { AppAccessCheck, AppHealthSnapshot, AppRuntimeView, AppSettingsChangePlan, AppTelemetry, InstallSettings } from '@/types/app';
import type { PrivateAccessReconciliationItem } from '@/types/network';
import { AppIcon, Diagnostic } from './ApplicationsPage.shared';
import { ApplicationsStabilityTab } from './ApplicationsStabilityTab';
import { ApplicationsSetupGuide } from './ApplicationsSetupGuide';
import { ApplicationsUsageGuide } from './ApplicationsUsageGuide';
import { errorMessage, formatDate, percentFromTelemetry } from './extensions/ApplicationsPage.logic';
import { settingsFromApp, settingsPayload, storageRowsFromSettings } from './extensions/ApplicationsPage.settings';
import type { AppAction, StorageRow } from './extensions/ApplicationsPage.types';

type ManageAppDialogProps = {
  access?: AppAccessCheck;
  app: AppRuntimeView;
  health?: AppHealthSnapshot | null;
  open: boolean;
  onAction: (action: AppAction) => void;
  onOpenChange: (open: boolean) => void;
  onSave: (appId: string, settings: InstallSettings) => Promise<AppRuntimeView>;
  reconciliation?: PrivateAccessReconciliationItem | null;
};

export function ManageAppDialog({ access, app, health, onAction, open, onOpenChange, onSave, reconciliation }: ManageAppDialogProps) {
  const { showAdvancedMetrics } = useProjectSettings();
  const [settings, setSettings] = useState(() => settingsFromApp(app));
  const [storageRows, setStorageRows] = useState(() => storageRowsFromSettings(app.settings));
  const [changePlan, setChangePlan] = useState<AppSettingsChangePlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializedAppId = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      initializedAppId.current = null;
      return;
    }
    if (initializedAppId.current === app.appId) {
      return;
    }
    initializedAppId.current = app.appId;
    setSettings(settingsFromApp(app));
    setStorageRows(storageRowsFromSettings(app.settings));
    setChangePlan(null);
    setError(null);
  }, [app, open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setPlanning(true);
      try {
        const plan = await InstalledAppsAPIClient.settingsChangePlan(app.appId, settingsPayload(settings, storageRows));
        if (!cancelled) {
          setChangePlan(plan);
        }
      } catch (err) {
        if (!cancelled) {
          setChangePlan(null);
          setError(errorMessage(err));
        }
      } finally {
        if (!cancelled) {
          setPlanning(false);
        }
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [app.appId, open, settings, storageRows]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(app.appId, settingsPayload(settings, storageRows));
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function updateAutoRepair(enabled: boolean) {
    const nextSettings = { ...settings, autoRepairEnabled: enabled };
    setSettings(nextSettings);
    setSaving(true);
    setError(null);
    try {
      const updatedApp = await onSave(app.appId, settingsPayload(nextSettings, storageRows));
      setSettings(settingsFromApp(updatedApp));
      setStorageRows(storageRowsFromSettings(updatedApp.settings));
    } catch (err) {
      setSettings((current) => ({ ...current, autoRepairEnabled: !enabled }));
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function updateStorageRow(index: number, field: keyof StorageRow, value: string) {
    setStorageRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row));
  }

  function addStorageRow() {
    setStorageRows((current) => [...current, { key: 'data', value: '' }]);
  }

  function removeStorageRow(index: number) {
    setStorageRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  const telemetryQuery = useAppTelemetryQuery(app.appId, open, app.telemetry);
  const liveTelemetry = telemetryQuery.data || app.telemetry;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[88vh] overflow-hidden border-slate-700 bg-slate-950 p-0 text-slate-100 sm:max-w-4xl">
        <form className="flex h-full min-h-0 flex-col" onSubmit={save}>
          <DialogHeader className="shrink-0 px-4 pb-0 pt-4 pr-12">
            <DialogTitle className="flex items-center gap-3 text-white">
              <AppIcon app={app} />
              Manage {app.appName}
            </DialogTitle>
            <DialogDescription className="text-slate-400">Update app preferences and check current resource use.</DialogDescription>
          </DialogHeader>

          {error && (
            <div className="mx-4 mt-4 flex shrink-0 items-center gap-3 rounded-lg border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">
              <AlertTriangle className="size-4" />
              {error}
            </div>
          )}

          <Tabs className="mt-5 min-h-0 flex-1 gap-0 overflow-hidden" defaultValue="settings">
            <TabsList className="z-10 w-full justify-start overflow-x-auto border-b border-slate-700/30 bg-slate-950 px-4 py-2" variant="line">
              {app.usageGuide && app.usageGuide.kind !== 'web-app' && <TabsTrigger className="px-3 py-2 text-slate-400 data-active:text-white" value="use">Use</TabsTrigger>}
              {hasSetupGuide(app) && <TabsTrigger className="px-3 py-2 text-slate-400 data-active:text-white" value="setup">Setup</TabsTrigger>}
              <TabsTrigger className="px-3 py-2 text-slate-400 data-active:text-white" value="settings">Settings</TabsTrigger>
              <TabsTrigger className="px-3 py-2 text-slate-400 data-active:text-white" value="stability">Stability</TabsTrigger>
              <TabsTrigger className="px-3 py-2 text-slate-400 data-active:text-white" value="telemetry">Resource Usage</TabsTrigger>
              {showAdvancedMetrics && <TabsTrigger className="px-3 py-2 text-slate-400 data-active:text-white" value="app-config">Advanced</TabsTrigger>}
            </TabsList>

            {app.usageGuide && app.usageGuide.kind !== 'web-app' && (
              <TabsContent className="grid min-h-0 gap-4 overflow-y-auto px-4 py-4" value="use">
                <ApplicationsUsageGuide guide={app.usageGuide} />
              </TabsContent>
            )}

            {hasSetupGuide(app) && app.setupGuide && (
              <TabsContent className="grid min-h-0 gap-4 overflow-y-auto px-4 py-4" value="setup">
                <ApplicationsSetupGuide guide={app.setupGuide} />
              </TabsContent>
            )}

            <TabsContent className="grid min-h-0 gap-4 overflow-y-auto px-4 py-4" value="settings">
              <section className="grid gap-4 rounded-lg border border-slate-700/30 bg-slate-900/60 p-4">
                <div className="flex items-start gap-3">
                  <SlidersHorizontal className="mt-1 size-4 text-violet-300" />
                  <div>
                    <h4 className="font-bold text-white">App address</h4>
                    <p className="mt-1 text-sm text-slate-400">The link used when you open this app from Project OS.</p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label className="text-slate-300" htmlFor="manage-access-url">Access URL</Label>
                    <Input className="border-slate-700 bg-slate-950/70 text-slate-100" id="manage-access-url" onChange={(event) => setSettings((current) => ({ ...current, accessUrl: event.target.value }))} placeholder="http://localhost:8090" value={settings.accessUrl ?? ''} />
                  </div>
                  <div className="grid gap-2 rounded-lg border border-slate-700/30 bg-slate-950/45 p-3">
                    <span>
                      <span className="block text-sm font-semibold text-white">Private access</span>
                      <span className="block text-xs text-slate-500">{settings.tailscaleEnabled ? 'Managed from Access.' : 'Local access only right now.'}</span>
                    </span>
                  </div>
                  <div className="grid gap-3 rounded-lg border border-violet-300/20 bg-violet-500/10 p-3 sm:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-sm font-semibold text-white">
                          <ShieldCheck className="size-4 text-violet-200" />
                          Access owns private links
                        </span>
                        <span className="mt-1 block text-xs text-slate-400">Use Access to turn private access on or off, repair Tailscale links, copy private URLs, and review exposure.</span>
                        {settings.privateAccessUrl && <span className="mt-2 block break-all text-xs text-violet-100">{settings.privateAccessUrl}</span>}
                      </span>
                      <Button asChild className="border-violet-300/30 bg-slate-950/50 text-violet-100 hover:bg-slate-900" type="button" variant="outline">
                        <Link to="/access">
                          <ExternalLink className="size-4" />
                          Open Access
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid gap-4 rounded-lg border border-slate-700/30 bg-slate-900/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-white">Backups</h4>
                    <p className="mt-1 text-sm text-slate-400">Routine backup timing is managed globally from the Backups page. You can still create a manual backup for this app there.</p>
                  </div>
                </div>
                <div className="grid gap-3 rounded-lg border border-slate-700/30 bg-slate-950/45 p-3 text-sm text-slate-300">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span>Automatic backup protection</span>
                    <span className="font-semibold text-white">{settings.backup.enabled ? 'Included' : 'Off for this app'}</span>
                  </div>
                  <p className="text-xs leading-5 text-slate-500">
                    Project OS now treats automatic backups as a simple all-or-nothing system behavior. Use Backups to run full backups, create manual app backups, or restore app data.
                  </p>
                  <Button asChild className="w-fit border-slate-700/50 bg-slate-950/50 text-slate-200 hover:bg-slate-800" type="button" variant="outline">
                    <Link to="/backups">
                      <ExternalLink className="size-4" />
                      Open Backups
                    </Link>
                  </Button>
                </div>
              </section>

              <section className="grid gap-4 rounded-lg border border-slate-700/30 bg-slate-900/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-white">Storage folders</h4>
                    <p className="mt-1 text-sm text-slate-400">Folder names for app data. You can leave these as defaults.</p>
                  </div>
                  <Button className="border-slate-700/50 bg-slate-950/50 text-slate-200 hover:bg-slate-800" onClick={addStorageRow} type="button" variant="outline">Add Folder</Button>
                </div>
                <div className="grid gap-2">
                  {storageRows.map((row, index) => (
                    <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)_auto]" key={`${row.key}-${index}`}>
                      <Input className="border-slate-700 bg-slate-950/70 text-slate-100" onChange={(event) => updateStorageRow(index, 'key', event.target.value)} placeholder="data" value={row.key} />
                      <Input className="border-slate-700 bg-slate-950/70 text-slate-100" onChange={(event) => updateStorageRow(index, 'value', event.target.value)} placeholder="vault-data" value={row.value} />
                      <Button className="border-slate-700/50 bg-slate-950/50 text-slate-200 hover:bg-slate-800" onClick={() => removeStorageRow(index)} type="button" variant="outline">Remove</Button>
                    </div>
                  ))}
                  {storageRows.length === 0 && <p className="text-sm text-slate-500">This app is using the default folder names.</p>}
                </div>
              </section>

              <SettingsChangePlanCard plan={changePlan} planning={planning} />
            </TabsContent>

            <TabsContent className="grid min-h-0 gap-4 overflow-y-auto px-4 py-4" value="stability">
              <ApplicationsStabilityTab
                access={access}
                app={app}
                autoRepairEnabled={settings.autoRepairEnabled}
                health={health}
                onAction={onAction}
                onAutoRepairChange={updateAutoRepair}
                reconciliation={reconciliation}
                saving={saving}
                telemetry={liveTelemetry}
              />
            </TabsContent>

            <TabsContent className="grid min-h-0 gap-4 overflow-y-auto px-4 py-4" value="telemetry">
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <TelemetryCard icon={Cpu} label="CPU" percent={percentFromTelemetry(liveTelemetry?.cpuPercent)} value={liveTelemetry?.cpuPercent || 'Unavailable'} />
                <TelemetryCard icon={HardDrive} label="Memory" percent={percentFromTelemetry(liveTelemetry?.memoryPercent)} value={liveTelemetry?.memoryUsage || 'Unavailable'} />
                <TelemetryCard icon={Network} label="Network" value={liveTelemetry?.networkIo || 'Unavailable'} />
                <TelemetryCard icon={Archive} label="Disk I/O" value={liveTelemetry?.blockIo || 'Unavailable'} />
              </section>
              <section className="rounded-lg border border-slate-700/30 bg-slate-900/60 p-4">
                <h4 className="font-bold text-white">Current check</h4>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Diagnostic label="Status" value={app.friendlyStatus} />
                  <Diagnostic label="Checked" value={formatDate(liveTelemetry?.checkedAt)} />
                  {showAdvancedMetrics && <Diagnostic label="Health" value={app.healthCheck} />}
                  {showAdvancedMetrics && <Diagnostic label="Container" value={app.technicalStatus} />}
                </div>
                {!showAdvancedMetrics && (
                  <div className="mt-4 rounded-lg border border-violet-300/20 bg-violet-500/10 p-3 text-sm text-violet-100">
                    Advanced container details are hidden. Turn on advanced metrics in Settings to see health checks, Compose details, runtime paths, and template values.
                    <Button asChild className="ml-0 mt-3 border-violet-300/30 bg-slate-950/50 text-violet-100 hover:bg-slate-900 sm:ml-3 sm:mt-0" size="sm" type="button" variant="outline">
                      <Link to="/settings">
                        <ExternalLink className="size-3.5" />
                        Open Settings
                      </Link>
                    </Button>
                  </div>
                )}
              </section>
            </TabsContent>

            {showAdvancedMetrics && <TabsContent className="grid min-h-0 gap-4 overflow-y-auto px-4 py-4" value="app-config">
              <section className="rounded-lg border border-slate-700/30 bg-slate-900/60 p-4">
                <h4 className="font-bold text-white">Access links</h4>
                <p className="mt-1 text-sm text-slate-400">Known app routes from Project OS.</p>
                <div className="mt-4 grid gap-3">
                  <AccessLinkRow label="Primary open link" value={app.accessRoute?.primaryOpenUrl || app.settings?.privateAccessUrl || app.observedAccess?.privateUrl || app.accessUrl || app.settings?.accessUrl || null} />
                  <AccessLinkRow label="Private link" value={app.accessRoute?.privateUrl || app.settings?.privateAccessUrl || app.observedAccess?.privateUrl || null} />
                  <AccessLinkRow label="Local link" value={app.accessRoute?.localUrl || app.observedAccess?.localUrl || app.accessUrl || app.settings?.accessUrl || null} />
                  <AccessLinkRow label="Backend target" value={app.accessRoute?.backendTargetUrl || null} />
                </div>
              </section>
              <section className="rounded-lg border border-slate-700/30 bg-slate-900/60 p-4">
                <h4 className="font-bold text-white">App defaults</h4>
                <p className="mt-1 text-sm text-slate-400">Advanced values supplied by this app template.</p>
                {app.appConfiguration?.length ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {app.appConfiguration.map((item) => <Diagnostic key={item.label} label={item.label} value={item.value} />)}
                  </div>
                ) : (
                  <p className="mt-4 rounded-lg border border-slate-700/30 bg-slate-950/45 p-3 text-sm text-slate-400">This app does not have extra advanced settings yet.</p>
                )}
              </section>
              <section className="rounded-lg border border-slate-700/30 bg-slate-900/60 p-4">
                <h4 className="font-bold text-white">Technical details</h4>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Diagnostic label="Compose project" value={app.composeProject} />
                  <Diagnostic label="Runtime path" value={app.runtimePath} />
                  <Diagnostic label="Version" value={app.version} />
                  <Diagnostic label="Category" value={app.category} />
                </div>
              </section>
            </TabsContent>}
          </Tabs>

          <DialogFooter className="m-0 shrink-0 rounded-none rounded-b-xl border-slate-800 bg-slate-900/80">
            <Button className="border-slate-700/50 bg-slate-950/50 text-slate-200 hover:bg-slate-800" onClick={() => onOpenChange(false)} type="button" variant="outline">Cancel</Button>
            <DisabledAction disabled={saving || planning || changePlan?.saveAllowed === false} reason={saving ? 'Project OS is already applying these app settings.' : planning ? 'Wait for Project OS to finish checking the change plan.' : 'Project OS cannot safely apply this change yet.'}>
              <Button className="bg-violet-600 text-white hover:bg-violet-500" disabled={saving || planning || changePlan?.saveAllowed === false} type="submit">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {saving ? 'Applying...' : changePlan?.redeployRequired ? 'Save and Restart App' : 'Save Settings'}
              </Button>
            </DisabledAction>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AccessLinkRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-700/30 bg-slate-950/45 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
        <p className="mt-1 break-all font-mono text-xs text-slate-300">{value || 'Not configured'}</p>
      </div>
      {value && /^https?:\/\//i.test(value) && (
        <Button asChild className="border-slate-700/50 bg-slate-950/60 text-slate-200 hover:bg-slate-800" size="sm" type="button" variant="outline">
          <a href={value} rel="noreferrer" target="_blank">
            <ExternalLink className="size-3.5" />
            Open
          </a>
        </Button>
      )}
    </div>
  );
}

function hasSetupGuide(app: AppRuntimeView) {
  const guide = app.setupGuide;
  if (!guide) {
    return false;
  }
  return guide.generatedValues.length > 0
    || guide.copyableFields.length > 0
    || guide.qrFields.length > 0
    || guide.integrations.length > 0
    || guide.userSteps.length > 0
    || guide.automationCapabilities.length > 0;
}

function SettingsChangePlanCard({ plan, planning }: { plan: AppSettingsChangePlan | null; planning: boolean }) {
  const blocked = plan?.saveAllowed === false;
  const tone = blocked
    ? 'border-red-400/25 bg-red-500/10 text-red-100'
    : plan?.redeployRequired || plan?.restartRequired
      ? 'border-amber-300/25 bg-amber-500/10 text-amber-50'
      : 'border-emerald-300/25 bg-emerald-500/10 text-emerald-50';
  return (
    <section className={`grid gap-3 rounded-lg border p-4 ${tone}`}>
      <div className="flex items-start gap-3">
        {planning ? <Loader2 className="mt-0.5 size-5 animate-spin text-slate-300" /> : blocked ? <AlertTriangle className="mt-0.5 size-5 text-red-200" /> : <CheckCircle2 className="mt-0.5 size-5 text-emerald-200" />}
        <div>
          <h4 className="font-bold text-white">{planning ? 'Checking change impact' : plan?.headline || 'Ready to review'}</h4>
          <p className="mt-1 text-sm leading-6 opacity-80">{planning ? 'Project OS is checking whether these settings are safe to apply.' : plan?.summary || 'Change the settings above to see what Project OS will do before saving.'}</p>
        </div>
      </div>
      {plan && (
        <div className="grid gap-3 text-sm">
          <ImpactRows title="Changes" items={plan.changes} />
          <ImpactRows title="Warnings" items={plan.warnings} />
          <ImpactRows title="Blocked" items={plan.blockedReasons} />
        </div>
      )}
    </section>
  );
}

function ImpactRows({ title, items }: { title: string; items: string[] }) {
  if (!items.length) {
    return null;
  }
  return (
    <div>
      <p className="text-xs font-bold uppercase opacity-60">{title}</p>
      <ul className="mt-1 grid gap-1 pl-4 opacity-80">
        {items.map((item) => <li className="list-disc" key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function TelemetryCard({ icon: Icon, label, value, percent }: { icon: LucideIcon; label: string; value: string; percent?: number | null }) {
  return (
    <div className="rounded-lg border border-slate-700/30 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="grid size-9 place-items-center rounded-lg bg-violet-600/15 text-violet-200">
          <Icon className="size-4" />
        </div>
        {typeof percent === 'number' && <span className="text-xs font-semibold text-slate-500">{percent}%</span>}
      </div>
      <p className="mt-4 text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-white">{value}</p>
      {typeof percent === 'number' && <Progress className="mt-3 bg-slate-800 [&_[data-slot=progress-indicator]]:bg-violet-400" value={percent} />}
    </div>
  );
}
