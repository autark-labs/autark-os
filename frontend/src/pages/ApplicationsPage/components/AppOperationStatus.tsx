import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApplicationSurfaceItem } from '../extensions/ApplicationsPage.types';

export function CompactOperationStatus({ className, compact = false, item }: { className?: string; compact?: boolean; item: ApplicationSurfaceItem }) {
  if (item.operationState.kind === 'idle') {
    return null;
  }

  const failed = item.operationState.kind === 'failed';

  if (compact) {
    const detail = item.operationState.kind === 'failed'
      ? item.operationState.message || 'Open details to review this app operation.'
      : item.operationState.currentStep || 'Autark-OS is working on this app.';

    return (
      <div className={cn('flex min-w-0 items-center gap-1.5 text-xs font-semibold', failed ? 'text-red-200' : 'text-cyan-100', className)} title={detail}>
        {failed ? <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" /> : <Loader2 aria-hidden="true" className="size-3.5 shrink-0 animate-spin" />}
        <span className="truncate">{item.operationState.label}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'min-w-0 rounded-lg border px-2.5 py-2 text-xs shadow-sm',
        failed
          ? 'border-red-500/30 bg-red-100 text-red-950'
          : 'border-cyan-400/40 bg-cyan-200 text-slate-950',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5 font-semibold">
        {failed ? <AlertTriangle className="size-3.5 shrink-0" /> : <Loader2 className="size-3.5 shrink-0 animate-spin" />}
        <span className="truncate">{item.operationState.label}</span>
      </div>
      {item.operationState.kind !== 'failed' && item.operationState.currentStep && (
        <p className="mt-1 truncate opacity-75">{item.operationState.currentStep}</p>
      )}
      {failed && (
        <p className="mt-1 truncate opacity-80">Open details to review.</p>
      )}
    </div>
  );
}

export function ExpandedOperationStatus({ className, item }: { className?: string; item: ApplicationSurfaceItem }) {
  if (item.operationState.kind === 'idle') {
    return null;
  }

  const failed = item.operationState.kind === 'failed';

  return (
    <section
      className={cn(
        'rounded-xl border p-3',
        failed
          ? 'border-red-400/30 bg-red-500/10 text-red-50'
          : 'border-cyan-300/30 bg-cyan-300/10 text-cyan-50',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        {failed ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />}
        <div className="min-w-0">
          <p className="text-sm font-semibold">{item.operationState.label}</p>
      {item.operationState.kind === 'failed' ? (
        <p className="mt-1 text-xs leading-5 opacity-80">
          {item.operationState.message || 'Autark-OS could not finish this action. The app remains visible so you can review its state before trying again.'}
        </p>
      ) : (
            <p className="mt-1 text-xs leading-5 opacity-80">
              {item.operationState.currentStep || 'Autark-OS is working on this app. Conflicting controls are paused until it finishes.'}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
