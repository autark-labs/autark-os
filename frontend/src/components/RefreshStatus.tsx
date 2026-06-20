import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type RefreshStatusProps = {
  className?: string;
  disabled?: boolean;
  intervalLabel?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  showButton?: boolean;
  tone?: 'slate' | 'violet' | 'cyan' | 'emerald' | 'sky';
  updatedAt: Date | null;
};

export function RefreshStatus({ className, disabled, intervalLabel, onRefresh, refreshing = false, showButton = true, tone = 'slate', updatedAt }: RefreshStatusProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => setTick((current) => current + 1), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const label = useMemo(() => formatUpdatedAt(updatedAt), [updatedAt]);
  const tones = {
    slate: 'border-slate-700/50 bg-slate-950/50 text-slate-200 hover:bg-slate-800',
    violet: 'border-violet-300/20 bg-violet-500/15 text-violet-100 hover:bg-violet-500/25',
    cyan: 'border-cyan-300/20 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25',
    emerald: 'border-emerald-300/20 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25',
    sky: 'border-sky-300/20 bg-sky-500/15 text-sky-100 hover:bg-sky-500/25',
  };

  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-2', className)}>
      <div className="text-right text-xs leading-5 text-slate-500">
        <p className="font-semibold text-slate-300">{refreshing ? 'Updating now' : label}</p>
        {intervalLabel && <p>{intervalLabel}</p>}
      </div>
      {showButton && onRefresh && (
        <Button className={cn('gap-2 border', tones[tone])} disabled={disabled || refreshing} onClick={onRefresh} type="button" variant="outline">
          <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
          Refresh
        </Button>
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
