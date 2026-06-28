import { AlertTriangle, CheckCircle2, Clock3, Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { ProjectOsJob } from '@/types/jobs';
import {
  currentJobStep,
  currentJobStepText,
  jobProgressPercent,
  jobTypeLabel,
  terminalJob,
} from '@/repositories/jobRepository';

type JobProgressProps = {
  className?: string;
  compact?: boolean;
  job: ProjectOsJob;
  subjectLabel?: string;
};

export function JobProgress({ className, compact = false, job, subjectLabel }: JobProgressProps) {
  const currentStep = currentJobStep(job);
  const progress = jobProgressPercent(job);
  const failed = job.status === 'failed';
  const succeeded = job.status === 'succeeded';
  const cancelled = job.status === 'cancelled';
  const running = !terminalJob(job);

  return (
    <section className={cn(
      'rounded-lg border p-3 text-sm shadow-po-sm',
      failed && 'border-red-300/25 bg-red-500/10 text-red-100',
      succeeded && 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100',
      cancelled && 'border-slate-600/45 bg-slate-900/70 text-slate-200',
      running && 'border-sky-300/25 bg-sky-500/10 text-sky-100',
      className,
    )}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-slate-950/50">
          {failed ? <AlertTriangle className="size-4" /> : succeeded ? <CheckCircle2 className="size-4" /> : running ? <Loader2 className="size-4 animate-spin" /> : <Clock3 className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="m-0 font-semibold text-white">
              {jobTypeLabel(job.type)}{subjectLabel ? `: ${subjectLabel}` : ''}
            </p>
            <span className="rounded-full border border-white/10 bg-slate-950/50 px-2 py-0.5 text-xs font-semibold capitalize text-current/80">
              {job.status.replaceAll('_', ' ')}
            </span>
          </div>
          <p className="m-0 mt-1 text-current/80">
            {failed ? job.error?.message || 'Project OS could not finish this job.' : currentJobStepText(job, running ? 'Project OS is working.' : terminalSummary(job))}
          </p>
          {!compact && (
            <>
              <Progress className="mt-3 bg-slate-800 [&_[data-slot=progress-indicator]]:bg-sky-400" value={progress} />
              {currentStep?.label && (
                <p className="m-0 mt-2 text-xs text-current/65">
                  Current step: {currentStep.label}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function terminalSummary(job: ProjectOsJob) {
  if (job.status === 'succeeded') {
    return 'Project OS finished this job.';
  }
  if (job.status === 'cancelled') {
    return 'This job was cancelled.';
  }
  return 'Project OS is waiting for the next update.';
}
