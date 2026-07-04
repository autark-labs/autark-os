import { CheckCircle2, CircleAlert, Copy, ExternalLink, GripVertical, Lock, Router, Server, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { DragEvent, MouseEvent } from 'react';
import { useEffect, useState } from 'react';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ProjectDarkControlButton, ProjectOpenButton } from '@/components/primitives/ProjectButtons';
import { cn } from '@/lib/utils';
import type { ReachabilityService, ReachabilityZoneId } from './extensions/NetworkPage.types';
import { NetworkInset, NetworkPanel } from './NetworkPage.shared';

type Zone = {
  id: ReachabilityZoneId;
  title: string;
  summary: string;
  emptyText: string;
  icon: typeof Server;
  droppable: boolean;
  warning?: boolean;
};

const zones: Zone[] = [
  {
    id: 'local',
    title: 'This server',
    summary: 'Keep the service closest to this device.',
    emptyText: 'No server-only services',
    icon: Server,
    droppable: true,
  },
  {
    id: 'lan',
    title: 'Home network',
    summary: 'Useful from devices on this LAN.',
    emptyText: 'No home-network services',
    icon: Router,
    droppable: true,
  },
  {
    id: 'tailnet',
    title: 'Private Tailnet',
    summary: 'Private links for trusted Tailscale devices.',
    emptyText: 'No private services yet',
    icon: ShieldCheck,
    droppable: true,
  },
  {
    id: 'public',
    title: 'Public Internet',
    summary: 'Monitored only. Public publishing is not enabled here.',
    emptyText: 'Public access is off',
    icon: ShieldAlert,
    droppable: false,
    warning: true,
  },
];

