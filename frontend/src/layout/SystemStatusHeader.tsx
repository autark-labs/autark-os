import { useEffect, useMemo, useState } from 'react';
import { Boxes, CheckCircle2, CircleAlert, ExternalLink, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { JobProgress } from '@/components/project-os/JobProgress';
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
import { jobTypeLabel, useGlobalActiveProjectOsJob } from '@/repositories/jobRepository';
import { useSystemDoctorQuery } from '@/repositories/systemRepository';
import type { ProjectOsJob } from '@/types/jobs';
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
  const [currentTime, setCurrentTime] = useState(() => formatClock(new Date()));
  const doctorQuery = useSystemDoctorQuery();
  const activeJobQuery = useGlobalActiveProjectOsJob();
  const doctor = doctorQuery.data ?? null;
  const activeJob = activeJobQuery.activeJob;
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

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(formatClock(new Date())), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-700/45 bg-slate-950/78 px-4 py-2 backdrop-blur-xl md:px-6" aria-label="System status">
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 truncate text-sm font-semibold text-slate-200">Project OS</p>
          <p className="m-0 hidden truncate text-xs text-slate-500 sm:block">
            {doctor?.lanUrl ? `LAN ${doctor.lanUrl}` : checkedAt}
          </p>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          {activeJob && <GlobalJobPopover job={activeJob} />}
          <StatusPopover loading={loading} service={dockerService} />
          <TailscaleControlPopover check={tailscaleCheck} loading={loading} />
          <span className="hidden min-w-0 rounded-lg px-2 py-1 text-sm font-medium text-slate-400 sm:inline-flex">
            {error ? 'Status unavailable' : currentTime}
          </span>
        </div>
      </div>
    </header>
  );
}

function GlobalJobPopover({ job }: { job: ProjectOsJob }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={`${jobTypeLabel(job.type)} in progress`}
          className="h-8 gap-2 rounded-lg border border-sky-500/25 bg-sky-500/12 px-2.5 text-xs text-sky-300 shadow-po-sm hover:bg-sky-500/18"
          size="sm"
          type="button"
          variant="outline"
        >
          <Loader2 className="size-3.5 animate-spin" />
          <span className="hidden font-semibold sm:inline">Working</span>
          <span className="font-semibold">{jobTypeLabel(job.type)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 gap-3 border-slate-700 bg-slate-950 p-3 text-po-text shadow-po-md">
        <PopoverHeader>
          <PopoverTitle className="text-sm">Project OS is working</PopoverTitle>
          <PopoverDescription className="text-xs text-po-text-muted">
            This progress follows you while you move around the app.
          </PopoverDescription>
        </PopoverHeader>
        <JobProgress job={job} subjectLabel={job.subjectId || undefined} />
      </PopoverContent>
    </Popover>
  );
}

function StatusPopover({ loading, service }: { loading: boolean; service: HeaderService }) {
  const healthy = service.check?.status === 'ok';
  const unavailable = !service.check;
  const Icon = service.icon;
  const statusTone = healthy ? 'blue' : 'red';
  const StatusIcon = statusTone === 'blue' ? CheckCircle2 : CircleAlert;
  const toneClass = statusTone === 'blue'
    ? 'border-sky-500/25 bg-sky-500/12 text-sky-300 hover:bg-sky-500/18'
    : 'border-po-danger/35 bg-po-danger/10 text-po-danger hover:bg-po-danger/15';
  const statusLabel = healthy ? service.healthyLabel : service.needsAttentionLabel;
  const summary = healthy ? service.healthySummary : service.needsAttentionSummary;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={`${service.label}: ${loading && unavailable ? 'checking' : statusLabel}`}
          className={cn('h-8 gap-2 rounded-lg border px-2.5 text-xs shadow-po-sm', toneClass)}
          size="sm"
          type="button"
          variant="outline"
        >
          <span className={cn('size-2 rounded-full', statusTone === 'blue' && 'bg-sky-400 shadow-po-info-glow', statusTone === 'red' && 'bg-po-danger shadow-po-danger-glow')} />
          <Icon data-icon="inline-start" />
          <span className="hidden font-semibold sm:inline">{service.label}</span>
          <span className="font-semibold">{loading && unavailable ? 'Checking' : statusLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-3 border-slate-700 bg-slate-950 p-3 text-po-text shadow-po-md">
        <PopoverHeader>
          <PopoverTitle className="flex items-center gap-2 text-sm">
            <StatusIcon className={cn('size-4', statusTone === 'blue' && 'text-sky-300', statusTone === 'red' && 'text-po-danger')} />
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

function formatClock(value: Date) {
  return value.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default SystemStatusHeader;
