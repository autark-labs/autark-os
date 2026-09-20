import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { ContextChip } from '@/components/autark-os/ContextChip';
import { Button } from '@/components/ui/button';
import { semanticStatusVariants } from '@/components/primitives/SemanticVariants';
import { cn } from '@/lib/utils';

type RefreshStatusProps = {
  className?: string;
  disabled?: boolean;
  error?: string | null;
  intervalLabel?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  showButton?: boolean;
  tone?: 'muted' | 'info' | 'success';
  updatedAt: Date | null;
};

export function RefreshStatus({ className, disabled, error, intervalLabel, onRefresh, refreshing = false, showButton = true, tone = 'muted', updatedAt }: RefreshStatusProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => setTick((current) => current + 1), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const label = formatUpdatedAt(updatedAt);
  const refreshDisabled = Boolean(disabled || refreshing);
  const refreshDisabledReason = refreshing ? 'Refresh is already running.' : 'Refresh is not available right now.';
  return (
    <div className={cn('flex max-w-full items-center justify-end gap-2', className)}>
      <div className="flex h-10 w-44 min-w-0 flex-col justify-center text-right text-xs leading-5 text-app-text-muted">
        {error ? <ContextChip label={updatedAt ? 'Refresh paused' : 'Status unavailable'} title="Current status">
          <p>{error}</p>
          <p className="text-xs text-muted-foreground">{updatedAt ? `Last confirmed ${updatedAt.toLocaleString()}. Previous information remains visible.` : 'No confirmed information is available yet.'}</p>
          {onRefresh && <Button disabled={refreshDisabled} onClick={onRefresh} size="sm" type="button">{refreshing ? 'Checking…' : 'Try again'}</Button>}
        </ContextChip> : <>
        <p className="font-semibold text-app-text-secondary">{refreshing ? 'Updating now' : label}</p>
        {intervalLabel && <p>{intervalLabel}</p>}
        </>}
      </div>
      {showButton && onRefresh && (
        <DisabledAction disabled={refreshDisabled} reason={refreshDisabledReason}>
          <Button className={cn('gap-2 hover:bg-app-panel-hover', semanticStatusVariants({ tone: refreshDisabled ? 'muted' : tone }))} disabled={refreshDisabled} onClick={onRefresh} type="button" variant="outline">
            <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
            Refresh
          </Button>
        </DisabledAction>
      )}
    </div>
  );
}

function formatUpdatedAt(value: Date | null) {
  if (!value) {
    return 'Waiting for first update';
  }
  const seconds = Math.max(0, Math.round((Date.now() - value.getTime()) / 1000));
  if (seconds < 5) {
    return 'Updated just now';
  }
  if (seconds < 60) {
    return `Updated ${seconds}s ago`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `Updated ${minutes}m ago`;
  }
  return `Updated ${value.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}
