import { Activity, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { ProjectEmptyState } from '@/components/primitives/EmptyState';
import { ProjectDarkControlButton } from '@/components/primitives/ProjectButtons';
import { ProjectInset, ProjectPanel } from '@/components/primitives/Surface';
import { cn } from '@/lib/utils';
import type { NetworkDiagnosticsReport } from '@/types/network';
import { diagnosticTone } from './extensions/NetworkPage.theme';

export function NetworkPanel({
  action,
  children,
  className,
  description,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  title?: ReactNode;
}) {
  return (
    <ProjectPanel className={cn('grid gap-4 shadow-slate-950/20', className)}>
      {(title || description || action) && (
        <div className="flex flex-col justify-between gap-3 border-b border-sky-400/20 pb-4 md:flex-row md:items-start">
          <div>
            {title && <h3 className="text-lg font-bold text-slate-50">{title}</h3>}
            {description && <p className="mt-1 text-sm leading-6 text-sky-100/70">{description}</p>}
          </div>
          {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
        </div>
      )}
      {children}
    </ProjectPanel>
  );
}

export function NetworkInset({
  children,
  className,
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <ProjectInset className={className} interactive={interactive}>
      {children}
    </ProjectInset>
  );
}

export function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <NetworkInset className="flex items-center justify-between gap-3 text-sm">
      <span className="text-sky-100/55">{label}</span>
      <span className="truncate font-semibold text-slate-50">{value}</span>
    </NetworkInset>
  );
}

export function AccessPageLoadingState({ label, sublabel }: { label: string; sublabel: string }) {
  return (
    <section className="grid min-h-[520px] w-full place-items-center rounded-2xl border border-sky-400/30 bg-slate-900 p-8 text-center text-slate-50 shadow-xl shadow-slate-950/30">
      <div className="grid justify-items-center gap-3">
        <span className="grid size-12 place-items-center rounded-lg border border-cyan-300/35 bg-cyan-400/10 text-cyan-100">
          <Activity className="size-5 animate-pulse" />
        </span>
        <div>
          <p className="font-black text-slate-50">{label}</p>
          <p className="mt-1 max-w-md text-sm leading-6 text-sky-100/70">{sublabel}</p>
        </div>
      </div>
    </section>
  );
}

export function AccessPageErrorState({
  message,
  onRetry,
  title,
}: {
  message: string;
  onRetry?: () => void;
  title: string;
}) {
  return (
    <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-current">{title}</p>
          <p className="mt-1 leading-6 text-current/80">{message}</p>
          {onRetry && (
            <ProjectDarkControlButton className="mt-3" onClick={onRetry} size="sm" type="button">
              Try again
            </ProjectDarkControlButton>
          )}
        </div>
      </div>
    </div>
  );
}

export function AccessLine({ label, value }: { label: string; value: string }) {
  return (
    <NetworkInset className="grid gap-1 rounded-md px-3 py-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-sky-100/55">{label}</span>
      <span className="truncate font-mono text-xs text-slate-100">{value}</span>
    </NetworkInset>
  );
}

export function EmptyState({ icon: Icon, text, title }: { icon: LucideIcon; text: string; title: string }) {
  return (
    <ProjectEmptyState
      className="min-h-0 rounded-xl border-sky-400/25 bg-slate-800 p-6"
      description={text}
      icon={<Icon className="size-5" />}
      mediaClassName="border border-sky-400/20 bg-slate-900 text-sky-100/75"
      title={title}
    />
  );
}

export function DiagnosticRow({ item }: { item: NetworkDiagnosticsReport['checks'][number] }) {
  const Icon = item.status === 'healthy' ? CheckCircle2 : item.status === 'warning' ? AlertTriangle : Activity;
  return (
    <NetworkInset className="flex gap-3">
      <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border', diagnosticTone(item.status))}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-50">{item.label}</span>
          {item.actionLabel && <span className="text-xs text-cyan-200">{item.actionLabel}</span>}
        </span>
        <span className="mt-1 block text-sm text-sky-100/75">{item.message}</span>
        {item.detail && <span className="mt-1 block text-xs text-sky-100/50">{item.detail}</span>}
      </span>
    </NetworkInset>
  );
}
