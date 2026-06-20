import { AlertTriangle, Loader2, PlugZap, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Tone = 'amber' | 'red' | 'slate' | 'violet';

const tones: Record<Tone, string> = {
  amber: 'border-amber-300/20 bg-amber-500/10 text-amber-100',
  red: 'border-red-300/20 bg-red-500/10 text-red-100',
  slate: 'border-white/10 bg-slate-950/65 text-slate-300',
  violet: 'border-violet-300/20 bg-violet-500/10 text-violet-100',
};

export function PageLoadingState({ label = 'Loading Project OS', sublabel = 'Checking the local backend and preparing this view.' }: { label?: string; sublabel?: string }) {
  return (
    <section className="grid min-h-[520px] w-full place-items-center rounded-lg border border-white/10 bg-slate-950/65 p-8 text-center text-slate-300 shadow-po-panel">
      <div className="grid justify-items-center gap-3">
        <span className="grid size-12 place-items-center rounded-lg border border-violet-300/20 bg-violet-500/10 text-violet-200">
          <Loader2 className="size-5 animate-spin" />
        </span>
        <div>
          <p className="font-black text-white">{label}</p>
          <p className="mt-1 max-w-md text-sm leading-6 text-slate-400">{sublabel}</p>
        </div>
      </div>
    </section>
  );
}

export function PageEmptyState({ action, icon: Icon = Sparkles, message, title }: { action?: ReactNode; icon?: LucideIcon; message: string; title: string }) {
  return (
    <section className="grid min-h-[360px] place-items-center rounded-lg border border-white/10 bg-slate-950/60 p-8 text-center text-slate-300 shadow-po-card">
      <div className="grid justify-items-center gap-3">
        <span className="grid size-12 place-items-center rounded-lg border border-slate-700/60 bg-slate-900/70 text-slate-300">
          <Icon className="size-5" />
        </span>
        <div>
          <p className="font-black text-white">{title}</p>
          <p className="mt-1 max-w-md text-sm leading-6 text-slate-400">{message}</p>
        </div>
        {action}
      </div>
    </section>
  );
}

export function PageErrorState({ className, message, onRetry, title = 'Project OS could not load this view' }: { className?: string; message: string; onRetry?: () => void; title?: string }) {
  const offline = isBackendUnavailable(message);
  return (
    <div className={cn('rounded-lg border p-4 text-sm', tones[offline ? 'amber' : 'red'], className)}>
      <div className="flex gap-3">
        {offline ? <PlugZap className="mt-0.5 size-5 shrink-0" /> : <AlertTriangle className="mt-0.5 size-5 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white">{offline ? 'Local backend looks unavailable' : title}</p>
          <p className="mt-1 leading-6 text-current/80">{message}</p>
          <p className="mt-2 text-xs leading-5 text-current/70">
            {offline ? 'Check that the Project OS backend is running, then refresh this page.' : 'Refresh the page. If this keeps happening, open Safe Diagnostics for the next step.'}
          </p>
          {onRetry && (
            <Button className="mt-3 border-current/25 bg-slate-950/45 text-current hover:bg-slate-900" onClick={onRetry} size="sm" type="button" variant="outline">
              Try again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function isBackendUnavailable(message: string) {
  return /network|failed to fetch|connection|timeout|refused|unavailable/i.test(message);
}
