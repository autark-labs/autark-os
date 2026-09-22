import { PageHeader } from '@/components/layout/PageHeader';
import { Network, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { RefreshStatus } from '@/components/RefreshStatus';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { ContextChip } from '@/components/autark-os/ContextChip';
import { ApplicationStateContent } from '@/components/autark-os/ApplicationStateNotice';
import type { ReactNode } from 'react';
import { PageShell } from '@/components/layout/PageShell';
import { ExtensionActionTarget } from '@/extensions/ExtensionActionTarget';
import { ProjectWarningButton } from '@/components/primitives/ProjectButtons';
import { SearchFilterBar } from '@/components/primitives/SearchFilterBar';
import { appBrowserAccessReason } from '@/lib/appBrowserAccess';
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
import { cn } from '@/lib/utils';
import {
  useApplicationStateRepository,
} from '@/repositories/applicationStateRepository';
import { syncCanonicalAppMutationResult } from '@/repositories/canonicalAppMutationRepository';
import {
  invalidateNetworkQueries,
  useAccessNetworkRepository,
  useRemoveStalePrivateAccessMutation,
} from '@/repositories/networkRepository';
import type { PrivateAccessReconciliationReport } from '@/types/network';
import { HostSetupPanel } from './HostSetupPanel';
import { NetworkAdvancedPanel } from './NetworkAdvancedPanel';
import { NetworkDevicesPanel } from './NetworkDevicesPanel';
import { NetworkIssuesPanel } from './NetworkIssuesPanel';
import { ReachabilityMatrix } from './ReachabilityMatrix';
import { AccessLine, AccessPageErrorState, AccessPageLoadingState } from './NetworkPage.shared';
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
  filterReachabilityServices,
  removePendingReachabilityForToken,
  removePendingReachabilityIds,
  removeServiceProcessingForToken,
  removeServiceProcessingIds,
  setServiceProcessingToken,
  settingsForReachabilityZone,
  type PendingReachability,
} from './extensions/NetworkPage.reachability';

