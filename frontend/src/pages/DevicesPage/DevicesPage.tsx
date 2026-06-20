import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight, Loader2, MonitorSmartphone, Network, ShieldCheck, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { InstalledAppsAPIClient } from '@/api/InstalledAppsAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { NetworkAPIClient } from '@/api/NetworkAPIClient';
import { RefreshStatus } from '@/components/RefreshStatus';
import { PageErrorState, PageLoadingState } from '@/components/project-os/PageState';
import { PageShell, SurfaceFrame, SurfacePanel } from '@/components/project-os/ProjectOSComponents';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AppRuntimeView } from '@/types/app';
import type { DeviceTrustUpdateRequest, PrivateAccessReconciliationReport, TailscaleDevice, TailscaleStatus, TrustedDeviceView } from '@/types/network';
import { DeviceEditDialog } from './DeviceEditDialog';
import { DeviceDetailCard, DeviceRow, EmptyState, OnboardingCard, PrivateAppsCard, SignalCard } from './DevicesPage.components';
import { accessForDevice, isPrivateApp } from './DevicesPage.logic';

type DevicesState = {
  apps: AppRuntimeView[];
  devices: TailscaleDevice[];
  deviceViews: TrustedDeviceView[];
  reconciliation: PrivateAccessReconciliationReport | null;
  tailscale: TailscaleStatus | null;
  onboardingSteps: string[];
};

