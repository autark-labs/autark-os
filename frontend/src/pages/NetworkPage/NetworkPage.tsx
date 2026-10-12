import axios from 'axios';
import { PageHeader } from '@/components/layout/PageHeader';
import { Network } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { RefreshStatus } from '@/components/RefreshStatus';
import { ContextChip } from '@/components/autark-os/ContextChip';
import { ApplicationStateContent } from '@/components/autark-os/ApplicationStateNotice';
import type { ReactNode } from 'react';
import { PageShell } from '@/components/layout/PageShell';
import { ExtensionActionTarget } from '@/extensions/ExtensionActionTarget';
import { SearchFilterBar } from '@/components/primitives/SearchFilterBar';
import { appBrowserAccessReason } from '@/lib/appBrowserAccess';
import { PageLoadError } from '@/components/autark-os/PageLoadError';
import { SettingsChangeReview } from '@/components/autark-os/SettingsChangeReview';
import type { AppSettingsChangePlan, InstallSettings } from '@/types/app';
import { useAutarkOsJobsQuery, activeJobs } from '@/repositories/jobRepository';
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
} from '@/repositories/networkRepository';
import type { PrivateAccessReconciliationReport } from '@/types/network';
import { applicationDeepLinkForManagedApp } from '@/pages/ApplicationsPage/extensions/ApplicationsPage.deepLinks';
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
import { filterReachabilityServices, settingsForReachabilityZone } from './extensions/NetworkPage.reachability';