function NetworkPage() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const appState = useApplicationStateRepository();
  const network = useAccessNetworkRepository();
  const removeStalePrivateAccess = useRemoveStalePrivateAccessMutation();
  const [copiedLinkKey, setCopiedLinkKey] = useState<string | null>(null);
  const [processingServiceTokens, setProcessingServiceTokens] = useState<Record<string, number>>({});
  const [pendingReachabilityByServiceId, setPendingReachabilityByServiceId] = useState<Record<string, PendingReachability>>({});
  const [privateLinksOpen, setPrivateLinksOpen] = useState(false);
  const [staleActionLoadingId, setStaleActionLoadingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [focusedServiceId, setFocusedServiceId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [typeFilters, setTypeFilters] = useState<ReachabilityTypeFilter[]>([]);
  const appliedDeepLinkKeyRef = useRef('');
  const pendingReachabilityTokenRef = useRef(0);
  const deepLinkTarget = useMemo(() => parseAccessDeepLink(location.search), [location.search]);

  const apps = useMemo(() => appState.applications.flatMap((application) => (
    application.relationship === 'managed' && application.runtime ? [application.runtime] : []
  )), [appState.applications]);
  const pageRefreshing = network.isFetching || appState.isFetching;
  const pageError = (network.error ? apiErrorMessage(network.error, 'Unable to load network status.') : null);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      network.refresh(),
      appState.refresh(),
    ]);
  }, [appState, network]);

  const devices = useMemo(() => buildDeviceViews(network.tailscale, network.tailnetDevices), [network.tailnetDevices, network.tailscale]);
  const issues = useMemo(() => buildNetworkIssues(network.diagnostics, network.reconciliation), [network.diagnostics, network.reconciliation]);
  const reachabilityServices = useMemo(() => buildReachabilityServices({
    apps,
    reconciliation: network.reconciliation,
    tailscale: network.tailscale,
  }), [apps, network.reconciliation, network.tailscale]);
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
  const selectedTab = activeTab ?? deepLinkTarget.tab ?? 'matrix';
  const focusedService = useMemo(() => displayedReachabilityServices.find((service) => service.id === focusedServiceId) ?? null, [displayedReachabilityServices, focusedServiceId]);
  const needsReviewCount = issues.length;

  const copyAccessLink = useCallback(async (appId: string, linkKind: string, url: string | null) => {
    if (!url) return;
    const reason = appBrowserAccessReason(url);
    if (reason) {
      showActionNotification({ ok: false, severity: 'info', title: 'Server-only link', message: reason }, 'Server-only link');
      return;
    }
    const result = await copyText(url);
    if (!result.ok) {
      showActionNotification({ ok: false, severity: 'warning', title: 'Copy unavailable', message: result.message }, 'Copy unavailable');
      return;
    }
    showActionNotification({ ok: true, severity: 'success', title: 'Link copied', message: 'Ready to paste.' }, 'Link copied');
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
        const updated = await InstalledAppsAPIClient.updateSettings(app.appId, settingsForReachabilityZone(app, targetZone));
        syncCanonicalAppMutationResult(queryClient, updated);
        showActionNotification(updated);
        succeeded = true;
      }
      setPendingReachabilityByServiceId((current) => acknowledgePendingReachability(current, service.id, pendingToken));
      void invalidateNetworkQueries(queryClient);
    } catch (err) {
      showActionErrorNotification(err, 'Reachability update failed');
      void appState.refresh().catch(() => {});
    } finally {
      if (!succeeded) {
        setProcessingServiceTokens((current) => removeServiceProcessingForToken(current, service.id, pendingToken));
        setPendingReachabilityByServiceId((current) => removePendingReachabilityForToken(current, service.id, pendingToken));
      }
    }
  }, [appState, queryClient]);

  const removeStaleMapping = useCallback(async (port: number) => {
    setStaleActionLoadingId(`stale-${port}`);
    try {
      await removeStalePrivateAccess.mutateAsync(port);
      showActionNotification({ ok: true, severity: 'success', title: 'Stale private link removed', message: 'Autark-OS removed the stale Tailscale Serve entry.' }, 'Stale private link removed');
      void appState.refresh().catch(() => {});
    } catch (err) {
      showActionErrorNotification(err, 'Stale private link removal failed');
    } finally {
      setStaleActionLoadingId(null);
    }
  }, [appState, removeStalePrivateAccess]);

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
      <ExtensionActionTarget actionId="review-access" routeId="access">
        <AccessPageHeader
          error={pageError}
          context={<StalePrivateLinksPanel open={privateLinksOpen} onOpenChange={setPrivateLinksOpen} loadingId={staleActionLoadingId} onRemoveStaleMapping={removeStaleMapping} reconciliation={network.reconciliation} error={Boolean(network.reconciliationError)} />}
          needsReviewCount={needsReviewCount}
          onRefresh={() => void refreshAll().catch(() => {})}
          refreshing={pageRefreshing}
          serviceCount={appState.freshness.hasUsableData ? reachabilityServices.length : null}
          updatedAt={network.updatedAt}
        />
      </ExtensionActionTarget>

      {network.isLoading ? (
        <AccessPageLoadingState label="Loading Access" sublabel="Checking private app links, local links, and Tailscale status." />
      ) : pageError && (!network.reconciliation || !network.tailscale) ? (
        <AccessPageErrorState message={pageError} onRetry={() => void refreshAll().catch(() => {})} title="Access status could not load" />
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
                    <TabsTrigger className="px-3 py-1.5 text-xs text-sky-100/60 data-active:bg-cyan-300/15 data-active:text-cyan-100" value="devices">Devices</TabsTrigger>
                    <TabsTrigger className="px-3 py-1.5 text-xs text-sky-100/60 data-active:bg-cyan-300/15 data-active:text-cyan-100" value="advanced">Diagnostics</TabsTrigger>
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
              <ApplicationStateContent>
              <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain pr-1">
                <ReachabilityMatrix
                  className="min-h-[32rem] xl:min-h-0 xl:flex-1"
                  copiedLinkKey={copiedLinkKey}
                  focusedServiceId={focusedServiceId}
                  items={filteredReachabilityServices}
                  loadingServiceIds={loadingServiceIds}
                  onCopyLink={copyAccessLink}
                  onFocusService={focusReachabilityService}
                  onMoveService={moveReachabilityService}
                />
              </div>
              </ApplicationStateContent>
            </TabsContent>
            <TabsContent className="m-0 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1" value="issues">
              <NetworkIssuesPanel onReviewServices={() => handleTabChange('matrix')} issues={issues} onReviewPrivateLinks={() => setPrivateLinksOpen(true)} />
            </TabsContent>
            <TabsContent className="m-0 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1" value="devices">
              <NetworkDevicesPanel devices={devices} />
            </TabsContent>
            <TabsContent className="m-0 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1" value="advanced">
              <div className="grid gap-3">
                <HostSetupPanel setup={network.setupStatus} />
                <NetworkAdvancedPanel diagnostics={network.diagnostics} guide={network.guide} tailscale={network.tailscale} />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </PageShell>
  );
}

