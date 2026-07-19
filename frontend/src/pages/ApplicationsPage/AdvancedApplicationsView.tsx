import { ExternalLink, Loader2, Network, Pause, Play, RotateCw, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { AppCardName } from '@/components/autark-os/AppCardName';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { ProjectEmptyState } from '@/components/primitives/EmptyState';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { CompactOperationStatus } from './components/AppOperationStatus';
import { AttentionIndicator, ManagementBadge, ReadinessBadge } from './components/AppStateBadges';
import { ApplicationDarkControlButton, ApplicationOpenButton } from './components/ApplicationButtons';
import { ApplicationIcon } from './extensions/ApplicationVisuals';
import { runtimeActionDisabled, runtimeActionDisabledReason } from './extensions/ApplicationsPage.operations';
import type { ApplicationActionHandlers, ApplicationEmptyState, ApplicationRuntimeAction, ApplicationSurfaceItem } from './extensions/ApplicationsPage.types';

type AdvancedApplicationsViewProps = {
  actions: ApplicationActionHandlers;
  actionLoadingByItemId: Record<string, ApplicationRuntimeAction | null | undefined>;
  emptyState: ApplicationEmptyState;
  items: ApplicationSurfaceItem[];
  managementOpen: boolean;
  onSelect: (id: string) => void;
  selectedId?: string;
};

const tableHeadClass = 'sticky top-0 z-20 h-10 bg-slate-950 text-sky-100/70';

export function AdvancedApplicationsView({ actions, actionLoadingByItemId, emptyState, items, managementOpen, onSelect, selectedId }: AdvancedApplicationsViewProps) {
  const tableRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const tableContainer = tableRef.current;
    if (!tableContainer) {
      return;
    }
    if (managementOpen) {
      tableContainer.setAttribute('inert', '');
      return;
    }
    tableContainer.removeAttribute('inert');
  }, [managementOpen]);

  return (
    <Card className="flex h-full min-h-0 flex-col !gap-0 overflow-hidden rounded-2xl border border-app-border-muted bg-app-panel text-app-text shadow-xl shadow-slate-950/30 ring-0">
      <CardContent className="relative min-h-0 flex-1 overflow-hidden px-3 pb-3">
        {!items.length ? (
          <AdvancedEmptyState emptyState={emptyState} />
        ) : (
          <div aria-label="Installed apps table" data-testid="advanced-table-scroll-area" role="region" tabIndex={0} className="h-full min-h-0 overflow-auto overscroll-contain rounded-xl border border-app-border-muted bg-slate-950 px-2 pb-2">
            <Table aria-hidden={managementOpen} className="min-w-[41rem] table-fixed border-separate border-spacing-y-2" containerClassName="overflow-visible" ref={tableRef}>
              <colgroup>
                <col className="w-36" />
                <col className="w-28" />
                <col className="w-24" />
                <col className="w-20" />
                <col className="w-20" />
                <col className="w-36" />
              </colgroup>
              <TableHeader>
                <TableRow className="h-10 border-transparent hover:bg-transparent">
                  <TableHead className={cn(tableHeadClass, 'sticky left-0 z-30 bg-slate-950 px-3 shadow-app-pinned-column')}>Name</TableHead>
                  <TableHead className={tableHeadClass}>Type</TableHead>
                  <TableHead className={tableHeadClass}>State</TableHead>
                  <TableHead className={tableHeadClass}>Access</TableHead>
                  <TableHead className={tableHeadClass}>Backup</TableHead>
                  <TableHead className={cn(tableHeadClass, 'text-right')}>Controls</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <AdvancedApplicationRow
                    actions={actions}
                    item={item}
                    key={item.id}
                    loadingAction={actionLoadingByItemId[item.id] ?? null}
                    managementOpen={managementOpen}
                    onSelect={onSelect}
                    selected={selectedId === item.id}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {managementOpen && <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 bg-slate-950/15 backdrop-blur-[1px]" />}
      </CardContent>
    </Card>
  );
}

function AdvancedApplicationRow({ actions, item, loadingAction, managementOpen, onSelect, selected }: {
  actions: ApplicationActionHandlers;
  item: ApplicationSurfaceItem;
  loadingAction: ApplicationRuntimeAction | null;
  managementOpen: boolean;
  onSelect: (id: string) => void;
  selected: boolean;
}) {
  const primaryRuntimeActionLoading = loadingAction === 'start' || loadingAction === 'stop';
  const actionDisabled = (action: ApplicationRuntimeAction) => runtimeActionDisabled(item, action, loadingAction);
  const disabledReason = (action: ApplicationRuntimeAction) => runtimeActionDisabledReason(item, action, loadingAction);
  const rowClassName = cn(
    'group/app-card h-16 border-transparent bg-app-card-harbor text-slate-50 shadow-lg shadow-slate-950/15 transition-colors',
    !managementOpen && 'hover:bg-app-card-harbor-hover',
    selected && 'bg-app-card-harbor-hover ring-1 ring-cyan-100/60 shadow-xl shadow-cyan-200/15',
  );
  const pinnedCellClassName = cn(
    'sticky left-0 z-10 h-16 rounded-l-xl bg-app-card-harbor px-3 py-0 shadow-app-pinned-column',
    !managementOpen && 'group-hover/app-card:bg-app-card-harbor-hover',
    selected && 'bg-app-card-harbor-hover',
  );

  return (
    <TableRow className={rowClassName}>
      <TableCell className={pinnedCellClassName}>
        <div className="flex h-16 min-w-0 items-center gap-3">
          <ApplicationIcon item={item} size="sm" tone="harbor" />
          <div className="min-w-0 flex-1">
            <AppCardName
              className="text-sm font-semibold leading-5 text-white"
              name={item.name}
              onSelect={() => onSelect(item.id)}
              selectAriaLabel={`Manage ${item.name}`}
            />
          </div>
        </div>
      </TableCell>
      <TableCell className="h-16 px-3 py-0"><ManagementBadge item={item} /></TableCell>
      <TableCell className="h-16 px-3 py-0">
        {item.operationState.kind !== 'idle' ? (
          <CompactOperationStatus compact item={item} />
        ) : item.attentionState !== 'none' ? <AttentionIndicator item={item} /> : <ReadinessBadge item={item} />}
      </TableCell>
      <TableCell className="h-16 px-3 py-0"><TableMetadata icon={<Network aria-hidden="true" className="size-3.5" />} value={item.access} /></TableCell>
      <TableCell className="h-16 px-3 py-0"><BackupMetadata item={item} /></TableCell>
      <TableCell className="h-16 rounded-r-xl px-3 py-0">
        <div className="flex h-16 justify-end gap-1 whitespace-nowrap">
          {item.href && (
            <ApplicationOpenButton asChild className="my-auto size-8 px-0" size="icon-sm">
              <a aria-label={`Open ${item.name}`} href={item.href} onClick={(event) => event.stopPropagation()} rel="noreferrer" target="_blank" title={`Open ${item.name}`}>
                <ExternalLink />
              </a>
            </ApplicationOpenButton>
          )}
          {item.managementState === 'managed' && (
            primaryRuntimeActionLoading ? (
              <DisabledAction disabled reason={disabledReason(loadingAction)}>
                <ApplicationDarkControlButton aria-label={runtimeActionLabel(loadingAction)} disabled className="my-auto size-8 px-0" size="icon-sm" title={runtimeActionLabel(loadingAction)} type="button">
                  <Loader2 className="animate-spin" />
                </ApplicationDarkControlButton>
              </DisabledAction>
            ) : item.readinessState === 'paused' || item.readinessState === 'stopped' ? (
              <DisabledAction disabled={actionDisabled('start')} reason={disabledReason('start')}>
                <ApplicationDarkControlButton aria-label={`Start ${item.name}`} disabled={actionDisabled('start')} className="my-auto size-8 px-0" onClick={(event) => {
                  event.stopPropagation();
                  actions.onStart(item.id);
                }} size="icon-sm" title={`Start ${item.name}`} type="button">
                  <Play />
                </ApplicationDarkControlButton>
              </DisabledAction>
            ) : (
              <DisabledAction disabled={actionDisabled('stop')} reason={disabledReason('stop')}>
                <ApplicationDarkControlButton aria-label={`Pause ${item.name}`} disabled={actionDisabled('stop')} className="my-auto size-8 px-0" onClick={(event) => {
                  event.stopPropagation();
                  actions.onStop(item.id);
                }} size="icon-sm" title={`Pause ${item.name}`} type="button">
                  <Pause />
                </ApplicationDarkControlButton>
              </DisabledAction>
            )
          )}
          {item.managementState === 'managed' && (
            <DisabledAction disabled={actionDisabled('restart')} reason={disabledReason('restart')}>
              <ApplicationDarkControlButton aria-label={`${loadingAction === 'restart' ? 'Restarting' : 'Restart'} ${item.name}`} disabled={actionDisabled('restart')} className="my-auto size-8 px-0" onClick={(event) => {
                event.stopPropagation();
                actions.onRestart(item.id);
              }} size="icon-sm" title={`${loadingAction === 'restart' ? 'Restarting' : 'Restart'} ${item.name}`} type="button">
                {loadingAction === 'restart' ? <Loader2 className="animate-spin" /> : <RotateCw />}
              </ApplicationDarkControlButton>
            </DisabledAction>
          )}
          {item.managementState === 'managed' && (
            <DisabledAction disabled={actionDisabled('backup')} reason={disabledReason('backup')}>
              <ApplicationDarkControlButton aria-label={`${loadingAction === 'backup' ? 'Backing up' : 'Back up'} ${item.name}`} disabled={actionDisabled('backup')} className="my-auto size-8 px-0" onClick={(event) => {
                event.stopPropagation();
                actions.onCreateBackup(item.id);
              }} size="icon-sm" title={`${loadingAction === 'backup' ? 'Backing up' : 'Back up'} ${item.name}`} type="button">
                {loadingAction === 'backup' ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
              </ApplicationDarkControlButton>
            </DisabledAction>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function TableMetadata({ icon, value }: { icon: React.ReactNode; value: string }) {
  return <div className="flex h-16 min-w-0 items-center gap-1.5 text-xs text-sky-100/75">{icon}<span className="truncate" title={value}>{value}</span></div>;
}

function BackupMetadata({ item }: { item: ApplicationSurfaceItem }) {
  const protectedBackup = item.backup === 'Protected';
  return (
    <div className={cn('flex h-16 min-w-0 items-center gap-1.5 text-xs font-medium', protectedBackup ? 'text-emerald-100' : 'text-amber-100')}>
      {protectedBackup ? <ShieldCheck aria-hidden="true" className="size-3.5 shrink-0" /> : <ShieldAlert aria-hidden="true" className="size-3.5 shrink-0" />}
      <span className="truncate" title={item.backup}>{item.backup}</span>
    </div>
  );
}

function AdvancedEmptyState({ emptyState }: { emptyState: ApplicationEmptyState }) {
  return (
    <ProjectEmptyState
      className="rounded-xl border-app-border-muted bg-slate-950"
      description={emptyState.description}
      icon={<Search />}
      title={emptyState.title}
    />
  );
}

function runtimeActionLabel(action: ApplicationRuntimeAction | null) {
  if (action === 'start') return 'Starting';
  if (action === 'stop') return 'Pausing';
  if (action === 'backup') return 'Backing up';
  if (action === 'repair') return 'Repairing';
  return 'Restarting';
}
