import { AlertTriangle, CheckCircle2, CircleHelp, Link2, Loader2, Pause, Search, Server, XCircle } from 'lucide-react';
import { MetadataBadge } from '@/components/autark-os/MetadataBadge';
import { StatusBadge, type StatusBadgeTone } from '@/components/autark-os/StatusBadge';
import { cn } from '@/lib/utils';
import type { ApplicationSurfaceItem } from '../extensions/ApplicationsPage.types';

export function ReadinessBadge({ item, overlay = false }: { item: ApplicationSurfaceItem; overlay?: boolean }) {
  if (item.operationState.kind !== 'idle') {
    return <OperationBadge item={item} overlay={overlay} />;
  }

  const Icon = readinessIcon(item.readinessState);

  return (
    <StatusBadge
      appearance="solid"
      className={cn(overlay && 'absolute right-3 top-3')}
      icon={Icon}
      iconClassName={item.readinessState === 'starting' ? 'animate-spin' : undefined}
      tone={readinessTone(item.readinessState)}
    >
      {labelForReadiness(item.readinessState)}
    </StatusBadge>
  );
}

export function ManagementBadge({ item }: { item: ApplicationSurfaceItem }) {
  const Icon = item.managementState === 'managed' ? Server : item.managementState === 'linked' ? Link2 : Search;

  return (
    <MetadataBadge appearance="solid" tone="neutral">
      <Icon data-icon="inline-start" />
      {labelForManagementState(item.managementState)}
    </MetadataBadge>
  );
}

export function AttentionIndicator({ item, className }: { item: ApplicationSurfaceItem; className?: string }) {
  if (item.attentionState === 'none') {
    return null;
  }

  return (
    <StatusBadge appearance="solid" className={className} icon={AlertTriangle} tone={item.attentionState === 'needs_review' ? 'warning' : 'danger'}>
      {labelForAttention(item.attentionState)}
    </StatusBadge>
  );
}

export function OperationBadge({ item, overlay = false }: { item: ApplicationSurfaceItem; overlay?: boolean }) {
  if (item.operationState.kind === 'idle') {
    return null;
  }

  const failed = item.operationState.kind === 'failed';
  const Icon = failed ? AlertTriangle : Loader2;

  return (
    <StatusBadge
      appearance="solid"
      className={cn(overlay && 'absolute right-3 top-3')}
      icon={Icon}
      iconClassName={failed ? undefined : 'animate-spin'}
      tone={failed ? 'danger' : 'info'}
    >
      {item.operationState.label}
    </StatusBadge>
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

export function readinessTone(state: ApplicationSurfaceItem['readinessState']): StatusBadgeTone {
  if (state === 'ready') return 'success';
  if (state === 'starting') return 'info';
  if (state === 'unreachable') return 'warning';
  return 'neutral';
}
