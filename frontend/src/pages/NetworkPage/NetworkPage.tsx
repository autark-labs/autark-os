import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshStatus } from '@/components/RefreshStatus';
import { PageShell } from '@/components/project-os/ProjectOSComponents';
import { PageErrorState, PageLoadingState } from '@/components/project-os/PageState';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { InstalledAppsAPIClient } from '@/api/InstalledAppsAPIClient';
import { NetworkAPIClient } from '@/api/NetworkAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import type { AppRuntimeView } from '@/types/app';
import type { NetworkDiagnosticsReport, PrivateAccessReconciliationReport, SystemSetupStatus, TailscaleConnectGuide, TailscaleDevice, TailscaleStatus } from '@/types/network';
import { HostSetupPanel } from './HostSetupPanel';
import { NetworkAdvancedPanel } from './NetworkAdvancedPanel';
import { NetworkDevicesPanel } from './NetworkDevicesPanel';
import { NetworkIssuesPanel } from './NetworkIssuesPanel';
import { NetworkMapWorkspace } from './NetworkMapWorkspace';
import { NetworkPostureHeader } from './NetworkPostureHeader';
import { PrivateAccessManager } from './PrivateAccessManager';
import {
  buildDeviceViews,
  buildAppExposureGroups,
  buildNetworkIssues,
  buildNetworkPosture,
  buildPrivateAppAccess,
  getNodeDetails,
} from './extensions/NetworkPage.logic';
import { tailscaleSetupTasks } from './extensions/NetworkPage.tailscaleSetup';

