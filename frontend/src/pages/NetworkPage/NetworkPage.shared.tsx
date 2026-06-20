import { Activity, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NetworkDiagnosticsReport } from '@/types/network';
import { diagnosticTone } from './extensions/NetworkPage.theme';

export function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-900/50 p-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="truncate font-semibold text-white">{value}</span>
    </div>
  );
}

export function AccessLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-md bg-black/20 px-3 py-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <span className="truncate font-mono text-xs text-slate-200">{value}</span>
    </div>
  );
}

export function EmptyState({ icon: Icon, text, title }: { icon: LucideIcon; text: string; title: string }) {
  return (
    <div className="grid justify-items-center rounded-lg border border-white/10 bg-slate-900/45 p-6 text-center">
      <span className="grid size-12 place-items-center rounded-lg border border-white/10 bg-slate-950/60 text-slate-300">
        <Icon className="size-5" />
      </span>
      <h3 className="mt-3 font-semibold text-white">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-slate-400">{text}</p>
    </div>
  );
}

export function DiagnosticRow({ item }: { item: NetworkDiagnosticsReport['checks'][number] }) {
  const Icon = item.status === 'healthy' ? CheckCircle2 : item.status === 'warning' ? AlertTriangle : Activity;
  return (
    <div className="flex gap-3 rounded-lg border border-white/10 bg-slate-900/45 p-3">
      <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border', diagnosticTone(item.status))}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-white">{item.label}</span>
          {item.actionLabel && <span className="text-xs text-violet-300">{item.actionLabel}</span>}
        </span>
        <span className="mt-1 block text-sm text-slate-300">{item.message}</span>
        {item.detail && <span className="mt-1 block text-xs text-slate-500">{item.detail}</span>}
      </span>
    </div>
  );
}
