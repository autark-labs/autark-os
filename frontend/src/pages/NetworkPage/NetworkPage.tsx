import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshStatus } from '@/components/RefreshStatus';
import { CanonicalRecommendedAction } from '@/components/project-os/CanonicalRecommendedAction';
import { TailscaleControlPopover } from '@/components/project-os/TailscaleControlPopover';
import { PageShell } from '@/components/layout/PageShell';
import { StatusPill } from '@/components/primitives/StatusPill';
import { Surface } from '@/components/primitives/Surface';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { InstalledAppsAPIClient } from '@/api/InstalledAppsAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { showActionErrorNotification, showActionNotification } from '@/lib/actionNotifications';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import {
  invalidateApplicationState,
  setRuntimeAppInApplicationStateCache,
  useApplicationStateRepository,
} from '@/repositories/applicationStateRepository';
import {
  invalidateNetworkQueries,
  useAccessNetworkRepository,
  useRemoveStalePrivateAccessMutation,
} from '@/repositories/networkRepository';
import type { AppRuntimeView } from '@/types/app';
import type { PrivateAccessReconciliationReport, SystemSetupStatus, TailscaleStatus } from '@/types/network';
import { HostSetupPanel } from './HostSetupPanel';
import { NetworkAdvancedPanel } from './NetworkAdvancedPanel';
import { NetworkDevicesPanel } from './NetworkDevicesPanel';
import { NetworkIssuesPanel } from './NetworkIssuesPanel';
import { PrivateAccessManager } from './PrivateAccessManager';
import { AccessPageErrorState, AccessPageLoadingState, NetworkInset } from './NetworkPage.shared';
import {
  buildDeviceViews,
  buildAppExposureGroups,
  buildNetworkIssues,
  buildNetworkPosture,
  buildPrivateAppAccess,
} from './extensions/NetworkPage.logic';
import { buildAccessZones } from './extensions/NetworkPage.accessZones';
import { tailscaleAccessDisplay, tailscaleSetupTasks } from './extensions/NetworkPage.tailscaleSetup';

