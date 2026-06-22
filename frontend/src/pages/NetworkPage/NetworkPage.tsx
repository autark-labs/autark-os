import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshStatus } from '@/components/RefreshStatus';
import { TailscaleControlPopover } from '@/components/project-os/TailscaleControlPopover';
import { PageShell, StatusPill } from '@/components/project-os/ProjectOSComponents';
import { PageErrorState, PageLoadingState } from '@/components/project-os/PageState';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { InstalledAppsAPIClient } from '@/api/InstalledAppsAPIClient';
import { NetworkAPIClient } from '@/api/NetworkAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import {
  applicationStateQueryKey,
  invalidateApplicationState,
  setRuntimeAppInApplicationStateCache,
  useApplicationStateRepository,
} from '@/repositories/applicationStateRepository';
import { toast } from 'sonner';
import type { AppRuntimeView } from '@/types/app';
import type { ApplicationState } from '@/types/applicationState';
import type { NetworkDiagnosticsReport, PrivateAccessReconciliationReport, SystemSetupStatus, TailscaleConnectGuide, TailscaleDevice, TailscaleStatus } from '@/types/network';
import { HostSetupPanel } from './HostSetupPanel';
import { NetworkAdvancedPanel } from './NetworkAdvancedPanel';
import { NetworkDevicesPanel } from './NetworkDevicesPanel';
import { NetworkIssuesPanel } from './NetworkIssuesPanel';
import { PrivateAccessManager } from './PrivateAccessManager';
import {
  buildDeviceViews,
  buildAppExposureGroups,
  buildNetworkIssues,
  buildNetworkPosture,
  buildPrivateAppAccess,
} from './extensions/NetworkPage.logic';
import { buildAccessZones } from './extensions/NetworkPage.accessZones';
import { tailscaleSetupTasks } from './extensions/NetworkPage.tailscaleSetup';

