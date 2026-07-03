import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ExternalLink, Pin, RefreshCw, ShieldAlert } from 'lucide-react';
import { ObservedServicesAPIClient } from '@/api/ObservedServicesAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { PageShell } from '@/components/layout/PageShell';
import { DisabledAction } from '@/components/project-os/DisabledAction';
import { ProjectDarkControlButton, ProjectPrimaryButton } from '@/components/primitives/ProjectButtons';
import { StatusPill } from '@/components/primitives/StatusPill';
import { Surface } from '@/components/primitives/Surface';
import { showActionErrorNotification, showActionNotification } from '@/lib/actionNotifications';
import { cn } from '@/lib/utils';
import { useApplicationStateRepository } from '@/repositories/applicationStateRepository';
import { syncCanonicalAppMutationResult } from '@/repositories/canonicalAppMutationRepository';
import type { ObservedServiceActionResult, ObservedServiceView } from '@/types/observedService';
import { ObservedServiceDetailsSheet } from './ObservedServiceDetailsSheet';
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
      syncCanonicalAppMutationResult(queryClient, result);
      showActionNotification(result, result.title || `${service.displayName} pinned`);
    } catch (pinError) {
      showActionErrorNotification(pinError, 'Service could not be pinned');
    } finally {
      setBusyId(null);
    }
  }

  function handleObservedServiceResult(result: ObservedServiceActionResult) {
    syncCanonicalAppMutationResult(queryClient, result);
    showActionNotification(result, result.title || 'Service action finished');
  }

  return (
    <PageShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-3xl font-bold text-white">Resolve Existing Apps</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            Review services Autark-OS found on this server before installing duplicate managed apps.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DisabledAction disabled={appState.isFetching} reason="Autark-OS is already refreshing existing apps.">
            <ProjectDarkControlButton disabled={appState.isFetching} onClick={() => void refreshObservedServices()} type="button">
              <RefreshCw className={cn('size-4', appState.isFetching && 'animate-spin')} />
              Refresh
            </ProjectDarkControlButton>
          </DisabledAction>
          <ProjectPrimaryButton asChild>
            <Link to="/apps">My Apps</Link>
          </ProjectPrimaryButton>
        </div>
      </div>

      {error && (
        <Surface className="border-red-400/35 bg-red-500/10 p-4 text-red-100" tone="danger">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-black text-white">Existing apps could not load</h2>
              <p className="mt-1 text-sm leading-6 text-red-100/85">{error}</p>
            </div>
            <ProjectDarkControlButton className="border-red-300/30 text-red-100 hover:bg-red-500/20" onClick={() => void refreshObservedServices()} type="button">
              Retry
            </ProjectDarkControlButton>
          </div>
        </Surface>
      )}

      {appState.isLoading ? (
        <Surface className="grid min-h-[22rem] place-items-center p-8 text-center" tone="panel">
          <div>
            <RefreshCw className="mx-auto size-7 animate-spin text-cyan-200" />
            <p className="mt-4 text-base font-black text-white">Loading existing apps</p>
            <p className="mt-1 text-sm leading-6 text-slate-400">Checking observed services and ownership state.</p>
          </div>
        </Surface>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.2fr)]">
          <ResolvePanel>
            <div>
              <h2 className="text-lg font-bold text-white">{visibleServices.length} observed service{visibleServices.length === 1 ? '' : 's'}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-400">Select a found or pinned service to review safe actions.</p>
            </div>
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
              <ResolveCard>
                <p className="m-0 font-bold text-white">No unresolved existing apps</p>
                <p className="m-0 mt-1 text-sm text-slate-400">Autark-OS is not prompting for any non-managed services right now.</p>
              </ResolveCard>
            )}
          </ResolvePanel>

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
    <ResolveCard className={cn('transition hover:-translate-y-0.5 hover:border-cyan-300/45 hover:bg-slate-800', selected && 'border-cyan-300/45 shadow-lg shadow-cyan-950/30 ring-1 ring-cyan-300/40')}>
      <button className="w-full text-left" onClick={onReview} type="button">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="m-0 text-lg font-bold text-white">{service.displayName}</h2>
          <StatusPill tone={stateTone(service)}>{stateLabel(service)}</StatusPill>
        </div>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-400">{service.userStatusDescription || 'Autark-OS found this service on the server.'}</p>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <Detail label="Runtime" value={service.runtimeState || 'Unknown'} />
          <Detail label="Catalog match" value={service.catalogAppId || 'Unmatched'} />
        </dl>
      </button>
      <div className="mt-4 flex flex-wrap gap-2">
        {service.url && (
          <ProjectDarkControlButton asChild size="sm">
            <a href={service.url} rel="noreferrer" target="_blank">
              <ExternalLink className="size-4" />
              Open
            </a>
          </ProjectDarkControlButton>
        )}
        <ProjectPrimaryButton onClick={onReview} size="sm" type="button">
          <ShieldAlert className="size-4" />
          Review
        </ProjectPrimaryButton>
        {canPin && (
          <DisabledAction disabled={busy} reason="Autark-OS is already pinning this service.">
            <ProjectDarkControlButton disabled={busy} onClick={onPin} size="sm" type="button">
              <Pin className="size-4" />
              Pin to My Apps
            </ProjectDarkControlButton>
          </DisabledAction>
        )}
      </div>
    </ResolveCard>
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
      <ResolveCard>
        <p className="m-0 font-bold text-white">No service selected</p>
        <p className="mt-1 text-sm text-slate-400">Select a found or pinned service to review actions.</p>
      </ResolveCard>
    );
  }

  const actions = resolveExistingServiceActions(service);
  const canPin = actions.some((action) => action.id === 'pin');

  return (
    <ResolvePanel>
      <h2 className="text-lg font-bold text-white">Service Details</h2>
      <ResolveCard>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="m-0 text-2xl font-bold text-white">{service.displayName}</h3>
              <StatusPill tone={stateTone(service)}>{stateLabel(service)}</StatusPill>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{service.userStatusDescription || 'Autark-OS found this service on the server.'}</p>
          </div>
          {service.url && (
            <ProjectDarkControlButton asChild>
              <a href={service.url} rel="noreferrer" target="_blank">
                <ExternalLink className="size-4" />
                Open
              </a>
            </ProjectDarkControlButton>
          )}
        </div>

        <dl className="mt-5 grid gap-3 text-sm md:grid-cols-2">
          <Detail label="Source" value={service.source || 'Unknown'} />
          <Detail label="Runtime" value={service.runtimeState || 'Unknown'} />
          <Detail label="Access" value={service.accessScope || 'Unknown'} />
          <Detail label="Catalog match" value={service.catalogAppId || 'Unmatched'} />
        </dl>

        <div className="mt-5 grid gap-3 rounded-lg border border-sky-400/25 bg-slate-800 p-4">
          <h3 className="m-0 text-base font-bold text-white">Available Actions</h3>
          <div className="flex flex-wrap gap-2">
            <DisabledAction disabled={!onReview} reason="Select a found service before reviewing details.">
              <ProjectPrimaryButton disabled={!onReview} onClick={onReview} type="button">
                <ShieldAlert className="size-4" />
                Review service details
              </ProjectPrimaryButton>
            </DisabledAction>
            {canPin && (
              <DisabledAction disabled={busy || !onPin} reason={busy ? 'Autark-OS is already pinning this service.' : 'Select a found service before pinning it.'}>
                <ProjectDarkControlButton disabled={busy || !onPin} onClick={onPin} type="button">
                  <Pin className="size-4" />
                  Pin to My Apps
                </ProjectDarkControlButton>
              </DisabledAction>
            )}
          </div>
        </div>
      </ResolveCard>
    </ResolvePanel>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold uppercase tracking-normal text-slate-500">{label}</dt>
      <dd className="m-0 mt-1 truncate text-slate-200" title={value}>{value || 'Unknown'}</dd>
    </div>
  );
}

function ResolvePanel({ children }: { children: ReactNode }) {
  return <Surface className="grid gap-4 p-5" tone="panel">{children}</Surface>;
}

function ResolveCard({ children, className }: { children: ReactNode; className?: string }) {
  return <Surface className={cn('p-4', className)} tone="muted">{children}</Surface>;
}

function stateLabel(service: ObservedServiceView) {
  if (service.managedByThisProjectOs) return 'Managed';
  if (service.pinned || service.userStatus === 'pinned_external') return 'Pinned';
  if (service.userStatus === 'recoverable') return 'Recoverable';
  if (service.userStatus === 'managed_elsewhere') return 'Managed elsewhere';
  if (service.userStatus === 'blocked') return 'Blocked';
  if (service.userStatus === 'failed_install') return 'Install failed';
  return 'Found';
}

function stateTone(service: ObservedServiceView): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  if (service.managedByThisProjectOs) return 'success';
  if (service.userStatus === 'managed_elsewhere' || service.userStatus === 'blocked') return 'danger';
  if (service.userStatus === 'recoverable' || service.userStatus === 'failed_install') return 'warning';
  if (service.pinned || service.userStatus === 'pinned_external') return 'info';
  return 'neutral';
}

export default ResolveExistingAppsPage;
