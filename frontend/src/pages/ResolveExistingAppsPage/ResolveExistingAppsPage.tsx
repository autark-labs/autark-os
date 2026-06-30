import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ExternalLink, Pin, RefreshCw, ShieldAlert } from 'lucide-react';
import { ObservedServicesAPIClient } from '@/api/ObservedServicesAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { DisabledAction } from '@/components/project-os/DisabledAction';
import { PageErrorState, PageLoadingState } from '@/components/project-os/PageState';
import { PageSection, PageShell, SoftCard, StatusPill } from '@/components/project-os/ProjectOSComponents';
import { Button } from '@/components/ui/button';
import { showActionErrorNotification, showActionNotification } from '@/lib/actionNotifications';
import { cn } from '@/lib/utils';
import { setApplicationStateFromActionResultCache, useApplicationStateRepository } from '@/repositories/applicationStateRepository';
import type { ObservedServiceActionResult, ObservedServiceView } from '@/types/observedService';
import { ObservedServiceDetailsSheet } from '../ApplicationsPage/ObservedServiceDetailsSheet';
import {
  resolveExistingServiceActions,
  visibleResolveExistingServices,
} from './ResolveExistingAppsPage.logic';

function ResolveExistingAppsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedServiceId = searchParams.get('service') || searchParams.get('resource');
  const queryClient = useQueryClient();
  const appState = useApplicationStateRepository();
  const [selectedId, setSelectedId] = useState<string | null>(requestedServiceId);
  const [localError, setLocalError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const services = appState.observedServices;
  const error = localError || (appState.error ? apiErrorMessage(appState.error, 'Existing apps could not be loaded.') : null);
  const visibleServices = useMemo(() => visibleResolveExistingServices(services) as ObservedServiceView[], [services]);

  useEffect(() => {
    if (!visibleServices.length) {
      setSelectedId(null);
      return;
    }
    if (requestedServiceId && visibleServices.some((service) => service.id === requestedServiceId)) {
      setSelectedId(requestedServiceId);
      return;
    }
    if (!selectedId || !visibleServices.some((service) => service.id === selectedId)) {
      setSelectedId(visibleServices[0].id);
    }
  }, [requestedServiceId, selectedId, visibleServices]);

  const selectedService = visibleServices.find((service) => service.id === selectedId) ?? null;

  function selectService(serviceId: string) {
    setSelectedId(serviceId);
    const next = new URLSearchParams(searchParams);
    next.set('service', serviceId);
    next.delete('resource');
    setSearchParams(next);
  }

  function closeDetailsSheet() {
    const next = new URLSearchParams(searchParams);
    next.delete('service');
    next.delete('resource');
    setSearchParams(next);
  }

  async function refreshObservedServices() {
    setLocalError(null);
    await appState.refresh();
  }

  async function pinService(service: ObservedServiceView) {
    setBusyId(service.id);
    try {
      const result = await ObservedServicesAPIClient.pin(service.id);
      const stateUpdated = setApplicationStateFromActionResultCache(queryClient, result);
      showActionNotification(result, result.title || `${service.displayName} pinned`);
      if (!stateUpdated) {
        void appState.refresh();
      }
    } catch (pinError) {
      showActionErrorNotification(pinError, 'Service could not be pinned');
    } finally {
      setBusyId(null);
    }
  }

  function handleObservedServiceResult(result: ObservedServiceActionResult) {
    const stateUpdated = setApplicationStateFromActionResultCache(queryClient, result);
    showActionNotification(result, result.title || 'Service action finished');
    if (!stateUpdated) {
      void appState.refresh();
    }
  }

  return (
    <PageShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-3xl font-bold text-po-text">Resolve Existing Apps</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-po-text-muted">
            Review services Project OS found on this server before installing duplicate managed apps.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DisabledAction disabled={appState.isFetching} reason="Project OS is already refreshing existing apps.">
            <Button disabled={appState.isFetching} onClick={() => void refreshObservedServices()} type="button" variant="outline">
              <RefreshCw className={cn('size-4', appState.isFetching && 'animate-spin')} />
              Refresh
            </Button>
          </DisabledAction>
          <Button asChild>
            <Link to="/apps">My Apps</Link>
          </Button>
        </div>
      </div>

      {error && <PageErrorState message={error} onRetry={() => void refreshObservedServices()} title="Existing apps could not load" />}

      {appState.isLoading ? (
        <PageLoadingState label="Loading existing apps" sublabel="Checking observed services and ownership state." />
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.2fr)]">
          <PageSection
            description="Select a found or pinned service to review safe actions."
            title={`${visibleServices.length} observed service${visibleServices.length === 1 ? '' : 's'}`}
          >
            {visibleServices.length ? (
              <div className="grid gap-3">
                {visibleServices.map((service) => (
                  <ServiceSummaryCard
                    busy={busyId === service.id}
                    key={service.id}
                    onPin={() => pinService(service)}
                    onReview={() => selectService(service.id)}
                    selected={selectedId === service.id}
                    service={service}
                  />
                ))}
              </div>
            ) : (
              <SoftCard>
                <p className="m-0 font-bold text-po-text">No unresolved existing apps</p>
                <p className="m-0 mt-1 text-sm text-po-text-muted">Project OS is not prompting for any non-managed services right now.</p>
              </SoftCard>
            )}
          </PageSection>

          <ServiceDetailsPreview
            busy={Boolean(selectedService && busyId === selectedService.id)}
            onPin={selectedService ? () => pinService(selectedService) : undefined}
            onReview={selectedService ? () => selectService(selectedService.id) : undefined}
            service={selectedService}
          />
        </div>
      )}

      <ObservedServiceDetailsSheet
        onActionComplete={handleObservedServiceResult}
        onOpenChange={(open) => !open && closeDetailsSheet()}
        onRefresh={refreshObservedServices}
        open={Boolean(requestedServiceId)}
        service={selectedService}
      />
    </PageShell>
  );
}