function NetworkPage() {
  const { showAdvancedMetrics } = useProjectSettings();
  const [tailscale, setTailscale] = useState<TailscaleStatus | null>(null);
  const [guide, setGuide] = useState<TailscaleConnectGuide | null>(null);
  const [tailnetDevices, setTailnetDevices] = useState<TailscaleDevice[]>([]);
  const [diagnostics, setDiagnostics] = useState<NetworkDiagnosticsReport | null>(null);
  const [reconciliation, setReconciliation] = useState<PrivateAccessReconciliationReport | null>(null);
  const [setupStatus, setSetupStatus] = useState<SystemSetupStatus | null>(null);
  const [apps, setApps] = useState<AppRuntimeView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState('project-os');
  const [copiedAppId, setCopiedAppId] = useState<string | null>(null);
  const [appActionLoading, setAppActionLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const loadNetwork = useCallback(async ({ background = false } = {}) => {
    if (!background) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);
    try {
      const [status, devices, diagnosticsReport, connectGuide, hostSetup, reconciliationReport, installedApps] = await Promise.all([
        NetworkAPIClient.tailscaleStatus(),
        NetworkAPIClient.tailscaleDevices(),
        NetworkAPIClient.diagnostics(),
        NetworkAPIClient.connectGuide(),
        NetworkAPIClient.setupStatus(),
        NetworkAPIClient.privateAccessReconciliation(),
        InstalledAppsAPIClient.listApps(),
      ]);
      setTailscale(status);
      setTailnetDevices(devices);
      setDiagnostics(diagnosticsReport);
      setReconciliation(reconciliationReport);
      setGuide(connectGuide);
      setSetupStatus(hostSetup);
      setApps(installedApps);
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

  const privateApps = useMemo(() => apps.filter((app) => app.desiredAccess?.mode === 'private' || app.desiredAccess?.mode === 'local-and-private' || app.settings?.tailscaleEnabled), [apps]);
  const runningApps = useMemo(() => apps.filter((app) => app.friendlyStatus === 'Ready'), [apps]);
  const devices = useMemo(() => buildDeviceViews(tailscale, tailnetDevices), [tailnetDevices, tailscale]);
  const exposureGroups = useMemo(() => buildAppExposureGroups(apps, tailscale, reconciliation), [apps, reconciliation, tailscale]);
  const posture = useMemo(() => buildNetworkPosture({ devices, diagnostics, privateApps, reconciliation, tailscale }), [devices, diagnostics, privateApps, reconciliation, tailscale]);
  const issues = useMemo(() => buildNetworkIssues(diagnostics, reconciliation), [diagnostics, reconciliation]);
  const privateAppAccess = useMemo(() => buildPrivateAppAccess(privateApps, tailscale, reconciliation), [privateApps, reconciliation, tailscale]);
  const defaultTab = posture.counts.issues > 0 ? 'issues' : 'private-apps';
  const selectedTab = activeTab ?? defaultTab;

  const selectedNode = useMemo(
    () => getNodeDetails(selectedNodeId, { apps, devices, exposureGroups, privateAppAccess, reconciliation, runningApps, tailscale }),
    [apps, devices, exposureGroups, privateAppAccess, reconciliation, runningApps, selectedNodeId, tailscale],
  );

  const copyPrivateLink = useCallback(async (appId: string, url: string | null) => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopiedAppId(appId);
    window.setTimeout(() => setCopiedAppId((current) => current === appId ? null : current), 1600);
  }, []);

  const updatePrivateAccess = useCallback(async (app: AppRuntimeView, enabled: boolean) => {
    setAppActionLoading(app.appId);
    setError(null);
    try {
      if (enabled) {
        await InstalledAppsAPIClient.repairPrivateAccess(app.appId);
      } else {
        await InstalledAppsAPIClient.disablePrivateAccess(app.appId);
      }
      await loadNetwork({ background: true });
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to update private access for this app.'));
    } finally {
      setAppActionLoading(null);
    }
  }, [loadNetwork]);

  const removeStaleMapping = useCallback(async (port: number) => {
    setAppActionLoading(`stale-${port}`);
    setError(null);
    try {
      await NetworkAPIClient.removeStalePrivateAccess(port);
      await loadNetwork({ background: true });
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to remove this stale private link.'));
    } finally {
      setAppActionLoading(null);
    }
  }, [loadNetwork]);

  return (
    <PageShell>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold leading-none text-white md:text-3xl">Access Map</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">See who can reach your apps: the wider internet, your trusted devices, your home network, or only this server.</p>
        </div>
        <RefreshStatus intervalLabel="Auto-updates every 5s" onRefresh={() => loadNetwork({ background: true })} refreshing={refreshing} updatedAt={updatedAt} />
      </header>

      {error && <PageErrorState message={error} onRetry={() => loadNetwork({ background: false })} title="Access Map could not load" />}

      {loading ? (
        <PageLoadingState label="Loading Access Map" sublabel="Checking trusted devices, private app links, and local network status." />
      ) : (
        <>
          <NetworkPostureHeader posture={posture} />
          <PrivateAccessSetupPath reconciliation={reconciliation} setup={setupStatus} tailscale={tailscale} />
          <NetworkMapWorkspace
            apps={apps}
            exposureGroups={exposureGroups}
            onReviewPrivateLinks={() => setActiveTab('private-apps')}
            onSelectNode={setSelectedNodeId}
            privateApps={privateApps}
            runningApps={runningApps}
            selectedNode={selectedNode}
            selectedNodeId={selectedNodeId}
            showAdvancedMetrics={showAdvancedMetrics}
            tailnetDevices={tailnetDevices}
            tailscale={tailscale}
          />
          <Tabs className="gap-5" onValueChange={setActiveTab} value={selectedTab}>
            <TabsList className="w-full justify-start overflow-x-auto border-b border-slate-700/30 bg-transparent p-0" variant="line">
              <TabsTrigger className="px-3 py-2 text-slate-400 data-active:text-white" value="private-apps">Private app links</TabsTrigger>
              <TabsTrigger className="px-3 py-2 text-slate-400 data-active:text-white" value="devices">Trusted devices</TabsTrigger>
              <TabsTrigger className="px-3 py-2 text-slate-400 data-active:text-white" value="issues">Issues</TabsTrigger>
              {showAdvancedMetrics && <TabsTrigger className="px-3 py-2 text-slate-400 data-active:text-white" value="advanced">Advanced</TabsTrigger>}
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
            <TabsContent value="devices">
              <NetworkDevicesPanel devices={devices} />
            </TabsContent>
            <TabsContent value="issues">
              <NetworkIssuesPanel issues={issues} />
            </TabsContent>
            {showAdvancedMetrics ? <TabsContent value="advanced">
              <div className="grid gap-5">
                <HostSetupPanel setup={setupStatus} />
                <NetworkAdvancedPanel diagnostics={diagnostics} guide={guide} tailscale={tailscale} />
              </div>
            </TabsContent> : (
              <div className="rounded-lg border border-violet-300/20 bg-violet-500/10 p-4 text-sm text-violet-100">
                Advanced network details are hidden in Basic mode. The Access Map, private app links, trusted devices, and issue list still show the important actions.
                <Button asChild className="ml-0 mt-3 border-violet-300/30 bg-slate-950/50 text-violet-100 hover:bg-slate-900 sm:ml-3 sm:mt-0" size="sm" type="button" variant="outline">
                  <a href="/settings">Open Settings</a>
                </Button>
              </div>
            )}
          </Tabs>
        </>
      )}
    </PageShell>
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