function NetworkPage() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const appState = useApplicationStateRepository();
  const network = useAccessNetworkRepository();
  const jobsQuery = useAutarkOsJobsQuery();
  const [review, setReview] = useState<{ appId: string; settings: InstallSettings; plan: AppSettingsChangePlan } | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [planningAppId, setPlanningAppId] = useState<string | null>(null);
  const reviewRequestRef = useRef(0);
  const [copiedLinkKey, setCopiedLinkKey] = useState<string | null>(null);
  const [privateLinksOpen, setPrivateLinksOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [focusedServiceId, setFocusedServiceId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [typeFilters, setTypeFilters] = useState<ReachabilityTypeFilter[]>([]);
  const appliedDeepLinkKeyRef = useRef('');
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

  const reviewRoutes = useMemo(() => new Map(appState.applications.map(application => {
    const action = application.issues.find(issue => issue.id === `private-access-${application.id}`)?.primaryAction;
    const route = action?.route || (action?.method === 'GET' ? action.href : null);
    return [application.id, route || applicationDeepLinkForManagedApp(application.id, { panel: 'manage' })];
  })), [appState.applications]);

  const devices = useMemo(() => buildDeviceViews(network.tailscale, network.tailnetDevices), [network.tailnetDevices, network.tailscale]);
  const issues = useMemo(() => buildNetworkIssues(network.diagnostics, network.reconciliation), [network.diagnostics, network.reconciliation]);
  const reachabilityServices = useMemo(() => buildReachabilityServices({
    apps,
    reconciliation: network.reconciliation,
    tailscale: network.tailscale,
  }).map(service => ({ ...service, reviewHref: reviewRoutes.get(service.id) })), [apps, network.reconciliation, network.tailscale, reviewRoutes]);
  const filteredReachabilityServices = useMemo(
    () => filterReachabilityServices(reachabilityServices, query, typeFilters),
    [reachabilityServices, query, typeFilters],
  );
  const loadingServiceIds = useMemo(() => Object.fromEntries(appState.applications.map(application => [application.id,
    planningAppId === application.id || reviewBusy && review?.appId === application.id
    || !['idle', 'failed'].includes(application.operation.kind)
    || activeJobs(jobsQuery.data ?? []).some(job => job.subjectId === application.id),
  ])), [appState.applications, planningAppId, reviewBusy, review, jobsQuery.data]);
  const selectedTab = activeTab ?? deepLinkTarget.tab ?? 'matrix';
  const focusedService = useMemo(() => reachabilityServices.find((service) => service.id === focusedServiceId) ?? null, [reachabilityServices, focusedServiceId]);
  const issuesStale = Boolean(network.diagnosticsError || network.reconciliationError);
  const issuesUnavailable = Boolean(network.diagnosticsError && !network.diagnostics || network.reconciliationError && !network.reconciliation);
  const needsReviewCount = issuesStale ? null : issues.length;

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

  const moveReachabilityService = useCallback(async (service: ReachabilityService, targetZone: ReachabilityZoneId | 'lan-and-private') => {
    if (!service.app || targetZone === 'public' || loadingServiceIds[service.id]) return;
    const settings = settingsForReachabilityZone(service.app, targetZone);
    if (settings.desiredAccessMode === service.app.settings?.desiredAccessMode) return;
    const requestId = ++reviewRequestRef.current;
    setPlanningAppId(service.id);
    setReviewError(null);
    try {
      const plan = await InstalledAppsAPIClient.settingsChangePlan(service.app.appId, settings);
      if (requestId === reviewRequestRef.current) setReview({ appId: service.app.appId, settings, plan });
    } catch (error) {
      showActionErrorNotification(error, 'Access review unavailable');
    } finally {
      if (requestId === reviewRequestRef.current) setPlanningAppId(null);
    }
  }, [loadingServiceIds]);

  async function applyAccessReview() {
    if (!review || reviewBusy) return;
    setReviewBusy(true);
    setReviewError(null);
    try {
      const result = await InstalledAppsAPIClient.updateSettings(review.appId, review.settings, review.plan.planId);
      syncCanonicalAppMutationResult(queryClient, result);
      showActionNotification(result);
      setReview(null);
      void invalidateNetworkQueries(queryClient);
    } catch (error) {
      const message = axios.isAxiosError(error) && !error.response
        ? 'The response was lost. The job may still be running. Check Activity; submitting this same review again retrieves the accepted job.'
        : apiErrorMessage(error, 'The change could not be confirmed. Review the current settings before trying again.');
      setReviewError(message);
      showActionNotification({ ok: false, severity: 'error', title: 'Access change could not be confirmed', message });
      void appState.refresh().catch(() => {});
    } finally {
      setReviewBusy(false);
    }
  }

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
    if (!reachabilityServices.length) {
      return;
    }
    const targetService = findAccessDeepLinkTarget(reachabilityServices, deepLinkTarget);
    if (!targetService) {
      return;
    }
    setQuery('');
    setTypeFilters([]);
    setFocusedServiceId(targetService.id);
    appliedDeepLinkKeyRef.current = deepLinkTarget.key;
  }, [deepLinkTarget, reachabilityServices]);

  return (
    <PageShell
      className="lg:h-[calc(100dvh-7.25rem)] lg:min-h-0"
      contained
      contentClassName="gap-3 lg:h-full lg:min-h-0 lg:!overflow-hidden"
    >
      <SettingsChangeReview open={Boolean(review)} onOpenChange={open => { if (!open && !reviewBusy) setReview(null); }} plan={review?.plan ?? null} busy={reviewBusy} error={reviewError} onConfirm={() => void applyAccessReview()} />
      <ExtensionActionTarget actionId="review-access" routeId="access">
        <AccessPageHeader
          error={pageError}
          context={<StalePrivateLinksPanel open={privateLinksOpen} onOpenChange={setPrivateLinksOpen} reconciliation={network.reconciliation} error={Boolean(network.reconciliationError)} />}
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
              {issuesUnavailable ? (
                <PageLoadError model={{ title: 'Issue checks unavailable', message: 'Autark-OS could not check every source. Refresh to try again.' }} onRetry={() => void refreshAll()} />
              ) : (
                <NetworkIssuesPanel
                  stale={issuesStale}
                  issues={issues}
                  onReviewPrivateLinks={() => setPrivateLinksOpen(true)}
                  onReviewServices={appId => {
                    if (appId) navigate(reviewRoutes.get(appId) || applicationDeepLinkForManagedApp(appId, { panel: 'manage' }));
                    else handleTabChange('matrix');
                  }}
                />
              )}
            </TabsContent>
            <TabsContent className="m-0 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1" value="devices">
              {network.devicesError && !network.hasDeviceData ? (
                <PageLoadError model={{ title: 'Device list unavailable', message: 'Tailscale devices could not be read. Refresh to try again.' }} onRetry={() => void refreshAll()} />
              ) : <NetworkDevicesPanel devices={devices} />}
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
  needsReviewCount: number | null;
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
  reconciliation,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reconciliation: PrivateAccessReconciliationReport | null;
  error: boolean;
}) {
  const mappings = reconciliation?.staleMappings ?? [];
  return (
    <ContextChip open={open} onOpenChange={onOpenChange} className="w-40" label={error ? reconciliation ? 'Links stale' : 'Links unavailable' : mappings.length ? `${mappings.length} unused link${mappings.length === 1 ? '' : 's'}` : 'Private links'} title="Access / Unused private links" tone={error || mappings.length ? 'warning' : 'muted'}>
      {error && <p className="text-xs text-amber-200">Private-link checks could not refresh.{reconciliation ? ' Showing the last confirmed links.' : ' Use Refresh to try again.'}</p>}
      <p className="text-xs text-muted-foreground">{!reconciliation ? 'Private links have not been checked yet.' : mappings.length ? 'These links no longer match an app’s private-access settings. Ownership must be confirmed before a mapping can be changed.' : 'No unused private links were found.'}</p>
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
          <p className="text-xs text-muted-foreground">{mapping.detail || 'Ownership could not be confirmed. Autark-OS leaves this mapping unchanged; review it in Tailscale diagnostics.'}</p>
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