function ServiceSummaryCard({
  busy,
  onPin,
  onReview,
  selected,
  service,
}: {
  busy: boolean;
  onPin: () => void;
  onReview: () => void;
  selected: boolean;
  service: ObservedServiceView;
}) {
  const actions = resolveExistingServiceActions(service);
  const canPin = actions.some((action) => action.id === 'pin');
  return (
    <SoftCard className={cn(selected && 'ring-2 ring-po-brand')} interactive>
      <button className="w-full text-left" onClick={onReview} type="button">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="m-0 text-lg font-bold text-po-text">{service.displayName}</h2>
          <StatusPill tone={stateTone(service)}>{stateLabel(service)}</StatusPill>
        </div>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-po-text-muted">{service.userStatusDescription || 'Project OS found this service on the server.'}</p>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <Detail label="Runtime" value={service.runtimeState || 'Unknown'} />
          <Detail label="Catalog match" value={service.catalogAppId || 'Unmatched'} />
        </dl>
      </button>
      <div className="mt-4 flex flex-wrap gap-2">
        {service.url && (
          <Button asChild size="sm" variant="outline">
            <a href={service.url} rel="noreferrer" target="_blank">
              <ExternalLink className="size-4" />
              Open
            </a>
          </Button>
        )}
        <Button onClick={onReview} size="sm" type="button">
          <ShieldAlert className="size-4" />
          Review
        </Button>
        {canPin && (
          <DisabledAction disabled={busy} reason="Project OS is already pinning this service.">
            <Button disabled={busy} onClick={onPin} size="sm" type="button" variant="outline">
              <Pin className="size-4" />
              Pin to My Apps
            </Button>
          </DisabledAction>
        )}
      </div>
    </SoftCard>
  );
}

function ServiceDetailsPreview({
  busy,
  onPin,
  onReview,
  service,
}: {
  busy: boolean;
  onPin?: () => void;
  onReview?: () => void;
  service: ObservedServiceView | null;
}) {
  if (!service) {
    return (
      <SoftCard>
        <p className="m-0 font-bold text-po-text">No service selected</p>
        <p className="mt-1 text-sm text-po-text-muted">Select a found or pinned service to review actions.</p>
      </SoftCard>
    );
  }

  const actions = resolveExistingServiceActions(service);
  const canPin = actions.some((action) => action.id === 'pin');

  return (
    <PageSection title="Service Details">
      <SoftCard>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="m-0 text-2xl font-bold text-po-text">{service.displayName}</h2>
              <StatusPill tone={stateTone(service)}>{stateLabel(service)}</StatusPill>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-po-text-muted">{service.userStatusDescription || 'Project OS found this service on the server.'}</p>
          </div>
          {service.url && (
            <Button asChild variant="outline">
              <a href={service.url} rel="noreferrer" target="_blank">
                <ExternalLink className="size-4" />
                Open
              </a>
            </Button>
          )}
        </div>

        <dl className="mt-5 grid gap-3 text-sm md:grid-cols-2">
          <Detail label="Source" value={service.source || 'Unknown'} />
          <Detail label="Runtime" value={service.runtimeState || 'Unknown'} />
          <Detail label="Access" value={service.accessScope || 'Unknown'} />
          <Detail label="Catalog match" value={service.catalogAppId || 'Unmatched'} />
        </dl>

        <div className="mt-5 grid gap-3 rounded-lg border border-po-border bg-po-surface-inset p-4">
          <h3 className="m-0 text-base font-bold text-po-text">Available Actions</h3>
          <div className="flex flex-wrap gap-2">
            <DisabledAction disabled={!onReview} reason="Select a found service before reviewing details.">
              <Button disabled={!onReview} onClick={onReview} type="button">
                <ShieldAlert className="size-4" />
                Review service details
              </Button>
            </DisabledAction>
            {canPin && (
              <DisabledAction disabled={busy || !onPin} reason={busy ? 'Project OS is already pinning this service.' : 'Select a found service before pinning it.'}>
                <Button disabled={busy || !onPin} onClick={onPin} type="button" variant="outline">
                  <Pin className="size-4" />
                  Pin to My Apps
                </Button>
              </DisabledAction>
            )}
          </div>
        </div>
      </SoftCard>
    </PageSection>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold uppercase tracking-normal text-po-text-muted">{label}</dt>
      <dd className="m-0 mt-1 truncate text-po-text" title={value}>{value || 'Unknown'}</dd>
    </div>
  );
}

function stateLabel(service: ObservedServiceView) {
  if (service.managedByThisProjectOs) return 'Managed';
  if (service.pinned || service.userStatus === 'pinned_external') return 'Pinned';
  if (service.userStatus === 'recoverable') return 'Recoverable';
  if (service.userStatus === 'managed_elsewhere') return 'Managed elsewhere';
  if (service.userStatus === 'blocked') return 'Blocked';
  return 'Found';
}

function stateTone(service: ObservedServiceView): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  if (service.managedByThisProjectOs) return 'success';
  if (service.userStatus === 'managed_elsewhere' || service.userStatus === 'blocked') return 'danger';
  if (service.userStatus === 'recoverable') return 'warning';
  if (service.pinned || service.userStatus === 'pinned_external') return 'info';
  return 'neutral';
}

export default ResolveExistingAppsPage;
