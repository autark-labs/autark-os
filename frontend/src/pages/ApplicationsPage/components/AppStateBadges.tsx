import { AlertTriangle, CheckCircle2, CircleHelp, Loader2, Pause, Server, XCircle } from 'lucide-react';
import { MetadataBadge } from '@/components/autark-os/MetadataBadge';
import { StatusBadge, type StatusBadgeTone } from '@/components/autark-os/StatusBadge';
import { cn } from '@/lib/utils';
import type { ApplicationSurfaceItem } from '../extensions/ApplicationsPage.types';

export function RuntimeBadge({ item, overlay = false }: { item: ApplicationSurfaceItem; overlay?: boolean }) {
  if (item.operation.kind !== 'idle') return <OperationBadge item={item} overlay={overlay} />;
  const Icon = runtimeIcon(item.state);
  return (
    <StatusBadge appearance="solid" className={cn(overlay && 'absolute right-3 top-3')} icon={Icon}
      iconClassName={item.state === 'starting' ? 'animate-spin' : undefined} tone={runtimeTone(item.state)}>
      {labelForRuntimeState(item.state)}
    </StatusBadge>
  );
}

export function RelationshipBadge() {
  return <MetadataBadge appearance="solid" tone="neutral"><Server data-icon="inline-start" />Managed app</MetadataBadge>;
}

export function IssueIndicator({ item, className }: { item: ApplicationSurfaceItem; className?: string }) {
  const issue = item.issues[0];
  if (!issue) return null;
  const danger = issue.severity === 'critical';
  return (
    <StatusBadge appearance="solid" className={className} icon={AlertTriangle} tone={danger ? 'danger' : 'warning'}>
      {danger ? 'Blocked' : 'Needs review'}
    </StatusBadge>
  );
}

export function OperationBadge({ item, overlay = false }: { item: ApplicationSurfaceItem; overlay?: boolean }) {
  if (item.operation.kind === 'idle') return null;
  const failed = item.operation.kind === 'failed';
  const Icon = failed ? AlertTriangle : Loader2;
  return (
    <StatusBadge appearance="solid" className={cn(overlay && 'absolute right-3 top-3')} icon={Icon}
      iconClassName={failed ? undefined : 'animate-spin'} tone={failed ? 'danger' : 'info'}>
      {item.operation.label}
    </StatusBadge>
  );
}

export function labelForRelationship(_state: ApplicationSurfaceItem['relationship'], length: 'short' | 'long' = 'long') {
  return length === 'short' ? 'Managed' : 'Managed app';
}

export function labelForRuntimeState(state: ApplicationSurfaceItem['state']) {
  if (state === 'ready') return 'Ready';
  if (state === 'starting') return 'Starting';
  if (state === 'stopped') return 'Stopped';
  if (state === 'degraded') return 'Needs attention';
  if (state === 'missing') return 'Missing';
  return 'Unknown';
}

function runtimeIcon(state: ApplicationSurfaceItem['state']) {
  if (state === 'ready') return CheckCircle2;
  if (state === 'starting') return Loader2;
  if (state === 'stopped') return Pause;
  if (state === 'degraded' || state === 'missing') return XCircle;
  return CircleHelp;
}

export function runtimeTone(state: ApplicationSurfaceItem['state']): StatusBadgeTone {
  if (state === 'ready') return 'success';
  if (state === 'starting') return 'info';
  if (state === 'degraded' || state === 'missing') return 'warning';
  return 'neutral';
}
