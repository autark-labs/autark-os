import { ExternalLink, MoreVertical } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AppArtwork } from '@/components/autark-os/AppArtwork';
import { AttentionIndicator, labelForReadiness } from './AppStateBadges';
import { applicationDeepLinkForSurfaceItem } from '../extensions/ApplicationsPage.deepLinks';
import { runtimeActionDisabled, runtimeActionDisabledReason } from '../extensions/ApplicationsPage.operations';
import type { ApplicationRuntimeAction, ApplicationSurfaceItem } from '../extensions/ApplicationsPage.types';

type CardAction = {
  disabled?: boolean;
  href?: string | null;
  id: string;
  label: string;
  reason?: string | null;
};

export function ApplicationCard({
  actionLoading,
  item,
  managementOpen,
  obscured,
  onAction,
  onSelect,
  selected,
}: {
  actionLoading?: ApplicationRuntimeAction | null;
  item: ApplicationSurfaceItem;
  managementOpen: boolean;
  obscured: boolean;
  onAction?: (item: ApplicationSurfaceItem, actionId: string) => void;
  onSelect: (id: string) => void;
  selected: boolean;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const manageHref = applicationDeepLinkForSurfaceItem(item, { panel: 'manage' });
  const actions = cardActions(item, actionLoading);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    if (managementOpen) {
      card.setAttribute('inert', '');
    } else {
      card.removeAttribute('inert');
    }
  }, [managementOpen]);

  return (
    <Card
      aria-hidden={managementOpen}
      className={cn(
        'relative h-[218px] w-[13rem] overflow-hidden rounded-xl border border-sky-300/20 bg-[#102644] !py-0 !gap-0 text-slate-50 shadow-lg shadow-slate-950/20 ring-0 transition duration-200',
        !managementOpen && 'cursor-pointer hover:-translate-y-0.5 hover:border-cyan-300/50 hover:bg-[#173455] hover:shadow-xl hover:shadow-cyan-950/30',
        managementOpen && 'pointer-events-none cursor-default',
        managementOpen && obscured && 'scale-[0.98] opacity-35 blur-[1px]',
        selected && 'z-10 border-cyan-300/80 shadow-xl shadow-cyan-950/30 ring-1 ring-cyan-300/45',
      )}
      ref={cardRef}
      size="sm"
    >
      <button
        aria-label={`Manage ${item.name}`}
        className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-300/80"
        disabled={managementOpen}
        onClick={() => onSelect(item.id)}
        type="button"
      >
        <span className="sr-only">Manage {item.name}</span>
      </button>

      <div className="pointer-events-none relative z-10">
        <AppArtwork className="h-32 transition duration-300 group-hover:scale-[1.02]" iconUrl={item.iconUrl} index={item.id.length} name={item.name} />
        <span className="absolute z-100 left-3 top-3 rounded-full border border-slate-950/40 bg-slate-950/65 px-2 py-1 text-[0.65rem] font-medium text-slate-100 backdrop-blur-sm">
          {item.managementState === 'linked' ? 'Linked' : 'Managed app'}
        </span>
        <div className="space-y-1 px-3 pb-3 pt-2">
          <p className="m-0 truncate text-sm font-semibold text-white" title={item.name}>{item.name}</p>
          <p className="m-0 truncate text-xs text-slate-400">{item.category || 'App'}</p>
          <div className="flex items-center gap-1.5 border-t border-sky-300/10 pt-2 text-[0.7rem] font-medium">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className={cn('size-1.5 shrink-0 rounded-full', readinessTone(item))} />
              <span className={cn(readinessTextTone(item))}>{statusLabel(item)}</span>
            </span>
          </div>
        </div>
      </div>

      <DropdownMenu>
        <div className="absolute bottom-2.5 right-2.5 z-20 flex items-center gap-1">
          {item.href ? (
            <a
              aria-label={`Open ${item.name}`}
              className="inline-flex size-6 items-center justify-center rounded-md text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80"
              href={item.href}
              onClick={(event) => event.stopPropagation()}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink className="size-3.5" />
            </a>
          ) : null}
          <DropdownMenuTrigger asChild>
            <button
              aria-label={`${item.name} actions`}
              className="inline-flex size-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80"
              disabled={managementOpen}
              onClick={(event) => event.stopPropagation()}
              type="button"
            >
              <MoreVertical className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
        </div>
        <DropdownMenuContent align="end" className="min-w-44 border-sky-300/20 bg-[#0b1831] text-slate-100" onClick={(event) => event.stopPropagation()}>
          <DropdownMenuLabel className="text-xs text-slate-400">{item.name}</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-sky-300/10" />
          {actions.map((action) => action.href ? (
            <DropdownMenuItem asChild key={action.id}>
              <a href={action.href} rel="noreferrer" target={action.href.startsWith('/') ? undefined : '_blank'}>{action.label}</a>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              disabled={action.disabled}
              key={action.id}
              onSelect={() => onAction?.(item, action.id)}
              title={action.reason || undefined}
            >
              {action.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator className="bg-sky-300/10" />
          <DropdownMenuItem asChild>
            <Link to={manageHref}>Manage details</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {item.attentionState !== 'none' && <AttentionIndicator item={item} className="absolute right-3 top-3 z-20" />}
    </Card>
  );
}

function cardActions(item: ApplicationSurfaceItem, actionLoading: ApplicationRuntimeAction | null | undefined): CardAction[] {
  const known = new Map(item.availableActions.map((action) => [action.id, action]));
  const actions: CardAction[] = [];

  if (item.managementState === 'managed') {
    const lifecycleActions: ApplicationRuntimeAction[] = item.readinessState === 'paused' || item.readinessState === 'stopped'
      ? ['start', 'restart', 'backup', 'repair']
      : ['stop', 'restart', 'backup', 'repair'];
    lifecycleActions.forEach((id) => {
      const action = known.get(id);
      const disabled = runtimeActionDisabled(item, id, actionLoading ?? null);
      actions.push({
        disabled,
        id,
        label: action?.label || lifecycleLabel(id),
        reason: disabled ? runtimeActionDisabledReason(item, id, actionLoading ?? null) : action?.reason,
      });
    });
  }

  item.availableActions.forEach((action) => {
    if (!actions.some((candidate) => candidate.id === action.id)) {
      actions.push({
        ...action,
        href: action.href || (action.id === 'open' ? item.href : undefined),
        disabled: action.disabled || (!action.href && action.id !== 'open' && action.id !== 'pin' && action.id !== 'unpin'),
        reason: action.reason || (!action.href && action.id !== 'open' && action.id !== 'pin' && action.id !== 'unpin' ? 'Open the app details to complete this action.' : undefined),
      });
    }
  });

  return actions;
}

function lifecycleLabel(action: ApplicationRuntimeAction) {
  if (action === 'start') return 'Start app';
  if (action === 'stop') return 'Pause app';
  if (action === 'restart') return 'Restart app';
  if (action === 'backup') return 'Create backup';
  return 'Repair app';
}

function statusLabel(item: ApplicationSurfaceItem) {
  if (item.operationState.kind !== 'idle') return item.operationState.label;
  if (item.attentionState !== 'none') return 'Needs attention';
  return labelForReadiness(item.readinessState);
}

function readinessTone(item: ApplicationSurfaceItem) {
  if (item.operationState.kind === 'failed' || item.attentionState !== 'none') return 'bg-amber-400';
  if (item.operationState.kind !== 'idle' || item.readinessState === 'starting') return 'bg-cyan-300';
  if (item.readinessState === 'ready') return 'bg-emerald-400';
  return 'bg-slate-400';
}

function readinessTextTone(item: ApplicationSurfaceItem) {
  if (item.operationState.kind === 'failed' || item.attentionState !== 'none') return 'text-amber-200';
  if (item.operationState.kind !== 'idle' || item.readinessState === 'starting') return 'text-cyan-200';
  if (item.readinessState === 'ready') return 'text-emerald-300';
  return 'text-slate-300';
}
