import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApplicationSurfaceItem } from '../extensions/ApplicationsPage.types';

export function CompactOperationStatus({ item }: { item: ApplicationSurfaceItem }) {
  if (item.operation.kind === 'idle') return null;
  const failed = item.operation.kind === 'failed';
  const detail = item.operation.kind === 'failed'
    ? item.operation.message || 'Open details to review this app operation.'
    : item.operation.currentStep || 'Autark-OS is working on this app.';

  return (
    <div className={cn('flex min-w-0 items-center gap-1.5 text-xs font-semibold', failed ? 'text-red-200' : 'text-cyan-100')} title={detail}>
      {failed ? <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" /> : <Loader2 aria-hidden="true" className="size-3.5 shrink-0 animate-spin" />}
      <span className="truncate">{item.operation.label}</span>
    </div>
  );
}
