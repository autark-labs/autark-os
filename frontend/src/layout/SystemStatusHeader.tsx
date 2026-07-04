import { useMemo } from 'react';
import { Boxes, CheckCircle2, CircleAlert, ExternalLink, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { JobProgress } from '@/components/autark-os/JobProgress';
import { TailscaleControlPopover } from '@/components/autark-os/TailscaleControlPopover';
import { ThemeSelectorPopover } from '@/components/autark-os/ThemeSelectorPopover';
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
import { jobTypeLabel, useGlobalActiveAutarkOsJob } from '@/repositories/jobRepository';
import { useSystemDoctorQuery } from '@/repositories/systemRepository';
import type { AutarkOsJob } from '@/types/jobs';
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
  const activeJobQuery = useGlobalActiveAutarkOsJob();
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
      needsAttentionSummary: 'Docker is required before Autark-OS can install and run apps.',
      check: dockerCheck,
      href: '/diagnostics',
      externalHref: 'https://docs.docker.com/engine/',
      externalLabel: 'Docker docs',
      command: dockerCheck?.actionCommand || 'autark-os doctor',
      optional: false,
      icon: Boxes,
    };

  return (
    <header className="border-b border-sky-400/25 bg-slate-950 px-4 py-2 text-slate-50 shadow-lg shadow-slate-950/20 md:px-6" aria-label="System status">
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 hidden truncate text-xs text-slate-400 sm:block">{doctor?.lanUrl ? `Reachable at: ${doctor.lanUrl}` : checkedAt}</p>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          {activeJob && <GlobalJobPopover job={activeJob} />}
          <ThemeSelectorPopover />
          <StatusPopover loading={loading} service={dockerService} />
          <TailscaleControlPopover check={tailscaleCheck} loading={loading} />
          <span className="hidden min-w-0 rounded-lg px-2 py-1 text-sm font-medium text-slate-400 sm:inline-flex">
            {error ? 'Status unavailable' : checkedAt}
          </span>
        </div>
      </div>
    </header>
  );
}

function GlobalJobPopover({ job }: { job: AutarkOsJob }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={`${jobTypeLabel(job.type)} in progress`}
          className="h-8 gap-2 rounded-lg border border-cyan-300/35 bg-cyan-400/10 px-2.5 text-xs text-cyan-200 shadow-sm shadow-cyan-950/20 hover:bg-cyan-400/15"
          size="sm"
          type="button"
          variant="outline"
        >
          <Loader2 className="size-3.5 animate-spin" />
          <span className="hidden font-semibold sm:inline">Working</span>
          <span className="font-semibold">{jobTypeLabel(job.type)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,24rem)] gap-3 border-sky-400/25 bg-slate-950 p-3 text-slate-50 shadow-xl shadow-slate-950/30">
        <PopoverHeader>
          <PopoverTitle className="text-sm">Autark-OS is working</PopoverTitle>
          <PopoverDescription className="text-xs text-slate-400">
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
  const statusTone = healthy ? 'info' : 'error';
  const StatusIcon = statusTone === 'info' ? CheckCircle2 : CircleAlert;
  const toneClass = statusTone === 'info'
    ? 'border-cyan-300/35 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/15'
    : 'border-red-400/35 bg-red-500/10 text-red-200 hover:bg-red-500/15';
  const statusLabel = healthy ? service.healthyLabel : service.needsAttentionLabel;
  const summary = healthy ? service.healthySummary : service.needsAttentionSummary;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={`${service.label}: ${loading && unavailable ? 'checking' : statusLabel}`}
          className={cn('h-8 gap-2 rounded-lg border px-2.5 text-xs shadow-sm shadow-slate-950/20', toneClass)}
          size="sm"
          type="button"
          variant="outline"
        >
          <span className={cn('size-2 rounded-full', statusTone === 'info' && 'bg-cyan-300 shadow-lg shadow-cyan-400/30', statusTone === 'error' && 'bg-red-400 shadow-lg shadow-red-500/30')} />
          <Icon data-icon="inline-start" />
          <span className="hidden font-semibold sm:inline">{service.label}</span>
          <span className="font-semibold">{loading && unavailable ? 'Checking' : statusLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,20rem)] gap-3 border-sky-400/25 bg-slate-950 p-3 text-slate-50 shadow-xl shadow-slate-950/30">
        <PopoverHeader>
          <PopoverTitle className="flex items-center gap-2 text-sm">
            <StatusIcon className={cn('size-4', statusTone === 'info' && 'text-cyan-200', statusTone === 'error' && 'text-red-300')} />
            {service.label} {statusLabel.toLowerCase()}
          </PopoverTitle>
          <PopoverDescription className="text-xs text-slate-400">
            {summary}
          </PopoverDescription>
        </PopoverHeader>

        <div className="rounded-lg border border-sky-400/25 bg-slate-900 p-2 text-xs">
          <p className="m-0 font-semibold text-white">{service.check?.message || 'Autark-OS is checking this service.'}</p>
          <p className="m-0 mt-1 text-slate-400">{service.check?.detail || 'Status details will appear after the next health check.'}</p>
          {!healthy && (
            <p className="m-0 mt-2 rounded-md border border-sky-400/25 bg-slate-950 px-2 py-1 font-mono text-[0.72rem] text-slate-200">
              {service.command}
            </p>
          )}
          {!healthy && service.optional && (
            <p className="m-0 mt-2 text-slate-400">You can keep using Autark-OS locally and set this up later.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant={healthy ? 'secondary' : 'default'}>
            <Link to={service.href}>{healthy ? 'View details' : 'Set up'}</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/settings">Settings</Link>
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
