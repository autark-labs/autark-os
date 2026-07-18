import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ProjectPrimaryButton, ProjectWarningButton } from '@/components/primitives/ProjectButtons';
import { Surface } from '@/components/primitives/Surface';
import { cn } from '@/lib/utils';
import type { AutarkOsAction } from '@/types/app';

export type RecommendedActionCardModel = {
  body: string;
  primaryAction?: AutarkOsAction | null;
  severity?: string;
  title: string;
};

type RecommendedActionCardProps = {
  className?: string;
  model: RecommendedActionCardModel;
};

export function RecommendedActionCard({ className, model }: RecommendedActionCardProps) {
  const tone = severityTone(model.severity);
  const Icon = severityIcon(model.severity);
  return (
    <Surface className={cn('p-5 shadow-slate-950/20', tone.panel, className)} tone="muted">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="flex min-w-0 gap-3">
          <div className={cn('grid size-11 shrink-0 place-items-center rounded-xl border', tone.icon)}>
            <Icon aria-hidden="true" className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="m-0 text-base font-bold text-slate-50">{model.title}</p>
            <p className="m-0 mt-1 text-sm leading-6 text-sky-100/70">{model.body}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RecommendedActionButton action={model.primaryAction} severity={model.severity} />
        </div>
      </div>
    </Surface>
  );
}

function RecommendedActionButton({ action, severity }: { action?: AutarkOsAction | null; severity?: string }) {
  if (!action) return null;
  const ButtonComponent = severity === 'warning' || severity === 'critical' ? ProjectWarningButton : ProjectPrimaryButton;
  const label = action.label || 'Open';
  if (action.route) {
    return <ButtonComponent asChild className="w-full sm:w-auto" size="sm"><Link to={action.route}>{label}</Link></ButtonComponent>;
  }
  if (action.href) {
    return <ButtonComponent asChild className="w-full sm:w-auto" size="sm"><a href={action.href} rel="noreferrer" target={action.href.startsWith('http') ? '_blank' : undefined}>{label}</a></ButtonComponent>;
  }
  return null;
}

function severityIcon(severity?: string): LucideIcon {
  if (severity === 'success') return CheckCircle2;
  if (severity === 'critical') return XCircle;
  if (severity === 'warning') return AlertTriangle;
  return Info;
}

function severityTone(severity?: string) {
  if (severity === 'success') return { icon: 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200', panel: 'border-emerald-400/30' };
  if (severity === 'critical') return { icon: 'border-red-400/40 bg-red-500/10 text-red-200', panel: 'border-red-400/30' };
  if (severity === 'warning') return { icon: 'border-orange-400/45 bg-orange-500/10 text-orange-200', panel: 'border-orange-400/40' };
  return { icon: 'border-cyan-300/35 bg-cyan-400/10 text-cyan-100', panel: 'border-sky-400/25' };
}
