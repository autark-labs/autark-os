import { AlertTriangle, CheckCircle2, CircleHelp, Link2, Loader2, Pause, Search, Server, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ApplicationSurfaceItem } from '../extensions/ApplicationsPage.types';

export function ReadinessBadge({ item, overlay = false }: { item: ApplicationSurfaceItem; overlay?: boolean }) {
  if (item.operationState.kind !== 'idle') {
    return <OperationBadge item={item} overlay={overlay} />;
  }

  const Icon = readinessIcon(item.readinessState);

  return (
    <Badge
      className={cn(
        overlay && 'absolute right-3 top-3',
        item.readinessState === 'ready' && 'bg-emerald-300 text-emerald-950',
        item.readinessState === 'starting' && 'bg-cyan-100 text-slate-950',
        item.readinessState === 'paused' && 'bg-slate-700 text-white',
        item.readinessState === 'stopped' && 'bg-slate-600 text-white',
        item.readinessState === 'unreachable' && 'bg-orange-500 text-white',
        item.readinessState === 'unknown' && 'bg-slate-300 text-slate-950',
      )}
    >
      <Icon className={item.readinessState === 'starting' ? 'animate-spin' : undefined} data-icon="inline-start" />
      {labelForReadiness(item.readinessState)}
    </Badge>
  );
}

export function ManagementBadge({ item }: { item: ApplicationSurfaceItem }) {
  const Icon = item.managementState === 'managed' ? Server : item.managementState === 'linked' ? Link2 : Search;

  return (
    <Badge className="bg-slate-800 text-sky-50">
      <Icon data-icon="inline-start" />
      {labelForManagementState(item.managementState)}
    </Badge>
  );
}

export function AttentionIndicator({ item, className }: { item: ApplicationSurfaceItem; className?: string }) {
  if (item.attentionState === 'none') {
    return null;
  }

  return (
    <Badge
      className={cn(
        className,
        item.attentionState === 'needs_review' && 'bg-orange-500 text-white',
        item.attentionState === 'conflict' && 'bg-red-600 text-white',
        item.attentionState === 'blocked' && 'bg-red-700 text-white',
      )}
    >
      <AlertTriangle data-icon="inline-start" />
      {labelForAttention(item.attentionState)}
    </Badge>
  );
}

export function OperationBadge({ item, overlay = false }: { item: ApplicationSurfaceItem; overlay?: boolean }) {
  if (item.operationState.kind === 'idle') {
    return null;
  }

  const failed = item.operationState.kind === 'failed';
  const Icon = failed ? AlertTriangle : Loader2;

  return (
    <Badge
      className={cn(
        overlay && 'absolute right-3 top-3',
        failed ? 'bg-red-700 text-white' : 'bg-cyan-300 text-slate-950',
      )}
    >
      <Icon className={failed ? undefined : 'animate-spin'} data-icon="inline-start" />
      {item.operationState.label}
    </Badge>
  );
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
