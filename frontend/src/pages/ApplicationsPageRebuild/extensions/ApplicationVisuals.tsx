import { AlertTriangle, CheckCircle2, CircleHelp, Link2, Loader2, Pause, Search, Server, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ApplicationSurfaceItem } from './ApplicationsPage.types';

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
    frame: 'size-28 rounded-2xl shadow-sm',
    image: 'size-24',
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
  return <ApplicationReadinessBadge item={item} overlay={overlay} />;
}

export function ApplicationReadinessBadge({ item, overlay = false }: { item: ApplicationSurfaceItem; overlay?: boolean }) {
  const Icon = readinessIcon(item.readinessState);
  const className = cn(
    overlay && 'absolute right-3 top-3',
    item.readinessState === 'ready' && 'bg-emerald-300 text-emerald-950',
    item.readinessState === 'starting' && 'bg-cyan-100 text-slate-950',
    item.readinessState === 'paused' && 'bg-slate-700 text-white',
    item.readinessState === 'stopped' && 'bg-slate-600 text-white',
    item.readinessState === 'unreachable' && 'bg-orange-500 text-white',
    item.readinessState === 'unknown' && 'bg-slate-300 text-slate-950',
  );

  return (
    <Badge className={className}>
      <Icon className={item.readinessState === 'starting' ? 'animate-spin' : undefined} data-icon="inline-start" />
      {labelForReadiness(item.readinessState)}
    </Badge>
  );
}

export function ApplicationManagementBadge({ item }: { item: ApplicationSurfaceItem }) {
  const Icon = item.managementState === 'managed' ? Server : item.managementState === 'linked' ? Link2 : Search;

  return (
    <Badge className="bg-slate-800 text-sky-50">
      <Icon data-icon="inline-start" />
      {labelForManagementState(item.managementState)}
    </Badge>
  );
}

export function ApplicationAttentionIndicator({ item }: { item: ApplicationSurfaceItem }) {
  if (item.attentionState === 'none') {
    return null;
  }

  return (
    <Badge className={cn(
      item.attentionState === 'needs_review' && 'bg-orange-500 text-white',
      item.attentionState === 'conflict' && 'bg-red-600 text-white',
      item.attentionState === 'blocked' && 'bg-red-700 text-white',
    )}>
      <AlertTriangle data-icon="inline-start" />
      {labelForAttention(item.attentionState)}
    </Badge>
  );
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

export function labelForManagementState(state: ApplicationSurfaceItem['managementState'], length: 'short' | 'long' = 'long') {
  if (state === 'managed') {
    return length === 'short' ? 'Managed' : 'Managed app';
  }
  if (state === 'linked') {
    return length === 'short' ? 'Linked' : 'Linked service';
  }
  return length === 'short' ? 'Found' : 'Found on this server';
}

export function labelForReadiness(state: ApplicationSurfaceItem['readinessState']) {
  if (state === 'ready') return 'Ready';
  if (state === 'starting') return 'Starting';
  if (state === 'paused') return 'Paused';
  if (state === 'stopped') return 'Stopped';
  if (state === 'unreachable') return 'Unreachable';
  return 'Unknown';
}

export function labelForAttention(state: ApplicationSurfaceItem['attentionState']) {
  if (state === 'needs_review') return 'Needs review';
  if (state === 'conflict') return 'Conflict';
  if (state === 'blocked') return 'Blocked';
  return 'No attention needed';
}

function readinessIcon(state: ApplicationSurfaceItem['readinessState']) {
  if (state === 'ready') return CheckCircle2;
  if (state === 'starting') return Loader2;
  if (state === 'paused') return Pause;
  if (state === 'stopped' || state === 'unreachable') return XCircle;
  return CircleHelp;
}
