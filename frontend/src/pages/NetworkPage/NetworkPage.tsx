import { Network, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { RefreshStatus } from '@/components/RefreshStatus';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { StatusBadge } from '@/components/autark-os/StatusBadge';
import { PageShell } from '@/components/layout/PageShell';
import { ProjectWarningButton } from '@/components/primitives/ProjectButtons';
import { SearchFilterBar } from '@/components/primitives/SearchFilterBar';
import { Surface } from '@/components/primitives/Surface';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MultiSelect } from '@/components/ui/multi-select';
import { InstalledAppsAPIClient } from '@/api/InstalledAppsAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { showActionErrorNotification, showActionNotification } from '@/lib/actionNotifications';
import { copyText } from '@/lib/copyText';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { cn } from '@/lib/utils';
import {
  setRuntimeAppInApplicationStateCache,
  useApplicationStateRepository,
} from '@/repositories/applicationStateRepository';
import { syncCanonicalAppMutationResult } from '@/repositories/canonicalAppMutationRepository';
import {
  invalidateNetworkQueries,
  useAccessNetworkRepository,
  useRemoveStalePrivateAccessMutation,
} from '@/repositories/networkRepository';
import type { PrivateAccessReconciliationReport, TailscaleStatus } from '@/types/network';
import { HostSetupPanel } from './HostSetupPanel';
import { NetworkAdvancedPanel } from './NetworkAdvancedPanel';
import { NetworkDevicesPanel } from './NetworkDevicesPanel';
import { NetworkIssuesPanel } from './NetworkIssuesPanel';
import { ReachabilityMatrix } from './ReachabilityMatrix';
import { AccessLine, AccessPageErrorState, AccessPageLoadingState, NetworkInset, NetworkPanel } from './NetworkPage.shared';
import {
  buildDeviceViews,
  buildNetworkIssues,
  buildReachabilityServices,
} from './extensions/NetworkPage.logic';
import {
  accessDeepLinkForService,
  accessDeepLinkForTab,
  findAccessDeepLinkTarget,
  parseAccessDeepLink,
  type AccessDeepLinkTab,
} from './extensions/NetworkPage.deepLinks';
import type { ReachabilityService, ReachabilityTypeFilter, ReachabilityZoneId } from './extensions/NetworkPage.types';
import {
  acknowledgePendingReachability,
  applyPendingReachability,
  appWithReachabilityZone,
  filterReachabilityServices,
  isPrivateAccessApp,
  removePendingReachabilityForToken,
  removePendingReachabilityIds,
  removeServiceProcessingForToken,
  removeServiceProcessingIds,
  setServiceProcessingToken,
  settingsForReachabilityZone,
  type PendingReachability,
} from './extensions/NetworkPage.reachability';

