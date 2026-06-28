import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ApplicationSurfaceItem } from './extensions/ApplicationsPage.types';

type ApplicationIconSize = 'sm' | 'md' | 'lg';

const iconSizeClasses: Record<ApplicationIconSize, { frame: string; image: string; fallback: string }> = {
  sm: {
    frame: 'size-10 rounded-lg',
    image: 'size-7',
    fallback: 'text-xs',
  },
  md: {
    frame: 'size-12 rounded-xl',
    image: 'size-9',
    fallback: 'text-sm',
  },
  lg: {
    frame: 'size-24 rounded-2xl shadow-sm',
    image: 'size-20',
    fallback: 'text-xl',
  },
};

export function ApplicationIcon({ item, size = 'md' }: { item: ApplicationSurfaceItem; size?: ApplicationIconSize }) {
  const classes = iconSizeClasses[size];

  return (
    <div className={cn('grid shrink-0 place-items-center border border-sky-300 bg-white', classes.frame)}>
      {item.iconUrl ? (
        <img alt="" className={cn('object-contain', classes.image)} src={item.iconUrl} />
      ) : (
        <span className={cn('font-semibold text-slate-700', classes.fallback)}>
          {item.name.slice(0, 2).toUpperCase()}
        </span>
      )}
    </div>
  );
}

export function ApplicationStatusBadge({ item, overlay = false }: { item: ApplicationSurfaceItem; overlay?: boolean }) {
  const className = cn(
    overlay && 'absolute right-3 top-3',
    item.status === 'Ready' && 'bg-emerald-300 text-emerald-950',
    item.status === 'Needs review' && 'bg-orange-500 text-white',
    item.status === 'Paused' && 'bg-slate-700 text-white',
    item.status !== 'Ready' && item.status !== 'Needs review' && item.status !== 'Paused' && 'bg-cyan-100 text-slate-950',
  );

  if (item.status === 'Needs review') {
    return (
      <Badge className={className}>
        <AlertTriangle data-icon="inline-start" />
        Needs review
      </Badge>
    );
  }

  return <Badge className={className}>{item.status}</Badge>;
}

export function ApplicationKindBadge({ kind }: { kind: ApplicationSurfaceItem['kind'] }) {
  return <Badge className="bg-slate-800 text-sky-50">{labelForKind(kind, 'short')}</Badge>;
}

export function labelForKind(kind: ApplicationSurfaceItem['kind'], length: 'short' | 'long' = 'long') {
  if (kind === 'managed') {
    return length === 'short' ? 'Managed' : 'Managed app';
  }
  if (kind === 'pinned') {
    return length === 'short' ? 'Pinned' : 'Pinned app';
  }
  return length === 'short' ? 'Found' : 'Found service';
}