function NetworkPage() {
  const { showAdvancedMetrics } = useProjectSettings();
  const queryClient = useQueryClient();
  const appState = useApplicationStateRepository();
  const [tailscale, setTailscale] = useState<TailscaleStatus | null>(null);
  const [guide, setGuide] = useState<TailscaleConnectGuide | null>(null);
  const [tailnetDevices, setTailnetDevices] = useState<TailscaleDevice[]>([]);
  const [diagnostics, setDiagnostics] = useState<NetworkDiagnosticsReport | null>(null);
  const [reconciliation, setReconciliation] = useState<PrivateAccessReconciliationReport | null>(null);
  const [setupStatus, setSetupStatus] = useState<SystemSetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedAppId, setCopiedAppId] = useState<string | null>(null);
  const [appActionLoading, setAppActionLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const apps = appState.apps;
  const observedServices = appState.observedServices;
  const pageLoading = loading || appState.isLoading;
  const pageRefreshing = refreshing || appState.isFetching;

  const loadNetwork = useCallback(async ({ background = false } = {}) => {
    if (!background) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);
    try {
      const [status, devices, diagnosticsReport, connectGuide, hostSetup, reconciliationReport] = await Promise.all([
        NetworkAPIClient.tailscaleStatus(),
        NetworkAPIClient.tailscaleDevices(),
        NetworkAPIClient.diagnostics(),
        NetworkAPIClient.connectGuide(),
        NetworkAPIClient.setupStatus(),
        NetworkAPIClient.privateAccessReconciliation(),
      ]);
      setTailscale(status);
      setTailnetDevices(devices);
      setDiagnostics(diagnosticsReport);
      setReconciliation(reconciliationReport);
      setGuide(connectGuide);
      setSetupStatus(hostSetup);
      setUpdatedAt(new Date());
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to load network status.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadNetwork();
    const interval = window.setInterval(() => loadNetwork({ background: true }), 5000);
    return () => window.clearInterval(interval);
  }, [loadNetwork]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      loadNetwork({ background: true }),
      appState.refresh(),
    ]);
  }, [appState, loadNetwork]);

  const privateApps = useMemo(() => apps.filter((app) => app.desiredAccess?.mode === 'private' || app.desiredAccess?.mode === 'local-and-private' || app.settings?.tailscaleEnabled), [apps]);
  const runningApps = useMemo(() => apps.filter((app) => app.friendlyStatus === 'Ready'), [apps]);
  const devices = useMemo(() => buildDeviceViews(tailscale, tailnetDevices), [tailnetDevices, tailscale]);
  const exposureGroups = useMemo(() => buildAppExposureGroups(apps, tailscale, reconciliation), [apps, reconciliation, tailscale]);
  const pinnedExternalServices = useMemo(() => observedServices.filter((service) => service.userStatus === 'pinned_external'), [observedServices]);
  const accessZones = useMemo(() => buildAccessZones(exposureGroups, pinnedExternalServices), [exposureGroups, pinnedExternalServices]);
  const posture = useMemo(() => buildNetworkPosture({ devices, diagnostics, privateApps, reconciliation, tailscale }), [devices, diagnostics, privateApps, reconciliation, tailscale]);
  const issues = useMemo(() => buildNetworkIssues(diagnostics, reconciliation), [diagnostics, reconciliation]);
  const privateAppAccess = useMemo(() => buildPrivateAppAccess(privateApps, tailscale, reconciliation), [privateApps, reconciliation, tailscale]);
  const defaultTab = posture.counts.issues > 0 ? 'issues' : 'private-apps';
  const selectedTab = !showAdvancedMetrics && activeTab && !['private-apps', 'issues'].includes(activeTab) ? defaultTab : activeTab ?? defaultTab;

  const copyPrivateLink = useCallback(async (appId: string, url: string | null) => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast.success('Link copied', { description: url });
    setCopiedAppId(appId);
    window.setTimeout(() => setCopiedAppId((current) => current === appId ? null : current), 1600);
  }, []);

  const updatePrivateAccess = useCallback(async (app: AppRuntimeView, enabled: boolean) => {
    const previousState = queryClient.getQueryData<ApplicationState | undefined>(applicationStateQueryKey);
    setAppActionLoading(app.appId);
    setError(null);
    setRuntimeAppInApplicationStateCache(queryClient, appWithOptimisticPrivateAccess(app, enabled));
    try {
      const result = enabled
        ? await InstalledAppsAPIClient.repairPrivateAccess(app.appId)
        : await InstalledAppsAPIClient.disablePrivateAccess(app.appId);
      if (result.app) {
        setRuntimeAppInApplicationStateCache(queryClient, result.app);
      } else {
        void invalidateApplicationState(queryClient);
      }
      void loadNetwork({ background: true });
    } catch (err) {
      queryClient.setQueryData<ApplicationState | undefined>(applicationStateQueryKey, previousState);
      const message = apiErrorMessage(err, 'Unable to update private access for this app.');
      setError(message);
      toast.error('Private access update failed', { description: message, duration: Infinity });
    } finally {
      setAppActionLoading(null);
    }
  }, [loadNetwork, queryClient]);

  const removeStaleMapping = useCallback(async (port: number) => {
    setAppActionLoading(`stale-${port}`);
    setError(null);
    try {
      await NetworkAPIClient.removeStalePrivateAccess(port);
      await refreshAll();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to remove this stale private link.'));
    } finally {
      setAppActionLoading(null);
    }
  }, [refreshAll]);

  return (
    <PageShell>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold leading-none text-white md:text-3xl">Access</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">Open local links, review private Tailscale links, and fix access issues from one place.</p>
        </div>
        <RefreshStatus intervalLabel="Auto-updates every 10s" onRefresh={refreshAll} refreshing={pageRefreshing} updatedAt={appState.updatedAt ?? updatedAt} />
      </header>

      {error && <PageErrorState message={error} onRetry={() => loadNetwork({ background: false })} title="Access status could not load" />}

      {pageLoading ? (
        <PageLoadingState label="Loading Access" sublabel="Checking private app links, local links, and Tailscale status." />
      ) : (
        <>
          <TailscaleAccessCard posture={posture} setup={setupStatus} tailscale={tailscale} />
          <AccessZoneDiagram zones={accessZones} />
          <PrivateAccessSetupPath reconciliation={reconciliation} setup={setupStatus} tailscale={tailscale} />
          <Tabs className="gap-5" onValueChange={setActiveTab} value={selectedTab}>
            <TabsList className="w-full justify-start overflow-x-auto border-b border-slate-700/30 bg-transparent p-0" variant="line">
              <TabsTrigger className="px-3 py-2 text-slate-400 data-active:text-white" value="private-apps">Private app links</TabsTrigger>
              <TabsTrigger className="px-3 py-2 text-slate-400 data-active:text-white" value="issues">Issues</TabsTrigger>
              {showAdvancedMetrics && <TabsTrigger className="px-3 py-2 text-slate-400 data-active:text-white" value="devices">Trusted devices</TabsTrigger>}
              {showAdvancedMetrics && <TabsTrigger className="px-3 py-2 text-slate-400 data-active:text-white" value="advanced">Map and diagnostics</TabsTrigger>}
            </TabsList>
            <TabsContent value="private-apps">
              <PrivateAccessManager
                copiedAppId={copiedAppId}
                installedApps={apps}
                loadingAppId={appActionLoading}
                onCopyPrivateLink={copyPrivateLink}
                onEnablePrivateAccess={(app) => updatePrivateAccess(app, true)}
                onRemoveStaleMapping={removeStaleMapping}
                onRepairPrivateAccess={(app) => updatePrivateAccess(app, true)}
                onTurnOffPrivateAccess={(app) => updatePrivateAccess(app, false)}
                privateAppAccess={privateAppAccess}
                reconciliation={reconciliation}
                tailscale={tailscale}
              />
            </TabsContent>
            <TabsContent value="issues">
              <NetworkIssuesPanel issues={issues} />
            </TabsContent>
            {showAdvancedMetrics && <TabsContent value="devices">
              <NetworkDevicesPanel devices={devices} />
            </TabsContent>}
            {showAdvancedMetrics && <TabsContent value="advanced">
              <div className="grid gap-5">
                <HostSetupPanel setup={setupStatus} />
                <NetworkAdvancedPanel diagnostics={diagnostics} guide={guide} tailscale={tailscale} />
              </div>
            </TabsContent>}
          </Tabs>
        </>
      )}
    </PageShell>
  );
}