export function ReachabilityMatrix({
  copiedLinkKey,
  focusedServiceId,
  items,
  loadingServiceIds,
  onCopyLink,
  onFocusService,
  onMoveService,
}: {
  copiedLinkKey: string | null;
  focusedServiceId: string | null;
  items: ReachabilityService[];
  loadingServiceIds: Record<string, boolean>;
  onCopyLink: (serviceId: string, linkKind: 'local' | 'private', url: string | null) => void;
  onFocusService: (service: ReachabilityService) => void;
  onMoveService: (service: ReachabilityService, zone: ReachabilityZoneId) => void;
}) {
  const [draggedServiceId, setDraggedServiceId] = useState<string | null>(null);
  const [activeDropZone, setActiveDropZone] = useState<ReachabilityZoneId | null>(null);
  const counts = new Map<ReachabilityZoneId, number>();
  zones.forEach((zone) => counts.set(zone.id, items.filter((item) => item.zone === zone.id).length));
  const draggedService = items.find((item) => item.id === draggedServiceId) ?? null;

  useEffect(() => {
    if (!focusedServiceId) {
      return;
    }
    window.setTimeout(() => {
      document.getElementById(reachabilityServiceElementId(focusedServiceId))?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }, 80);
  }, [focusedServiceId, items]);

  function handleDragStart(event: DragEvent<HTMLElement>, service: ReachabilityService) {
    if (!service.draggable || loadingServiceIds[service.id]) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', service.id);
    setDraggedServiceId(service.id);
  }

  function handleDragOver(event: DragEvent<HTMLElement>, zone: Zone) {
    if (!zone.droppable) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setActiveDropZone(zone.id);
  }

  function handleDragEnter(event: DragEvent<HTMLElement>, zone: Zone) {
    if (!zone.droppable) {
      return;
    }
    event.preventDefault();
    setActiveDropZone(zone.id);
  }

  function handleDragLeave(event: DragEvent<HTMLElement>, zone: Zone) {
    if (activeDropZone !== zone.id || event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setActiveDropZone(null);
  }

  function handleDrop(event: DragEvent<HTMLElement>, zone: Zone) {
    event.preventDefault();
    setActiveDropZone(null);
    setDraggedServiceId(null);
    if (!zone.droppable) {
      return;
    }
    const serviceId = event.dataTransfer.getData('text/plain');
    const service = items.find((item) => item.id === serviceId);
    if (!service || service.zone === zone.id || !service.draggable) {
      return;
    }
    onMoveService(service, zone.id);
  }

  function handleDragEnd() {
    setActiveDropZone(null);
    setDraggedServiceId(null);
  }

  return (
    <NetworkPanel
      action={<Badge className="border-sky-400/25 bg-slate-900 text-sky-100/80" variant="outline">{items.length} services</Badge>}
      className="overflow-hidden xl:max-h-[calc(100vh-17rem)]"
      description="Drag a managed service to change where Autark-OS should make it reachable. Open the details only when you need links or repair actions."
      title="Reachability matrix"
    >
      <div className="grid gap-3 xl:grid-cols-4 xl:overflow-hidden">
        {zones.map((zone) => {
          const Icon = zone.icon;
          const zoneItems = items.filter((item) => item.zone === zone.id);
          const showGhost = Boolean(draggedService && activeDropZone === zone.id && draggedService.zone !== zone.id && zone.droppable);
          return (
            <section
              aria-label={zone.title}
              className={cn(
                'grid min-h-[22rem] content-start gap-2 rounded-xl border p-3 transition-colors',
                'xl:max-h-[calc(100vh-24rem)] xl:overflow-y-auto xl:overscroll-contain xl:[contain:layout_paint]',
                zone.warning ? 'border-orange-400/30 bg-orange-500/10' : 'border-sky-400/25 bg-slate-800',
                activeDropZone === zone.id && zone.droppable && 'border-cyan-300/60 bg-slate-700/80',
              )}
              key={zone.id}
              onDragEnter={(event) => handleDragEnter(event, zone)}
              onDragLeave={(event) => handleDragLeave(event, zone)}
              onDragOver={(event) => handleDragOver(event, zone)}
              onDrop={(event) => handleDrop(event, zone)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 gap-2">
                  <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg border', zone.warning ? 'border-orange-400/30 bg-orange-500/10 text-orange-100' : 'border-sky-400/25 bg-slate-900 text-cyan-100')}>
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-50">{zone.title}</h3>
                    <p className="mt-0.5 text-xs leading-5 text-sky-100/60">{zone.summary}</p>
                  </div>
                </div>
                <Badge className={cn('shrink-0 border', zone.warning && counts.get(zone.id) ? 'border-red-400/40 bg-red-500/10 text-red-200' : 'border-sky-400/25 bg-slate-900 text-sky-100/80')} variant="outline">
                  {zone.warning && !counts.get(zone.id) ? 'Off' : counts.get(zone.id)}
                </Badge>
              </div>

              <div className="grid gap-2">
                {showGhost && draggedService && <GhostReachabilityCard service={draggedService} />}
                {zoneItems.length === 0 && !showGhost ? (
                  <div className="rounded-lg border border-dashed border-sky-400/20 px-3 py-4 text-center text-sm text-sky-100/45">
                    {zone.emptyText}
                  </div>
                ) : (
                  zoneItems.map((service) => (
                    <ReachabilityCard
                      copiedLinkKey={copiedLinkKey}
                      key={service.id}
                      focused={focusedServiceId === service.id}
                      loading={Boolean(loadingServiceIds[service.id])}
                      onCopyLink={onCopyLink}
                      onDragEnd={handleDragEnd}
                      onDragStart={handleDragStart}
                      onFocusService={onFocusService}
                      onMoveService={onMoveService}
                      service={service}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </NetworkPanel>
  );
}

function ReachabilityCard({
  copiedLinkKey,
  focused,
  loading,
  onCopyLink,
  onDragEnd,
  onDragStart,
  onFocusService,
  onMoveService,
  service,
}: {
  copiedLinkKey: string | null;
  focused: boolean;
  loading: boolean;
  onCopyLink: (serviceId: string, linkKind: 'local' | 'private', url: string | null) => void;
  onDragEnd: () => void;
  onDragStart: (event: DragEvent<HTMLElement>, service: ReachabilityService) => void;
  onFocusService: (service: ReachabilityService) => void;
  onMoveService: (service: ReachabilityService, zone: ReachabilityZoneId) => void;
  service: ReachabilityService;
}) {
  const statusClass = service.status === 'connected'
    ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200'
    : service.status === 'warning'
      ? 'border-orange-400/35 bg-orange-500/10 text-orange-200'
      : 'border-sky-400/25 bg-slate-900 text-sky-100/75';

  function handleCardClick(event: MouseEvent<HTMLElement>) {
    if (isInteractiveClick(event.target)) {
      return;
    }
    onFocusService(service);
  }

  return (
    <NetworkInset
      className={cn(
        'overflow-hidden border-cyan-200/35 bg-cyan-950/80 p-0 shadow-sm shadow-cyan-950/25 transition hover:border-cyan-200/55 hover:bg-cyan-900/70',
        service.status === 'warning' && 'border-orange-300/45 bg-orange-950/75 shadow-orange-950/20 hover:border-orange-300/65 hover:bg-orange-900/70',
        focused && 'border-cyan-200 bg-cyan-800/80 shadow-lg shadow-cyan-500/20 ring-2 ring-cyan-300/50',
        service.draggable && !loading && 'cursor-grab active:cursor-grabbing',
        loading && 'animate-pulse opacity-80 ring-1 ring-cyan-300/40',
      )}
      draggable={service.draggable && !loading}
      id={reachabilityServiceElementId(service.id)}
      onClick={handleCardClick}
      onDragEnd={onDragEnd}
      onDragStart={(event) => onDragStart(event, service)}
    >
      <div className="grid gap-2 p-2.5">
        <div className="flex w-full items-center gap-2 text-left">
          <ServiceIcon loading={loading} service={service} statusClass={statusClass} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h4 className="truncate text-sm font-bold text-slate-50">{service.label}</h4>
              {service.type === 'external-service' && <Badge className="border-sky-400/20 bg-slate-900 text-[0.65rem] text-sky-100/65" variant="outline">Pinned</Badge>}
            </div>
            <p className="truncate text-xs text-cyan-50/65">{service.issue || service.detail}</p>
          </div>
          {service.draggable && !loading && <GripVertical className="size-4 shrink-0 text-cyan-100/45" />}
        </div>

        <div className="flex items-center gap-2">
          <Badge className={cn('border text-[0.68rem]', statusClass)} variant="outline">{loading ? 'Processing' : service.statusLabel}</Badge>
          {service.openUrl ? (
            <ProjectOpenButton asChild className="ml-auto" size="icon-sm" title={`Open ${service.label}`}>
              <a href={service.openUrl} rel="noreferrer" target="_blank">
                <ExternalLink className="size-3.5" />
                <span className="sr-only">Open {service.label}</span>
              </a>
            </ProjectOpenButton>
          ) : null}
        </div>
      </div>

      <Accordion className="border-t border-cyan-200/15 px-2.5" collapsible type="single">
        <AccordionItem className="border-0" value="details">
          <AccordionTrigger className="py-1.5 text-xs font-semibold text-cyan-50/70 hover:text-white hover:no-underline" onClick={() => onFocusService(service)}>
            Details and actions
          </AccordionTrigger>
          <AccordionContent className="pb-3">
            <div className="grid gap-2 text-xs">
              <DetailLine
                copied={copiedLinkKey === `${service.id}:local`}
                label="Local"
                onCopy={service.localUrl ? () => onCopyLink(service.id, 'local', service.localUrl) : undefined}
                value={service.localUrl || 'No local link'}
              />
              <DetailLine
                copied={copiedLinkKey === `${service.id}:private`}
                label="Private"
                onCopy={service.privateUrl ? () => onCopyLink(service.id, 'private', service.privateUrl) : undefined}
                statusIcon={<PrivateLinkStatus service={service} />}
                value={service.privateUrl || 'No private link'}
              />
            </div>
            {service.draggable ? (
              <SecurityPostureToggleGroup loading={loading} onMoveService={onMoveService} service={service} />
            ) : (
              <p className="mt-3 rounded-lg border border-cyan-200/15 bg-cyan-950/60 px-3 py-2 text-xs leading-5 text-cyan-50/65">
                Pinned services are tracked here for visibility. Manage their security posture outside Autark-OS.
              </p>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </NetworkInset>
  );
}

function ServiceIcon({ loading, service, statusClass }: { loading: boolean; service: ReachabilityService; statusClass: string }) {
  return (
    <span className={cn('grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg border bg-white text-slate-700', statusClass)}>
      {loading ? (
        <Lock className="size-4 animate-pulse" />
      ) : service.iconUrl ? (
        <img alt="" className="size-full object-contain p-1" src={service.iconUrl} />
      ) : service.type === 'external-service' ? (
        <Router className="size-4" />
      ) : (
        <span className="text-xs font-black">{service.label.slice(0, 2).toUpperCase()}</span>
      )}
    </span>
  );
}

function GhostReachabilityCard({ service }: { service: ReachabilityService }) {
  return (
    <div className="rounded-lg border border-dashed border-cyan-200/70 bg-cyan-300/15 p-2.5 shadow-inner shadow-cyan-950/30">
      <div className="flex items-center gap-2 opacity-90">
        <ServiceIcon loading={false} service={service} statusClass="border-cyan-200/60 bg-white text-slate-700" />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-cyan-50">{service.label}</p>
          <p className="text-xs text-cyan-50/70">Drop here to move service</p>
        </div>
      </div>
    </div>
  );
}

function SecurityPostureToggleGroup({
  loading,
  onMoveService,
  service,
}: {
  loading: boolean;
  onMoveService: (service: ReachabilityService, zone: ReachabilityZoneId) => void;
  service: ReachabilityService;
}) {
  const reason = 'Autark-OS is already updating this service.';
  return (
    <DisabledAction disabled={loading} reason={reason}>
      <ToggleGroup
        aria-label={`Security posture for ${service.label}`}
        className="mt-3 grid w-full grid-cols-3 rounded-lg border border-cyan-200/20 bg-cyan-950/60 p-1"
        disabled={loading}
        onValueChange={(value) => {
          if (!value || value === service.zone) {
            return;
          }
          onMoveService(service, value as ReachabilityZoneId);
        }}
        spacing={1}
        type="single"
        value={service.zone}
        variant="outline"
      >
        <SecurityPostureToggleItem value="local">Server</SecurityPostureToggleItem>
        <SecurityPostureToggleItem value="lan">Home</SecurityPostureToggleItem>
        <SecurityPostureToggleItem value="tailnet">Private</SecurityPostureToggleItem>
      </ToggleGroup>
    </DisabledAction>
  );
}

function SecurityPostureToggleItem({ children, value }: { children: string; value: ReachabilityZoneId }) {
  return (
    <ToggleGroupItem
      className={cn(
        'h-8 min-w-0 rounded-md border border-transparent px-2 text-[0.68rem] font-bold text-cyan-50/60 transition',
        'hover:border-cyan-200/30 hover:bg-cyan-300/10 hover:text-white',
        'data-[state=on]:border-cyan-200/55 data-[state=on]:bg-cyan-300/20 data-[state=on]:text-white data-[state=on]:shadow-sm data-[state=on]:shadow-cyan-950/30',
      )}
      value={value}
    >
      {children}
    </ToggleGroupItem>
  );
}

function DetailLine({
  copied,
  label,
  onCopy,
  statusIcon,
  value,
}: {
  copied?: boolean;
  label: string;
  onCopy?: () => void;
  statusIcon?: React.ReactNode;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-cyan-200/15 bg-cyan-950/60 px-2 py-1.5">
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wide text-cyan-50/45">
          {label}
          {statusIcon}
        </span>
        <span className="block truncate text-cyan-50/75" title={value}>{value}</span>
      </span>
      {onCopy && (
        <ProjectDarkControlButton aria-label={`Copy ${label.toLowerCase()} link`} className="size-7 p-0" onClick={onCopy} size="icon-sm" type="button">
          {copied ? <CheckCircle2 className="size-3.5" /> : <Copy className="size-3.5" />}
        </ProjectDarkControlButton>
      )}
    </div>
  );
}

function PrivateLinkStatus({ service }: { service: ReachabilityService }) {
  const status = privateLinkStatus(service);
  const Icon = status.tone === 'stable' ? CheckCircle2 : status.tone === 'warning' ? CircleAlert : Lock;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            aria-label={status.label}
            className={cn(
              'inline-flex size-4 shrink-0 items-center justify-center rounded-full border',
              status.tone === 'stable' && 'border-emerald-300/45 bg-emerald-400/15 text-emerald-200',
              status.tone === 'warning' && 'border-orange-300/50 bg-orange-400/15 text-orange-200',
              status.tone === 'neutral' && 'border-sky-300/35 bg-sky-300/10 text-sky-100/70',
            )}
            role="img"
            tabIndex={0}
          >
            <Icon className="size-3" />
          </span>
        </TooltipTrigger>
        <TooltipContent arrowClassName="bg-slate-800 fill-slate-800" className="border-sky-400/25 bg-slate-800 text-slate-50 shadow-xl shadow-slate-950/35">
          {status.description}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function privateLinkStatus(service: ReachabilityService) {
  if (service.issue) {
    return {
      description: service.issue,
      label: 'Private link needs review',
      tone: 'warning' as const,
    };
  }
  if (service.privateUrl && service.status === 'connected') {
    return {
      description: 'Autark-OS checks this private link automatically and it is currently stable.',
      label: 'Private link stable',
      tone: 'stable' as const,
    };
  }
  if (service.privateUrl) {
    return {
      description: 'Autark-OS is tracking this private link and will verify it during the next refresh.',
      label: 'Private link tracked',
      tone: 'neutral' as const,
    };
  }
  return {
    description: 'No private link is configured for this service.',
    label: 'No private link configured',
    tone: 'neutral' as const,
  };
}

function isInteractiveClick(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('button, a, input, select, textarea, [role="button"], [data-radix-collection-item]'));
}

function reachabilityServiceElementId(serviceId: string) {
  return `reachability-service-${serviceId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}