function NetworkPage() {
  const { showAdvancedMetrics } = useProjectSettings();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const appState = useApplicationStateRepository();
  const network = useAccessNetworkRepository();
  const removeStalePrivateAccess = useRemoveStalePrivateAccessMutation();
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedLinkKey, setCopiedLinkKey] = useState<string | null>(null);
  const [processingServiceTokens, setProcessingServiceTokens] = useState<Record<string, number>>({});
  const [pendingReachabilityByServiceId, setPendingReachabilityByServiceId] = useState<Record<string, PendingReachability>>({});
  const [staleActionLoadingId, setStaleActionLoadingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [focusedServiceId, setFocusedServiceId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [typeFilters, setTypeFilters] = useState<ReachabilityTypeFilter[]>([]);
  const appliedDeepLinkKeyRef = useRef('');
  const pendingReachabilityTokenRef = useRef(0);
  const deepLinkTarget = useMemo(() => parseAccessDeepLink(location.search), [location.search]);

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

  const devices = useMemo(() => buildDeviceViews(network.tailscale, network.tailnetDevices), [network.tailnetDevices, network.tailscale]);
  const pinnedExternalServices = useMemo(() => observedServices.filter((service) => service.userStatus === 'pinned_external'), [observedServices]);
  const issues = useMemo(() => buildNetworkIssues(network.diagnostics, network.reconciliation), [network.diagnostics, network.reconciliation]);
  const reachabilityServices = useMemo(() => buildReachabilityServices({
    apps,
    pinnedExternalServices,
    reconciliation: network.reconciliation,
    tailscale: network.tailscale,
  }), [apps, network.reconciliation, network.tailscale, pinnedExternalServices]);
  const displayedReachabilityServices = useMemo(
    () => applyPendingReachability(reachabilityServices, pendingReachabilityByServiceId),
    [pendingReachabilityByServiceId, reachabilityServices],
  );
  const filteredReachabilityServices = useMemo(
    () => filterReachabilityServices(displayedReachabilityServices, query, typeFilters),
    [displayedReachabilityServices, query, typeFilters],
  );
  const loadingServiceIds = useMemo(
    () => Object.fromEntries(Object.keys(processingServiceTokens).map((serviceId) => [serviceId, true])),
    [processingServiceTokens],
  );
  const selectedTab = !showAdvancedMetrics && activeTab && !['matrix', 'issues'].includes(activeTab) ? 'matrix' : activeTab ?? deepLinkTarget.tab ?? 'matrix';
  const focusedService = useMemo(() => displayedReachabilityServices.find((service) => service.id === focusedServiceId) ?? null, [displayedReachabilityServices, focusedServiceId]);
  const needsReviewCount = issues.length;

  const copyAccessLink = useCallback(async (appId: string, linkKind: string, url: string | null) => {
    if (!url) return;
    const result = await copyText(url);
    if (!result.ok) {
      showActionNotification({ ok: false, severity: 'warning', title: 'Copy unavailable', message: result.message }, 'Copy unavailable');
      return;
    }
    showActionNotification({ ok: true, severity: 'success', title: 'Link copied', message: url }, 'Link copied');
    const copiedKey = `${appId}:${linkKind}`;
    setCopiedLinkKey(copiedKey);
    window.setTimeout(() => setCopiedLinkKey((current) => current === copiedKey ? null : current), 1600);
  }, []);

  const moveReachabilityService = useCallback(async (service: ReachabilityService, targetZone: ReachabilityZoneId) => {
    const app = service.app;
    if (!app || service.zone === targetZone || targetZone === 'public') {
      return;
    }
    let succeeded = false;
    const pendingToken = pendingReachabilityTokenRef.current + 1;
    pendingReachabilityTokenRef.current = pendingToken;
    setProcessingServiceTokens((current) => setServiceProcessingToken(current, service.id, pendingToken));
    setPendingReachabilityByServiceId((current) => ({ ...current, [service.id]: { acknowledged: false, token: pendingToken, zone: targetZone } }));
    setFocusedServiceId(service.id);
    setActionError(null);
    window.setTimeout(() => {
      setProcessingServiceTokens((current) => removeServiceProcessingForToken(current, service.id, pendingToken));
      setPendingReachabilityByServiceId((current) => removePendingReachabilityForToken(current, service.id, pendingToken));
    }, 20000);
    try {
      if (targetZone === 'tailnet') {
        const result = await InstalledAppsAPIClient.enablePrivateAccess(app.appId);
        syncCanonicalAppMutationResult(queryClient, result);
        showActionNotification(result, 'Private Tailnet enabled');
        succeeded = true;
      } else {
        const currentlyPrivate = isPrivateAccessApp(app);
        let appForSettings = app;
        if (currentlyPrivate) {
          const disabled = await InstalledAppsAPIClient.disablePrivateAccess(app.appId);
          syncCanonicalAppMutationResult(queryClient, disabled);
          appForSettings = disabled.app ?? appForSettings;
          if (targetZone === 'local') {
            setRuntimeAppInApplicationStateCache(queryClient, appWithReachabilityZone(appForSettings, targetZone));
            showActionNotification(disabled, 'Private access turned off');
            setPendingReachabilityByServiceId((current) => acknowledgePendingReachability(current, service.id, pendingToken));
            void invalidateNetworkQueries(queryClient);
            succeeded = true;
            return;
          }
        }
        setRuntimeAppInApplicationStateCache(queryClient, appWithReachabilityZone(appForSettings, targetZone));
        const updated = await InstalledAppsAPIClient.updateSettings(app.appId, settingsForReachabilityZone(appForSettings, targetZone));
        syncCanonicalAppMutationResult(queryClient, { app: appWithReachabilityZone(updated, targetZone) });
        showActionNotification({
          ok: true,
          severity: 'success',
          title: `${app.appName} access updated`,
          message: targetZone === 'lan'
            ? 'Autark-OS saved this service for home-network reachability.'
            : 'Autark-OS saved this service for server-only reachability.',
        }, 'Access updated');
        succeeded = true;
      }
      setPendingReachabilityByServiceId((current) => acknowledgePendingReachability(current, service.id, pendingToken));
      void invalidateNetworkQueries(queryClient);
    } catch (err) {
      const message = apiErrorMessage(err, 'Unable to update reachability for this service.');
      setActionError(message);
      showActionErrorNotification(err, 'Reachability update failed');
      void appState.refresh();
    } finally {
      if (!succeeded) {
        setProcessingServiceTokens((current) => removeServiceProcessingForToken(current, service.id, pendingToken));
        setPendingReachabilityByServiceId((current) => removePendingReachabilityForToken(current, service.id, pendingToken));
      }
    }
  }, [appState, queryClient]);

  const removeStaleMapping = useCallback(async (port: number) => {
    setStaleActionLoadingId(`stale-${port}`);
    setActionError(null);
    try {
      await removeStalePrivateAccess.mutateAsync(port);
      showActionNotification({ ok: true, severity: 'success', title: 'Stale private link removed', message: 'Autark-OS removed the stale Tailscale Serve entry.' }, 'Stale private link removed');
      await refreshAll();
    } catch (err) {
      const message = apiErrorMessage(err, 'Unable to remove this stale private link.');
      setActionError(message);
      showActionErrorNotification(err, 'Stale private link removal failed');
    } finally {
      setStaleActionLoadingId(null);
    }
  }, [refreshAll, removeStalePrivateAccess]);

  const handleTabChange = useCallback((tab: string) => {
    const nextTab = tab as AccessDeepLinkTab;
    setActiveTab(nextTab);
    navigate(accessDeepLinkForTab(nextTab, focusedService), { replace: true });
  }, [focusedService, navigate]);

  const focusReachabilityService = useCallback((service: ReachabilityService) => {
    setFocusedServiceId(service.id);
    setActiveTab('matrix');
    navigate(accessDeepLinkForService(service, { tab: 'matrix' }), { replace: true });
  }, [navigate]);

  useEffect(() => {
    if (appliedDeepLinkKeyRef.current === deepLinkTarget.key) {
      return;
    }
    setActiveTab(deepLinkTarget.tab);
    if (!deepLinkTarget.kind || !deepLinkTarget.id) {
      setFocusedServiceId(null);
      appliedDeepLinkKeyRef.current = deepLinkTarget.key;
      return;
    }
    if (!displayedReachabilityServices.length) {
      return;
    }
    const targetService = findAccessDeepLinkTarget(displayedReachabilityServices, deepLinkTarget);
    if (!targetService) {
      return;
    }
    setQuery('');
    setTypeFilters([]);
    setFocusedServiceId(targetService.id);
    appliedDeepLinkKeyRef.current = deepLinkTarget.key;
  }, [deepLinkTarget, displayedReachabilityServices]);

  useEffect(() => {
    const settledServiceIds = Object.entries(pendingReachabilityByServiceId)
    .filter(([serviceId, pending]) => pending.acknowledged && reachabilityServices.find((service) => service.id === serviceId)?.zone === pending.zone)
    .map(([serviceId]) => serviceId);
    if (!settledServiceIds.length) {
      return;
    }
    setProcessingServiceTokens((current) => removeServiceProcessingIds(current, settledServiceIds));
    setPendingReachabilityByServiceId((current) => removePendingReachabilityIds(current, settledServiceIds));
  }, [pendingReachabilityByServiceId, reachabilityServices]);

  return (
    <PageShell
      className="lg:h-[calc(100dvh-7.25rem)] lg:min-h-0"
      contained
      contentClassName="gap-3 lg:h-full lg:min-h-0 lg:!overflow-hidden"
    >
      <AccessPageHeader
        needsReviewCount={needsReviewCount}
        onRefresh={refreshAll}
        refreshing={pageRefreshing}
        serviceCount={reachabilityServices.length}
        updatedAt={appState.updatedAt ?? network.updatedAt}
      />

      {pageError && <AccessPageErrorState message={pageError} onRetry={refreshAll} title="Access status could not load" />}

      {pageLoading ? (
        <AccessPageLoadingState label="Loading Access" sublabel="Checking private app links, local links, and Tailscale status." />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <Tabs className="flex min-h-0 flex-1 flex-col gap-3" onValueChange={handleTabChange} value={selectedTab}>
            <SearchFilterBar
              actions={(
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <ServiceTypeFilterDropdown filters={typeFilters} onChange={setTypeFilters} />
                  <TabsList className="min-w-0 max-w-full justify-start overflow-x-auto rounded-lg border border-sky-400/20 bg-slate-800 p-1" variant="default">
                    <TabsTrigger className="px-3 py-1.5 text-xs text-sky-100/60 data-active:bg-cyan-300/15 data-active:text-cyan-100" value="matrix">Matrix</TabsTrigger>
                    <TabsTrigger className="px-3 py-1.5 text-xs text-sky-100/60 data-active:bg-cyan-300/15 data-active:text-cyan-100" value="issues">Issues</TabsTrigger>
                    {showAdvancedMetrics && <TabsTrigger className="px-3 py-1.5 text-xs text-sky-100/60 data-active:bg-cyan-300/15 data-active:text-cyan-100" value="devices">Devices</TabsTrigger>}
                    {showAdvancedMetrics && <TabsTrigger className="px-3 py-1.5 text-xs text-sky-100/60 data-active:bg-cyan-300/15 data-active:text-cyan-100" value="advanced">Diagnostics</TabsTrigger>}
                  </TabsList>
                </div>
              )}
              className="p-2"
              filterAriaLabel="Filter reachability services"
              onSearchChange={setQuery}
              searchAriaLabel="Search services"
              searchPlaceholder="Search services"
              searchValue={query}
            />
            <TabsContent className="m-0 min-h-0 flex-1 overflow-hidden" value="matrix">
              <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain pr-1">
                <ReachabilityMatrix
                  className="min-h-[32rem] lg:min-h-0 lg:flex-1"
                  copiedLinkKey={copiedLinkKey}
                  focusedServiceId={focusedServiceId}
                  items={filteredReachabilityServices}
                  loadingServiceIds={loadingServiceIds}
                  onCopyLink={copyAccessLink}
                  onFocusService={focusReachabilityService}
                  onMoveService={moveReachabilityService}
                />
                <StalePrivateLinksPanel
                  loadingId={staleActionLoadingId}
                  onRemoveStaleMapping={removeStaleMapping}
                  reconciliation={network.reconciliation}
                />
              </div>
            </TabsContent>
            <TabsContent className="m-0 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1" value="issues">
              <NetworkIssuesPanel issues={issues} onReviewPrivateLinks={() => handleTabChange('matrix')} />
            </TabsContent>
            {showAdvancedMetrics && <TabsContent className="m-0 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1" value="devices">
              <NetworkDevicesPanel devices={devices} />
            </TabsContent>}
            {showAdvancedMetrics && <TabsContent className="m-0 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1" value="advanced">
              <div className="grid gap-3">
                <HostSetupPanel setup={network.setupStatus} />
                <NetworkAdvancedPanel diagnostics={network.diagnostics} guide={network.guide} tailscale={network.tailscale} />
              </div>
            </TabsContent>}
          </Tabs>
        </div>
      )}
    </PageShell>
  );
}

function AccessPageHeader({
  needsReviewCount,
  onRefresh,
  refreshing,
  serviceCount,
  updatedAt,
}: {
  needsReviewCount: number;
  onRefresh: () => void;
  refreshing: boolean;
  serviceCount: number;
  updatedAt: Date | null;
}) {
  return (
    <Surface as="header" className="overflow-hidden border-sky-300/15 bg-[#07142b]/90 shadow-xl shadow-slate-950/20" tone="panel">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="hidden size-10 shrink-0 place-items-center rounded-xl border border-cyan-300/35 bg-cyan-400/10 text-cyan-200 sm:grid">
            <Network aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <h1 className="m-0 text-3xl font-semibold tracking-tight text-white sm:text-[2.1rem]">Access</h1>
            <p className="m-0 text-sm text-sky-100/70">Private links, home-network access, and service reachability.</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <AccessSummaryMetric label="Reachable services" value={serviceCount} />
          <AccessSummaryMetric attention={needsReviewCount > 0} label="Needs review" value={needsReviewCount} />
          <RefreshStatus intervalLabel="Auto-updates every 10s" onRefresh={onRefresh} refreshing={refreshing} tone="info" updatedAt={updatedAt} />
        </div>
      </div>
    </Surface>
  );
}

function AccessSummaryMetric({ attention = false, label, value }: { attention?: boolean; label: string; value: number }) {
  return (
    <div className={cn(
      'min-w-28 rounded-xl border border-sky-300/15 bg-slate-950/25 px-3 py-2 text-right',
      attention && 'border-amber-300/30 bg-amber-400/5',
    )}>
      <p className={cn('text-lg font-semibold leading-none text-white', attention && 'text-amber-100')}>{value}</p>
      <p className="mt-1 text-[0.68rem] text-slate-400">{label}</p>
    </div>
  );
}

function StalePrivateLinksPanel({
  loadingId,
  onRemoveStaleMapping,
  reconciliation,
}: {
  loadingId: string | null;
  onRemoveStaleMapping: (port: number) => void;
  reconciliation: PrivateAccessReconciliationReport | null;
}) {
  if (!reconciliation?.staleMappings?.length) {
    return null;
  }
  return (
    <NetworkPanel
      className="mt-5 border-orange-400/45"
      description="These private links do not match a service that currently wants Private Tailnet access."
      title="Advanced cleanup"
    >
      {reconciliation.staleMappings.map((mapping) => (
        <NetworkInset className="grid gap-3 rounded-lg border-orange-400/30 p-4 md:grid-cols-[minmax(0,1fr)_auto]" key={mapping.id}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-slate-50">HTTPS port {mapping.servePort ?? 'unknown'}</h3>
              <StatusBadge tone="warning">Stale private link</StatusBadge>
            </div>
            <p className="mt-2 text-sm text-orange-100/80">{mapping.detail}</p>
            <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
              <AccessLine label="Endpoint" value={mapping.endpoint || 'Unknown endpoint'} />
              <AccessLine label="Routes to" value={mapping.target || 'Unknown target'} />
            </div>
          </div>
          <AlertDialog>
            <DisabledAction disabled={!mapping.servePort || loadingId === `stale-${mapping.servePort}`} reason={!mapping.servePort ? 'Autark-OS needs the stale Tailscale port before cleanup.' : 'Autark-OS is already reviewing this stale private link.'}>
              <AlertDialogTrigger asChild>
                <ProjectWarningButton disabled={!mapping.servePort || loadingId === `stale-${mapping.servePort}`} type="button">
                  <Trash2 className={cn('size-4', loadingId === `stale-${mapping.servePort}` && 'animate-pulse')} />
                  Remove stale link
                </ProjectWarningButton>
              </AlertDialogTrigger>
            </DisabledAction>
            <AlertDialogContent className="border-orange-400/30 bg-slate-950 text-slate-100">
              <AlertDialogHeader>
                <AlertDialogTitle>Remove this stale private link?</AlertDialogTitle>
                <AlertDialogDescription className="text-slate-400">
                  Autark-OS will remove the Tailscale Serve entry for HTTPS port {mapping.servePort ?? 'unknown'}. Active service links should be changed from the matrix.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800">Keep link</AlertDialogCancel>
                <AlertDialogAction className="bg-orange-500 text-white hover:bg-orange-400" onClick={() => mapping.servePort && onRemoveStaleMapping(mapping.servePort)}>
                  Remove stale link
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </NetworkInset>
      ))}
    </NetworkPanel>
  );
}

function ServiceTypeFilterDropdown({
  filters,
  onChange,
}: {
  filters: ReachabilityTypeFilter[];
  onChange: (filters: ReachabilityTypeFilter[]) => void;
}) {
  const options: Array<{ label: string; value: ReachabilityTypeFilter }> = [
    { label: 'Managed apps', value: 'managed' },
    { label: 'Pinned services', value: 'external' },
    { label: 'Needs attention', value: 'attention' },
  ];

  return (
    <MultiSelect
      onValueChange={(value) => onChange(value as ReachabilityTypeFilter[])}
      options={options}
      placeholder="All service types"
      searchPlaceholder="Filter service types"
      value={filters}
    />
  );
}

export default NetworkPage;