function DevicesPage() {
  const { showAdvancedMetrics } = useProjectSettings();
  const [state, setState] = useState<DevicesState>({ apps: [], devices: [], deviceViews: [], reconciliation: null, tailscale: null, onboardingSteps: [] });
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [editingDevice, setEditingDevice] = useState<TrustedDeviceView | null>(null);
  const [deviceForm, setDeviceForm] = useState<DeviceTrustUpdateRequest>({ nickname: '', trustGroup: 'Personal devices', trusted: true, notes: '' });
  const [copied, setCopied] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingDevice, setSavingDevice] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(background = false) {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const [accessReport, apps] = await Promise.all([
        NetworkAPIClient.deviceAccessReport(),
        InstalledAppsAPIClient.listApps(),
      ]);
      const devices = accessReport.devices.map((view) => view.device);
      setState({
        apps,
        devices,
        deviceViews: accessReport.devices,
        reconciliation: accessReport.privateAccess,
        tailscale: accessReport.tailscale,
        onboardingSteps: accessReport.onboardingSteps,
      });
      setUpdatedAt(new Date());
      setSelectedDeviceId((current) => current ?? devices.find((device) => device.self)?.id ?? devices[0]?.id ?? null);
    } catch (loadError) {
      setError(apiErrorMessage(loadError, 'Device status could not be loaded.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(true), 8000);
    return () => window.clearInterval(interval);
  }, []);

  async function copy(value: string | null | undefined, id: string) {
    if (!value) {
      return;
    }
    await navigator.clipboard.writeText(value);
    setCopied(id);
    window.setTimeout(() => setCopied(null), 1600);
  }

  function openEditDevice(deviceView: TrustedDeviceView) {
    setDeviceForm({
      nickname: deviceView.metadata.nickname || '',
      trustGroup: deviceView.metadata.trustGroup || 'Personal devices',
      trusted: deviceView.metadata.trusted,
      notes: deviceView.metadata.notes || '',
    });
    setEditingDevice(deviceView);
  }

  async function saveDevice() {
    if (!editingDevice) {
      return;
    }
    setSavingDevice(true);
    setError(null);
    try {
      await NetworkAPIClient.updateDeviceTrust(editingDevice.device.id, deviceForm);
      setEditingDevice(null);
      await load(true);
    } catch (saveError) {
      setError(apiErrorMessage(saveError, 'Device settings could not be saved.'));
    } finally {
      setSavingDevice(false);
    }
  }

  const privateApps = useMemo(() => state.apps.filter(isPrivateApp), [state.apps]);
  const deviceViewsById = useMemo(() => new Map(state.deviceViews.map((view) => [view.device.id, view])), [state.deviceViews]);
  const onlineDevices = state.devices.filter((device) => device.online);
  const trustedDeviceCount = state.deviceViews.length ? state.deviceViews.filter((view) => view.metadata.trusted).length : onlineDevices.length;
  const verifiedDeviceCount = state.deviceViews.filter((view) => view.reachability.verifiedFromProjectOs).length;
  const selectedDevice = state.devices.find((device) => device.id === selectedDeviceId) ?? state.devices.find((device) => device.self) ?? state.devices[0] ?? null;
  const selectedDeviceView = selectedDevice ? deviceViewsById.get(selectedDevice.id) ?? null : null;
  const accessSummary = accessForDevice(selectedDevice, state.tailscale, privateApps.length, selectedDeviceView);
  const healthyPrivateLinks = state.reconciliation?.apps.filter((app) => app.status === 'healthy').length ?? 0;
  const pageHero = getDeviceHero(state.tailscale, trustedDeviceCount, onlineDevices.length, privateApps.length);

  if (loading) {
    return (
      <PageLoadingState label="Loading trusted devices" sublabel="Checking device access, private links, and Tailscale status." />
    );
  }

  return (
    <PageShell className="po-page-tall">
      <SurfaceFrame>
        <div className="border-b border-white/10 bg-po-hero-devices p-6 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-normal text-cyan-300">Devices</p>
              <h1 className="mt-2 text-3xl font-black leading-tight text-white md:text-5xl">{pageHero.title}</h1>
              <p className="mt-3 max-w-3xl text-sm text-slate-300 md:text-base">
                {pageHero.summary}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button className="border-cyan-300/25 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/15" disabled={refreshing} onClick={() => void load(true)} type="button" variant="outline">
                {refreshing ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                Check links
              </Button>
              <RefreshStatus intervalLabel="Auto-updates every 8s" onRefresh={() => void load(true)} refreshing={refreshing} tone="cyan" updatedAt={updatedAt} />
            </div>
          </div>
        </div>

        {error && <PageErrorState className="rounded-none border-x-0 border-t-0 px-6 py-4" message={error} onRetry={() => void load(true)} title="Trusted devices could not refresh" />}

        <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
          <SignalCard icon={state.tailscale?.connected ? ShieldCheck : AlertTriangle} label="Tailnet status" value={state.tailscale?.connected ? 'Connected' : 'Needs setup'} detail={state.tailscale?.message || 'Waiting for Tailscale status.'} tone={state.tailscale?.connected ? 'green' : 'amber'} />
          <SignalCard icon={MonitorSmartphone} label="Trusted devices" value={`${trustedDeviceCount}/${state.devices.length}`} detail={state.devices.length ? `${onlineDevices.length} online right now.` : 'No devices reported yet.'} tone={onlineDevices.length ? 'cyan' : 'slate'} />
          <SignalCard icon={Users} label="Verified access" value={`${verifiedDeviceCount}`} detail={verifiedDeviceCount ? 'Private links check out from Project OS.' : 'Private access has not been verified yet.'} tone={verifiedDeviceCount ? 'green' : 'amber'} />
          <SignalCard icon={Network} label="Private apps" value={`${privateApps.length}`} detail={`${healthyPrivateLinks}/${state.reconciliation?.apps.length ?? privateApps.length} links look ready.`} tone={privateApps.length ? 'violet' : 'slate'} />
        </div>
      </SurfaceFrame>

      {!state.tailscale?.connected && (
        <section className="rounded-lg border border-amber-300/20 bg-amber-500/10 p-5 text-amber-100">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <div>
              <h2 className="font-black text-white">Connect Tailscale to see trusted devices</h2>
              <p className="mt-1 text-sm text-amber-100/80">Project OS uses Tailscale to know which personal devices can reach private app links.</p>
              <Button asChild className="mt-4 border-amber-300/30 bg-slate-950/50 text-amber-100 hover:bg-slate-900" variant="outline">
                <Link to="/network">Open network setup <ChevronRight className="size-4" /></Link>
              </Button>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <SurfacePanel>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <MonitorSmartphone className="size-5 text-cyan-300" />
                <h2 className="text-xl font-black text-white">Known devices</h2>
              </div>
              <p className="mt-1 text-sm text-slate-400">Devices reported by your tailnet. Project OS highlights likely private-app access.</p>
            </div>
            <Badge className="border-slate-700 bg-slate-900 text-slate-300">{state.devices.length} tracked</Badge>
          </div>
          <p className="mt-4 rounded-lg border border-cyan-300/15 bg-cyan-500/5 p-3 text-sm leading-6 text-cyan-50">
            A trusted device is a phone, laptop, desktop, or host signed into the same private network as Project OS. Online devices can usually open private app links; offline devices are simply unavailable until they reconnect.
          </p>

          <div className="mt-5 grid gap-3">
            {state.devices.length ? state.devices.map((device) => (
              <DeviceRow
                access={accessForDevice(device, state.tailscale, privateApps.length, deviceViewsById.get(device.id))}
                device={device}
                deviceView={deviceViewsById.get(device.id)}
                key={device.id}
                onSelect={() => setSelectedDeviceId(device.id)}
                selected={selectedDevice?.id === device.id}
                showAdvancedMetrics={showAdvancedMetrics}
              />
            )) : (
              <EmptyState title="No devices found" message="Connect Tailscale on this host and your personal devices to see them here." />
            )}
          </div>
        </SurfacePanel>

        <aside className="space-y-5">
          <DeviceDetailCard
            access={accessSummary}
            copied={copied}
            device={selectedDevice}
            deviceView={selectedDeviceView}
            onEdit={selectedDeviceView ? () => openEditDevice(selectedDeviceView) : undefined}
            onCopy={copy}
            privateAppCount={privateApps.length}
            showAdvancedMetrics={showAdvancedMetrics}
          />
          <OnboardingCard steps={state.onboardingSteps} />
          <PrivateAppsCard apps={privateApps} reconciliation={state.reconciliation} />
        </aside>
      </div>

      <DeviceEditDialog
        deviceView={editingDevice}
        form={deviceForm}
        onChange={setDeviceForm}
        onClose={() => setEditingDevice(null)}
        onSave={saveDevice}
        saving={savingDevice}
      />
    </PageShell>
  );
}

function getDeviceHero(tailscale: TailscaleStatus | null, trustedCount: number, onlineCount: number, privateAppCount: number) {
  if (!tailscale?.connected) {
    return {
      summary: 'Connect Project OS to Tailscale before phones, laptops, and desktops can use private app links.',
      title: 'Which devices can reach my private apps?',
    };
  }
  if (privateAppCount === 0) {
    return {
      summary: `${trustedCount} trusted ${trustedCount === 1 ? 'device is' : 'devices are'} known, but no private apps are configured yet.`,
      title: 'Trusted devices are ready',
    };
  }
  return {
    summary: `${onlineCount} trusted ${onlineCount === 1 ? 'device is' : 'devices are'} online now and ${privateAppCount} private ${privateAppCount === 1 ? 'app is' : 'apps are'} available to check.`,
    title: 'Which devices can reach my private apps?',
  };
}

export default DevicesPage;