function AccessPageHeader({
  context,
  error,
  needsReviewCount,
  onRefresh,
  refreshing,
  serviceCount,
  updatedAt,
}: {
  context: ReactNode;
  error: string | null;
  needsReviewCount: number;
  onRefresh: () => void;
  refreshing: boolean;
  serviceCount: number | null;
  updatedAt: Date | null;
}) {
  return (
    <PageHeader icon={Network} title="Access" description="Private links, home-network access, and service reachability." metrics={[
      { label: 'Reachable services', value: serviceCount },
      { label: 'Needs review', value: needsReviewCount },
    ]}>
      {context}
      <RefreshStatus error={error} intervalLabel="Auto-updates every 10s" onRefresh={onRefresh} refreshing={refreshing} tone="info" updatedAt={updatedAt} />
    </PageHeader>
  );
}

function StalePrivateLinksPanel({
  open,
  onOpenChange,
  loadingId,
  onRemoveStaleMapping,
  reconciliation,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadingId: string | null;
  onRemoveStaleMapping: (port: number) => void;
  reconciliation: PrivateAccessReconciliationReport | null;
  error: boolean;
}) {
  const mappings = reconciliation?.staleMappings ?? [];
  return (
    <ContextChip open={open} onOpenChange={onOpenChange} className="w-40" label={error ? reconciliation ? 'Links stale' : 'Links unavailable' : mappings.length ? `${mappings.length} unused link${mappings.length === 1 ? '' : 's'}` : 'Private links'} title="Access / Unused private links" tone={error || mappings.length ? 'warning' : 'muted'}>
      {error && <p className="text-xs text-amber-200">Private-link checks could not refresh.{reconciliation ? ' Showing the last confirmed links.' : ' Use Refresh to try again.'}</p>}
      <p className="text-xs text-muted-foreground">{!reconciliation ? 'Private links have not been checked yet.' : mappings.length ? 'These links no longer match an app’s private-access settings. Review each before removing it.' : 'No unused private links were found.'}</p>
      {mappings.map((mapping) => (
        <div className="grid gap-3 border-t border-border pt-3" key={mapping.id}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-slate-50">HTTPS port {mapping.servePort ?? 'unknown'}</h3>
            </div>
            <div className="mt-2 grid gap-2 text-xs">
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
                  Autark-OS will remove the Tailscale Serve entry for HTTPS port {mapping.servePort ?? 'unknown'}. This link will stop working. No app data will be deleted. Active service links should be changed from the matrix.
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
        </div>
      ))}
    </ContextChip>
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
