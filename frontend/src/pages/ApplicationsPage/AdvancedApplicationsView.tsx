import { ExternalLink, Loader2, Pause, Play, RotateCw, Search, ShieldCheck } from 'lucide-react';
import { useEffect, useRef } from 'react';
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
import { ApplicationLightControlButton, ApplicationOpenButton } from './components/ApplicationButtons';
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

const tableHeadClass = 'sticky top-0 z-20 bg-slate-800 text-sky-100/70';
const tableCellMutedClass = 'text-slate-700';

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
    <Card className="flex h-full min-h-0 flex-col !gap-0 overflow-hidden rounded-2xl border border-sky-400/30 bg-slate-900 text-slate-50 shadow-xl shadow-slate-950/30 ring-0">
      <CardContent className="relative min-h-0 flex-1 overflow-hidden px-3 pb-3">
        {!items.length ? (
          <AdvancedEmptyState emptyState={emptyState} />
        ) : (
        <div data-testid="advanced-table-scroll-area" className="h-full min-h-0 overflow-auto overscroll-contain rounded-xl border border-sky-400/25 bg-slate-800 px-2 pb-2">
          <Table aria-hidden={managementOpen} className="border-separate border-spacing-y-2" containerClassName="overflow-visible" ref={tableRef}>
              <TableHeader>
                <TableRow className="border-transparent hover:bg-transparent">
                <TableHead className={tableHeadClass}>Name</TableHead>
                <TableHead className={tableHeadClass}>Type</TableHead>
                <TableHead className={tableHeadClass}>State</TableHead>
                <TableHead className={tableHeadClass}>Access</TableHead>
                <TableHead className={tableHeadClass}>Backup</TableHead>
                <TableHead className={`text-right ${tableHeadClass}`}>Controls</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const loadingAction = actionLoadingByItemId[item.id] ?? null;
                const primaryRuntimeActionLoading = loadingAction === 'start' || loadingAction === 'stop';
                const actionDisabled = (action: ApplicationRuntimeAction) => runtimeActionDisabled(item, action, loadingAction);
                const disabledReason = (action: ApplicationRuntimeAction) => runtimeActionDisabledReason(item, action, loadingAction);

                return (
                  <TableRow
                    className={cn(
                      'border-transparent bg-sky-100 text-slate-950 shadow-md shadow-slate-950/20 transition-all duration-200',
                      !managementOpen && 'hover:-translate-y-0.5 hover:bg-sky-50 hover:shadow-lg',
                      item.attentionState !== 'none' && cn('bg-orange-200', !managementOpen && 'hover:bg-orange-100'),
                      item.readinessState === 'paused' && cn('bg-slate-200', !managementOpen && 'hover:bg-slate-100'),
                      selectedId === item.id && cn(
                        'bg-cyan-100 shadow-xl shadow-cyan-300/35 ring-2 ring-cyan-300/40',
                        !managementOpen && 'hover:bg-cyan-50',
                      ),
                    )}
                    key={item.id}
                  >
                    <TableCell className="rounded-l-xl">
                      <button
                        aria-label={`Manage ${item.name}`}
                        className="flex w-full items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 focus-visible:ring-offset-2 focus-visible:ring-offset-sky-100"
                        disabled={managementOpen}
                        onClick={() => onSelect(item.id)}
                        type="button"
                      >
                        <ApplicationIcon item={item} size="sm" />
                        <div className="min-w-0">
                          <div className="break-words font-medium text-slate-950" title={item.name}>{item.name}</div>
                        </div>
                      </button>
                    </TableCell>
                    <TableCell>
                      <ManagementBadge item={item} />
                    </TableCell>
                    <TableCell>
                      <div className="grid gap-1.5">
                        <div className="flex flex-wrap gap-1">
                          <ReadinessBadge item={item} />
                          <AttentionIndicator item={item} />
                        </div>
                        <CompactOperationStatus item={item} />
                      </div>
                    </TableCell>
                    <TableCell className={tableCellMutedClass}>{item.access}</TableCell>
                    <TableCell className={tableCellMutedClass}>{item.backup}</TableCell>
                    <TableCell className="rounded-r-xl">
                      <div className="flex justify-end gap-2 whitespace-nowrap">
                        {item.href && (
                          <ApplicationOpenButton asChild className="border-cyan-300" size="sm" variant="outline">
                            <a href={item.href} onClick={(event) => event.stopPropagation()} rel="noreferrer" target="_blank">
                              <ExternalLink data-icon="inline-start" />
                              Open
                            </a>
                          </ApplicationOpenButton>
                        )}
                        {item.managementState === 'managed' && (
                          primaryRuntimeActionLoading ? (
                            <DisabledAction disabled reason={disabledReason(loadingAction)}>
                              <ApplicationLightControlButton disabled size="sm" type="button">
                                <Loader2 className="animate-spin" data-icon="inline-start" />
                                {runtimeActionLabel(loadingAction)}
                              </ApplicationLightControlButton>
                            </DisabledAction>
                          ) : item.readinessState === 'paused' || item.readinessState === 'stopped' ? (
                            <DisabledAction disabled={actionDisabled('start')} reason={disabledReason('start')}>
                              <ApplicationLightControlButton disabled={actionDisabled('start')} onClick={(event) => {
                                event.stopPropagation();
                                actions.onStart(item.id);
                              }} size="sm" type="button" variant="outline">
                                <Play data-icon="inline-start" />
                                Start
                              </ApplicationLightControlButton>
                            </DisabledAction>
                          ) : (
                            <DisabledAction disabled={actionDisabled('stop')} reason={disabledReason('stop')}>
                              <ApplicationLightControlButton disabled={actionDisabled('stop')} onClick={(event) => {
                                event.stopPropagation();
                                actions.onStop(item.id);
                              }} size="sm" type="button" variant="outline">
                                <Pause data-icon="inline-start" />
                                Stop
                              </ApplicationLightControlButton>
                            </DisabledAction>
                          )
                        )}
                        {item.managementState === 'managed' && (
                          <DisabledAction disabled={actionDisabled('restart')} reason={disabledReason('restart')}>
                            <ApplicationLightControlButton disabled={actionDisabled('restart')} onClick={(event) => {
                              event.stopPropagation();
                              actions.onRestart(item.id);
                            }} size="sm" type="button" variant="outline">
                              {loadingAction === 'restart' ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RotateCw data-icon="inline-start" />}
                              {loadingAction === 'restart' ? 'Restarting' : 'Restart'}
                            </ApplicationLightControlButton>
                          </DisabledAction>
                        )}
                        {item.managementState === 'managed' && (
                          <DisabledAction disabled={actionDisabled('backup')} reason={disabledReason('backup')}>
                            <ApplicationLightControlButton onClick={(event) => {
                              event.stopPropagation();
                              actions.onCreateBackup(item.id);
                            }} disabled={actionDisabled('backup')} size="sm" type="button" variant="outline">
                              {loadingAction === 'backup' ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ShieldCheck data-icon="inline-start" />}
                              {loadingAction === 'backup' ? 'Backing up' : 'Backup'}
                            </ApplicationLightControlButton>
                          </DisabledAction>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        )}
        {managementOpen && <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 bg-slate-950/15 backdrop-blur-[1px]" />}
      </CardContent>
    </Card>
  );
}

function AdvancedEmptyState({ emptyState }: { emptyState: ApplicationEmptyState }) {
  return (
    <ProjectEmptyState
      className="rounded-xl border-sky-400/25 bg-slate-800"
      description={emptyState.description}
      icon={<Search />}
      title={emptyState.title}
    />
  );
}

function runtimeActionLabel(action: ApplicationRuntimeAction) {
  if (action === 'start') return 'Starting';
  if (action === 'stop') return 'Pausing';
  if (action === 'backup') return 'Backing up';
  if (action === 'repair') return 'Repairing';
  return 'Restarting';
}
