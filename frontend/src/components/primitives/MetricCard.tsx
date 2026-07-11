import { cn } from '@/lib/utils';
import { semanticStatusVariants } from './SemanticVariants';

type MetricCardTone = 'default' | 'attention';

export function MetricCard({
  className,
  label,
  tone = 'default',
  value,
}: {
  className?: string;
  label: string;
  tone?: MetricCardTone;
  value: number | string;
}) {
  const attention = tone === 'attention';

  return (
    <div className={cn('min-w-28 rounded-xl px-4 py-3', tone === 'attention' ? semanticStatusVariants({ tone: 'warning' }) : 'border border-app-border-muted bg-app-panel-muted text-app-text', className)}>
      <div className="text-2xl font-semibold">{value}</div>
      <div className={attention ? 'text-sm text-current/75' : 'text-sm text-app-text-secondary/80'}>{label}</div>
    </div>
  );
}