function appWithOptimisticPrivateAccess(app: AppRuntimeView, enabled: boolean): AppRuntimeView {
  return {
    ...app,
    desiredAccess: app.desiredAccess ? {
      ...app.desiredAccess,
      mode: enabled ? 'local-and-private' : 'local',
      label: enabled ? 'Private / Tailscale' : 'This Server',
      privateUrl: enabled ? app.desiredAccess.privateUrl : null,
      privateAccessRequirement: enabled ? app.desiredAccess.privateAccessRequirement : 'disabled',
      privateAccessRequired: enabled ? app.desiredAccess.privateAccessRequired : false,
      privateAccessRecommended: enabled ? app.desiredAccess.privateAccessRecommended : false,
    } : app.desiredAccess,
    observedAccess: app.observedAccess ? {
      ...app.observedAccess,
      privateUrl: enabled ? app.observedAccess.privateUrl : null,
      privateLinkStatus: enabled ? 'configured' : 'not_enabled',
    } : app.observedAccess,
    settings: app.settings ? {
      ...app.settings,
      tailscaleEnabled: enabled,
      privateAccessUrl: enabled ? app.settings.privateAccessUrl : null,
      desiredAccessMode: enabled ? 'local-and-private' : 'local',
      privateAccessRequirement: enabled ? app.settings.privateAccessRequirement : 'disabled',
    } : app.settings,
  };
}