function NetworkPage() {
  const { showAdvancedMetrics } = useProjectSettings();
  const queryClient = useQueryClient();
  const appState = useApplicationStateRepository();
  const network = useAccessNetworkRepository();
  const removeStalePrivateAccess = useRemoveStalePrivateAccessMutation();
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedAppId, setCopiedAppId] = useState<string | null>(null);
  const [appActionLoading, setAppActionLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const apps = appState.apps;
  const observedServices = appState.observedServices;
  const pageLoading = network.isLoading || appState.isLoading;
  const pageRefreshing = network.isFetching || appState.isFetching;
  const pageError = actionError ?? (network.error ? apiErrorMessage(network.error, 'Unable to load network status.') : null);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      network.refresh(),
      appState.refresh(),
    ]);
  }, [appState, network]);

  const privateApps = useMemo(() => apps.filter((app) => app.desiredAccess?.mode === 'private' || app.desiredAccess?.mode === 'local-and-private' || app.settings?.tailscaleEnabled), [apps]);
  const devices = useMemo(() => buildDeviceViews(network.tailscale, network.tailnetDevices), [network.tailnetDevices, network.tailscale]);
  const exposureGroups = useMemo(() => buildAppExposureGroups(apps, network.tailscale, network.reconciliation), [apps, network.reconciliation, network.tailscale]);
  const pinnedExternalServices = useMemo(() => observedServices.filter((service) => service.userStatus === 'pinned_external'), [observedServices]);
  const accessZones = useMemo(() => buildAccessZones(exposureGroups, pinnedExternalServices), [exposureGroups, pinnedExternalServices]);
  const posture = useMemo(() => buildNetworkPosture({
    devices,
    diagnostics: network.diagnostics,
    privateApps,
    reconciliation: network.reconciliation,
    tailscale: network.tailscale,
  }), [devices, network.diagnostics, network.reconciliation, network.tailscale, privateApps]);
  const issues = useMemo(() => buildNetworkIssues(network.diagnostics, network.reconciliation), [network.diagnostics, network.reconciliation]);
  const privateAppAccess = useMemo(() => buildPrivateAppAccess(privateApps, network.tailscale, network.reconciliation), [network.reconciliation, network.tailscale, privateApps]);
  const defaultTab = posture.counts.issues > 0 ? 'issues' : 'private-apps';
  const selectedTab = !showAdvancedMetrics && activeTab && !['private-apps', 'issues'].includes(activeTab) ? defaultTab : activeTab ?? defaultTab;

  const copyPrivateLink = useCallback(async (appId: string, url: string | null) => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    showActionNotification({ ok: true, severity: 'success', title: 'Link copied', message: url }, 'Link copied');
    setCopiedAppId(appId);
    window.setTimeout(() => setCopiedAppId((current) => current === appId ? null : current), 1600);
  }, []);

  const updatePrivateAccess = useCallback(async (app: AppRuntimeView, enabled: boolean) => {
    setAppActionLoading(app.appId);
    setActionError(null);
    try {
      const result = enabled
        ? await InstalledAppsAPIClient.enablePrivateAccess(app.appId)
        : await InstalledAppsAPIClient.disablePrivateAccess(app.appId);
      if (result.app) {
        setRuntimeAppInApplicationStateCache(queryClient, result.app);
      }
      showActionNotification(result, enabled ? 'Private network ready' : 'Private network turned off');
      void invalidateApplicationState(queryClient);
      void invalidateNetworkQueries(queryClient);
    } catch (err) {
      const message = apiErrorMessage(err, 'Unable to update private access for this app.');
      setActionError(message);
      showActionErrorNotification(err, 'Private access update failed');
    } finally {
      setAppActionLoading(null);
    }
  }, [queryClient]);

  const removeStaleMapping = useCallback(async (port: number) => {
    setAppActionLoading(`stale-${port}`);
    setActionError(null);
    try {
      await removeStalePrivateAccess.mutateAsync(port);
      showActionNotification({ ok: true, severity: 'success', title: 'Stale private link removed', message: 'Project OS removed the stale Tailscale Serve entry.' }, 'Stale private link removed');
      await refreshAll();
    } catch (err) {
      const message = apiErrorMessage(err, 'Unable to remove this stale private link.');
      setActionError(message);
      showActionErrorNotification(err, 'Stale private link removal failed');
    } finally {
      setAppActionLoading(null);
    }
  }, [refreshAll, removeStalePrivateAccess]);

  return (
    <PageShell>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold leading-none text-slate-50 md:text-3xl">Access</h2>
          <p className="mt-2 max-w-2xl text-sm text-sky-100/70">Open local links, review private Tailscale links, and fix access issues from one place.</p>
        </div>
        <RefreshStatus intervalLabel="Auto-updates every 10s" onRefresh={refreshAll} refreshing={pageRefreshing} tone="cyan" updatedAt={appState.updatedAt ?? network.updatedAt} />
      </header>

      <CanonicalRecommendedAction />

      {pageError && <AccessPageErrorState message={pageError} onRetry={refreshAll} title="Access status could not load" />}

      {pageLoading ? (
        <AccessPageLoadingState label="Loading Access" sublabel="Checking private app links, local links, and Tailscale status." />
      ) : (
        <>
          <AccessZoneDiagram zones={accessZones} />
          <TailscaleAccessCard posture={posture} setup={network.setupStatus} tailscale={network.tailscale} />
          {(showAdvancedMetrics || !network.tailscale?.connected) && (
            <PrivateAccessSetupPath reconciliation={network.reconciliation} setup={network.setupStatus} tailscale={network.tailscale} />
          )}
          <Tabs className="gap-5" onValueChange={setActiveTab} value={selectedTab}>
            <TabsList className="sticky top-0 z-10 w-full justify-start overflow-x-auto border-b border-sky-400/20 bg-slate-900/95 p-0 py-2 backdrop-blur" variant="line">
              <TabsTrigger className="px-3 py-2 text-sky-100/60 data-active:text-cyan-100" value="private-apps">Private app links</TabsTrigger>
              <TabsTrigger className="px-3 py-2 text-sky-100/60 data-active:text-cyan-100" value="issues">Issues</TabsTrigger>
              {showAdvancedMetrics && <TabsTrigger className="px-3 py-2 text-sky-100/60 data-active:text-cyan-100" value="devices">Trusted devices</TabsTrigger>}
              {showAdvancedMetrics && <TabsTrigger className="px-3 py-2 text-sky-100/60 data-active:text-cyan-100" value="advanced">Map and diagnostics</TabsTrigger>}
            </TabsList>
            <TabsContent className="min-h-[560px]" value="private-apps">
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
                reconciliation={network.reconciliation}
                tailscale={network.tailscale}
              />
            </TabsContent>
            <TabsContent className="min-h-[560px]" value="issues">
              <NetworkIssuesPanel issues={issues} />
            </TabsContent>
            {showAdvancedMetrics && <TabsContent className="min-h-[560px]" value="devices">
              <NetworkDevicesPanel devices={devices} />
            </TabsContent>}
            {showAdvancedMetrics && <TabsContent className="min-h-[560px]" value="advanced">
              <div className="grid gap-5">
                <HostSetupPanel setup={network.setupStatus} />
                <NetworkAdvancedPanel diagnostics={network.diagnostics} guide={network.guide} tailscale={network.tailscale} />
              </div>
            </TabsContent>}
          </Tabs>
        </>
      )}
    </PageShell>
  );
}

