import { useMemo } from 'react';
import { Boxes, CheckCircle2, CircleAlert, ExternalLink, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { TailscaleControlPopover } from '@/components/project-os/TailscaleControlPopover';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useSystemDoctorQuery } from '@/repositories/systemRepository';
import type { SystemSetupCheck } from '@/types/system';

type HeaderService = {
  id: 'docker';
  label: string;
  healthyLabel: string;
  needsAttentionLabel: string;
  healthySummary: string;
  needsAttentionSummary: string;
  check: SystemSetupCheck | null;
  href: string;
  externalHref: string;
  externalLabel: string;
  command: string;
  optional: boolean;
  icon: typeof Boxes;
};

function SystemStatusHeader() {
  const doctorQuery = useSystemDoctorQuery();
  const doctor = doctorQuery.data ?? null;
  const loading = doctorQuery.isLoading;
  const error = doctorQuery.error;

  const checksById = useMemo(() => new Map((doctor?.checks ?? []).map((check) => [check.id, check])), [doctor?.checks]);
  const dockerCheck = checksById.get('docker') ?? null;
  const tailscaleCheck = checksById.get('tailscale') ?? null;
  const checkedAt = doctor?.checkedAt ? formatCheckedAt(doctor.checkedAt) : loading ? 'Checking now' : 'Status unavailable';

  const dockerService: HeaderService = {
      id: 'docker',
      label: 'Docker',
      healthyLabel: 'Ready',
      needsAttentionLabel: 'Needs setup',
      healthySummary: 'Docker is reachable and ready for Discover installs.',
      needsAttentionSummary: 'Docker is required before Project OS can install and run apps.',
      check: dockerCheck,
      href: '/diagnostics',
      externalHref: 'https://docs.docker.com/engine/',
      externalLabel: 'Docker docs',
      command: dockerCheck?.actionCommand || 'project-os doctor',
      optional: false,
      icon: Boxes,
    };

  return (
    <header className="sticky top-0 z-20 border-b border-po-border bg-po-bg/80 px-4 py-2 backdrop-blur-xl md:px-6" aria-label="System status">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-po-sm bg-po-brand-gradient text-sm font-black text-white shadow-po-brand-glow">
            P
          </div>
          <div className="min-w-0">
            <p className="m-0 truncate text-sm font-bold leading-tight text-po-text">Project OS</p>
            <p className="m-0 truncate text-xs text-po-text-muted">
              {doctor?.lanUrl ? `LAN: ${doctor.lanUrl}` : checkedAt}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <StatusPopover loading={loading} service={dockerService} />
          <TailscaleControlPopover check={tailscaleCheck} loading={loading} />
          <div className="hidden min-w-0 items-center gap-1.5 text-xs text-po-text-muted sm:flex">
            <RefreshCw className="size-3" />
            <span className="truncate">{error ? 'Health check unavailable' : checkedAt}</span>
          </div>
        </div>
      </div>
    </header>
  );
}

function StatusPopover({ loading, service }: { loading: boolean; service: HeaderService }) {
  const healthy = service.check?.status === 'ok';
  const unavailable = !service.check;
  const Icon = service.icon;
  const statusTone = healthy ? 'green' : 'red';
  const StatusIcon = statusTone === 'green' ? CheckCircle2 : CircleAlert;
  const toneClass = statusTone === 'green'
    ? 'border-po-success/30 bg-po-success/10 text-po-success hover:bg-po-success/15'
    : 'border-po-danger/35 bg-po-danger/10 text-po-danger hover:bg-po-danger/15';
  const statusLabel = healthy ? service.healthyLabel : service.needsAttentionLabel;
  const summary = healthy ? service.healthySummary : service.needsAttentionSummary;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={`${service.label}: ${loading && unavailable ? 'checking' : statusLabel}`}
          className={cn('h-8 gap-2 rounded-po-sm border px-2.5 text-xs', toneClass)}
          size="sm"
          type="button"
          variant="outline"
        >
          <span className={cn('size-2 rounded-full', statusTone === 'green' && 'bg-po-success shadow-po-success-glow', statusTone === 'red' && 'bg-po-danger shadow-po-danger-glow')} />
          <Icon data-icon="inline-start" />
          <span className="hidden font-semibold sm:inline">{service.label}</span>
          <span className="font-semibold">{loading && unavailable ? 'Checking' : statusLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-3 border-po-border bg-po-surface-elevated p-3 text-po-text shadow-po-md">
        <PopoverHeader>
          <PopoverTitle className="flex items-center gap-2 text-sm">
            <StatusIcon className={cn('size-4', statusTone === 'green' && 'text-po-success', statusTone === 'red' && 'text-po-danger')} />
            {service.label} {statusLabel.toLowerCase()}
          </PopoverTitle>
          <PopoverDescription className="text-xs text-po-text-muted">
            {summary}
          </PopoverDescription>
        </PopoverHeader>

        <div className="rounded-po-sm border border-po-border bg-po-surface-inset p-2 text-xs">
          <p className="m-0 font-semibold text-po-text-secondary">{service.check?.message || 'Project OS is checking this service.'}</p>
          <p className="m-0 mt-1 text-po-text-muted">{service.check?.detail || 'Status details will appear after the next health check.'}</p>
          {!healthy && (
            <p className="m-0 mt-2 rounded-po-xs border border-po-border bg-black/20 px-2 py-1 font-mono text-[0.72rem] text-po-text-secondary">
              {service.command}
            </p>
          )}
          {!healthy && service.optional && (
            <p className="m-0 mt-2 text-po-text-muted">You can keep using Project OS locally and set this up later.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant={healthy ? 'secondary' : 'default'}>
            <Link to={service.href}>{healthy ? 'View details' : 'Set up'}</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={service.externalHref} rel="noreferrer" target="_blank">
              {service.externalLabel}
              <ExternalLink data-icon="inline-end" />
            </a>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function formatCheckedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Checked recently';
  }
  return `Checked ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export default SystemStatusHeader;