function TailscaleAccessCard({ posture, setup, tailscale }: { posture: ReturnType<typeof buildNetworkPosture>; setup: SystemSetupStatus | null; tailscale: TailscaleStatus | null }) {
  const connected = Boolean(tailscale?.connected);
  const check = setup?.checks?.find((item) => item.id === 'tailscale') || null;
  return (
    <section className="overflow-hidden rounded-2xl border border-sky-300/18 bg-po-hero-devices p-5 shadow-po-panel">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-normal text-sky-200">Private access</p>
          <h3 className="mt-2 text-2xl font-black text-white">{connected ? 'Tailscale is connected' : 'Connect Tailscale for private links'}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            {connected ? posture.summary : 'Local app links still work on your home network. Tailscale adds private links for trusted phones, laptops, and other devices.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={connected ? 'success' : 'warning'}>{connected ? 'Private ready' : 'Local-only available'}</StatusPill>
          <TailscaleControlPopover align="end" check={check} triggerLabel="full" />
        </div>
      </div>
    </section>
  );
}

function AccessZoneDiagram({ zones }: { zones: ReturnType<typeof buildAccessZones> }) {
  return (
    <section className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/55 p-5 shadow-po-panel">
      <div>
        <h3 className="text-lg font-black text-white">Where apps are reachable</h3>
        <p className="mt-1 text-sm text-slate-400">Project OS keeps public exposure empty by default and favors LAN or private Tailscale links.</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-4">
        {zones.map((zone) => (
          <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4" key={zone.id}>
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-bold text-white">{zone.label}</h4>
              <Badge className={zone.id === 'public' && zone.apps.length > 0 ? 'border-red-300/25 bg-red-500/10 text-red-100' : 'border-slate-600/40 bg-slate-950/50 text-slate-300'} variant="outline">
                {zone.apps.length}
              </Badge>
            </div>
            <div className="mt-3 grid gap-2">
              {zone.apps.length ? zone.apps.map((app: { id: string; label: string; external: boolean; status: string; url: string }) => (
                <a className="rounded-lg border border-white/10 bg-slate-950/45 px-3 py-2 text-sm text-slate-200 transition hover:border-sky-300/35 hover:text-white" href={app.url || undefined} key={app.id} rel="noreferrer" target={app.url ? '_blank' : undefined}>
                  <span className="block truncate font-semibold">{app.label}</span>
                  <span className="text-xs text-slate-500">{app.external ? 'Pinned external service' : app.status}</span>
                </a>
              )) : (
                <p className="m-0 rounded-lg border border-dashed border-slate-700/60 px-3 py-2 text-sm text-slate-500">{zone.emptyText}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PrivateAccessSetupPath({ reconciliation, setup, tailscale }: { reconciliation: PrivateAccessReconciliationReport | null; setup: SystemSetupStatus | null; tailscale: TailscaleStatus | null }) {
  const tasks = tailscaleSetupTasks({ reconciliation, setup, tailscale });
  const blockingTask = tasks.find((task) => task.status === 'warning');
  const statusLabel = blockingTask ? blockingTask.title : 'Private access ready';
  const connected = Boolean(tailscale?.connected);

  return (
    <section className="rounded-lg border border-white/10 bg-slate-950/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-normal text-sky-300">Private access setup path</p>
          <h3 className="mt-2 text-xl font-black text-white">{statusLabel}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Local access works without Tailscale. Private app links need this device connected to Tailscale, MagicDNS/HTTPS enabled, and Tailscale Serve permission granted to Project OS.
          </p>
        </div>
        <Badge className={connected ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100' : 'border-amber-300/25 bg-amber-500/10 text-amber-100'} variant="outline">
          {connected ? 'Connected' : 'Local-only available'}
        </Badge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {tasks.map((task) => (
          <SetupStep
            action={task.primaryAction.command || task.primaryAction.label}
            detail={task.detail}
            key={task.id}
            label={task.title}
            status={task.status}
          />
        ))}
      </div>
    </section>
  );
}

function SetupStep({ action, detail, label, status }: { action: string; detail: string; label: string; status: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/55 p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-semibold text-white">{label}</h4>
        <Badge className={status === 'ok' ? 'bg-emerald-500/15 text-emerald-100' : status === 'warning' ? 'bg-amber-500/15 text-amber-100' : 'bg-slate-700 text-slate-200'}>
          {status === 'ok' ? 'Ready' : status === 'warning' ? 'Needs setup' : 'Later'}
        </Badge>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-400">{detail}</p>
      <p className="mt-3 text-xs font-semibold text-sky-200">{action}</p>
    </div>
  );
}

export default NetworkPage;