function TailscaleAccessCard({ posture, setup, tailscale }: { posture: ReturnType<typeof buildNetworkPosture>; setup: SystemSetupStatus | null; tailscale: TailscaleStatus | null }) {
  const display = tailscaleAccessDisplay(tailscale) as { badge: string; heading: string; summary: string; tone: 'success' | 'warning' };
  const check = setup?.checks?.find((item) => item.id === 'tailscale') || null;
  return (
    <Surface className="overflow-hidden p-5 shadow-slate-950/20" tone="panel">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-normal text-cyan-200">Private access</p>
          <h3 className="mt-2 text-2xl font-black text-slate-50">{display.heading}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-sky-100/70">
            {display.tone === 'success' ? posture.summary : display.summary}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={display.tone}>{display.badge}</StatusPill>
          <TailscaleControlPopover align="end" check={check} triggerLabel="full" />
        </div>
      </div>
    </Surface>
  );
}

function AccessZoneDiagram({ zones }: { zones: ReturnType<typeof buildAccessZones> }) {
  return (
    <Surface className="grid gap-3 p-5 shadow-slate-950/20" tone="panel">
      <div>
        <h3 className="text-lg font-black text-slate-50">Where apps are reachable</h3>
        <p className="mt-1 text-sm text-sky-100/70">Project OS keeps public exposure empty by default and favors LAN or private Tailscale links.</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-4">
        {zones.map((zone) => (
          <NetworkInset className="rounded-xl p-4" key={zone.id}>
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-bold text-slate-50">{zone.label}</h4>
              <Badge className={zone.id === 'public' && zone.apps.length > 0 ? 'border-red-400/40 bg-red-500/10 text-red-200' : zone.id === 'public' ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200' : 'border-sky-400/25 bg-slate-900 text-sky-100/80'} variant="outline">
                {zone.statusLabel}
              </Badge>
            </div>
            <div className="mt-3 grid gap-2">
              {zone.apps.length ? zone.apps.map((app: { id: string; label: string; external: boolean; status: string; url: string }) => (
                <a className="rounded-lg border border-sky-400/20 bg-slate-900 px-3 py-2 text-sm text-sky-100/85 transition hover:border-cyan-300/45 hover:bg-slate-700 hover:text-white" href={app.url || undefined} key={app.id} rel="noreferrer" target={app.url ? '_blank' : undefined}>
                  <span className="block truncate font-semibold">{app.label}</span>
                  <span className="text-xs text-sky-100/50">{app.external ? 'Pinned external service' : app.status}</span>
                </a>
              )) : (
                <p className="m-0 rounded-lg border border-dashed border-sky-400/20 px-3 py-2 text-sm text-sky-100/50">{zone.emptyText}</p>
              )}
            </div>
          </NetworkInset>
        ))}
      </div>
    </Surface>
  );
}

function PrivateAccessSetupPath({ reconciliation, setup, tailscale }: { reconciliation: PrivateAccessReconciliationReport | null; setup: SystemSetupStatus | null; tailscale: TailscaleStatus | null }) {
  const tasks = tailscaleSetupTasks({ reconciliation, setup, tailscale });
  const blockingTask = tasks.find((task) => task.status === 'warning');
  const statusLabel = blockingTask ? blockingTask.title : 'Private access ready';
  const connected = Boolean(tailscale?.connected);

  return (
    <Surface className="p-5" tone="panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-normal text-cyan-200">Private access setup path</p>
          <h3 className="mt-2 text-xl font-black text-slate-50">{statusLabel}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-sky-100/70">
            Local access works without Tailscale. Private app links need this device connected to Tailscale, MagicDNS/HTTPS enabled, and Tailscale Serve permission granted to Project OS.
          </p>
        </div>
        <Badge className={connected ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200' : 'border-orange-400/45 bg-orange-500/10 text-orange-200'} variant="outline">
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
    </Surface>
  );
}

function SetupStep({ action, detail, label, status }: { action: string; detail: string; label: string; status: string }) {
  return (
    <NetworkInset className="p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-semibold text-slate-50">{label}</h4>
        <Badge className={status === 'ok' ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200' : status === 'warning' ? 'border-orange-400/45 bg-orange-500/10 text-orange-200' : 'border-sky-400/25 bg-slate-900 text-sky-100/80'} variant="outline">
          {status === 'ok' ? 'Ready' : status === 'warning' ? 'Needs setup' : 'Later'}
        </Badge>
      </div>
      <p className="mt-2 text-sm leading-6 text-sky-100/70">{detail}</p>
      <p className="mt-3 text-xs font-semibold text-cyan-200">{action}</p>
    </NetworkInset>
  );
}

export default NetworkPage;
