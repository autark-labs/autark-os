import { ExternalLink, Loader2, Pause, Play, RotateCw, Search, ShieldCheck } from 'lucide-react';
import { DisabledAction } from '@/components/project-os/DisabledAction';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
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
import { ApplicationIcon } from './extensions/ApplicationVisuals';
import { runtimeControlsDisabled } from './extensions/ApplicationsPage.operations.js';
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

export function AdvancedApplicationsView({ actions, actionLoadingByItemId, emptyState, items, managementOpen, onSelect, selectedId }: AdvancedApplicationsViewProps) {
  return (
    <Card className="min-h-[44rem] overflow-visible rounded-2xl border border-sky-400/30 bg-slate-900 text-slate-50 shadow-xl shadow-slate-950/30 ring-0">
      <CardHeader>
        <CardTitle className="text-white">Operations</CardTitle>
        <CardDescription className="text-sky-100/70">
          Review app state, access posture, backup coverage, and runtime controls in a compact operations view.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!items.length ? (
          <AdvancedEmptyState emptyState={emptyState} />
        ) : (
        <div className="rounded-xl border border-sky-400/25 bg-slate-800 px-2 pb-2">
          <Table className="border-separate border-spacing-y-2">
            <TableHeader>
              <TableRow className="border-transparent hover:bg-transparent">
                <TableHead className="text-sky-100/70">Name</TableHead>
                <TableHead className="text-sky-100/70">Type</TableHead>
                <TableHead className="text-sky-100/70">State</TableHead>
                <TableHead className="text-sky-100/70">Access</TableHead>
                <TableHead className="text-sky-100/70">Backup</TableHead>
                <TableHead className="text-right text-sky-100/70">Controls</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const loadingAction = actionLoadingByItemId[item.id] ?? null;
                const primaryRuntimeActionLoading = loadingAction === 'start' || loadingAction === 'stop';
                const runtimeActionDisabled = runtimeControlsDisabled(item.operationState, loadingAction);
                const runtimeDisabledReason = runtimeControlDisabledReason(item, loadingAction);

                return (
                  <TableRow
                    aria-hidden={managementOpen}
                    className={cn(
                      'border-transparent bg-sky-100 text-slate-950 shadow-md shadow-slate-950/20 transition-all duration-200',
                      !managementOpen && 'cursor-pointer hover:-translate-y-0.5 hover:bg-sky-50 hover:shadow-lg',
                      managementOpen && 'pointer-events-none cursor-default',
                      item.attentionState !== 'none' && cn('bg-orange-200', !managementOpen && 'hover:bg-orange-100'),
                      item.readinessState === 'paused' && cn('bg-slate-200', !managementOpen && 'hover:bg-slate-100'),
                      managementOpen && selectedId && selectedId !== item.id && 'opacity-35 blur-[1px]',
                      selectedId === item.id && cn(
                        'bg-cyan-100 shadow-xl shadow-cyan-300/35 ring-2 ring-cyan-300/40',
                        !managementOpen && 'hover:bg-cyan-50',
                      ),
                    )}
                    key={item.id}
                    onClick={() => {
                      if (!managementOpen) {
                        onSelect(item.id);
                      }
                    }}
                  >
                    <TableCell className="rounded-l-xl">
                      <div className="flex items-center gap-3">
                        <ApplicationIcon item={item} size="sm" />
                        <div className="min-w-0">
                          <div className="font-medium text-slate-950">{item.name}</div>
                        </div>
                      </div>
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
                    <TableCell className="text-slate-700">{item.access}</TableCell>
                    <TableCell className="text-slate-700">{item.backup}</TableCell>
                    <TableCell className="rounded-r-xl">
                      <div className="flex justify-end gap-2 whitespace-nowrap">
                        {item.href && (
                          <Button asChild className="border-cyan-300 bg-cyan-300 text-slate-950 shadow-sm shadow-cyan-700/20 hover:bg-cyan-200" size="sm" variant="outline">
                            <a href={item.href} onClick={(event) => event.stopPropagation()} rel="noreferrer" target="_blank">
                              <ExternalLink data-icon="inline-start" />
                              Open
                            </a>
                          </Button>
                        )}
                        {item.managementState === 'managed' && (
                          primaryRuntimeActionLoading ? (
                            <DisabledAction disabled={runtimeActionDisabled} reason={runtimeDisabledReason}>
                              <Button className="border-sky-300 bg-white text-slate-950 hover:bg-sky-100" disabled size="sm" type="button" variant="outline">
                                <Loader2 className="animate-spin" data-icon="inline-start" />
                                {runtimeActionLabel(loadingAction)}
                              </Button>
                            </DisabledAction>
                          ) : item.readinessState === 'paused' || item.readinessState === 'stopped' ? (
                            <DisabledAction disabled={runtimeActionDisabled} reason={runtimeDisabledReason}>
                              <Button className="border-sky-300 bg-white text-slate-950 hover:bg-sky-100" disabled={runtimeActionDisabled} onClick={(event) => {
                                event.stopPropagation();
                                actions.onStart(item.id);
                              }} size="sm" type="button" variant="outline">
                                <Play data-icon="inline-start" />
                                Start
                              </Button>
                            </DisabledAction>
                          ) : (
                            <DisabledAction disabled={runtimeActionDisabled} reason={runtimeDisabledReason}>
                              <Button className="border-sky-300 bg-white text-slate-950 hover:bg-sky-100" disabled={runtimeActionDisabled} onClick={(event) => {
                                event.stopPropagation();
                                actions.onStop(item.id);
                              }} size="sm" type="button" variant="outline">
                                <Pause data-icon="inline-start" />
                                Stop
                              </Button>
                            </DisabledAction>
                          )
                        )}
                        {item.managementState === 'managed' && (
                          <DisabledAction disabled={runtimeActionDisabled} reason={runtimeDisabledReason}>
                            <Button className="border-sky-300 bg-white text-slate-950 hover:bg-sky-100" disabled={runtimeActionDisabled} onClick={(event) => {
                              event.stopPropagation();
                              actions.onRestart(item.id);
                            }} size="sm" type="button" variant="outline">
                              {loadingAction === 'restart' ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RotateCw data-icon="inline-start" />}
                              {loadingAction === 'restart' ? 'Restarting' : 'Restart'}
                            </Button>
                          </DisabledAction>
                        )}
                        {item.managementState === 'managed' && (
                          <DisabledAction disabled={runtimeActionDisabled} reason={runtimeDisabledReason}>
                            <Button className="border-sky-300 bg-white text-slate-950 hover:bg-sky-100" onClick={(event) => {
                              event.stopPropagation();
                              actions.onCreateBackup(item.id);
                            }} disabled={runtimeActionDisabled} size="sm" type="button" variant="outline">
                              {loadingAction === 'backup' ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ShieldCheck data-icon="inline-start" />}
                              {loadingAction === 'backup' ? 'Backing up' : 'Backup'}
                            </Button>
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
      </CardContent>
    </Card>
  );
}

function AdvancedEmptyState({ emptyState }: { emptyState: ApplicationEmptyState }) {
  return (
    <Empty className="min-h-96 rounded-xl border border-sky-400/25 bg-slate-800 text-slate-50">
      <EmptyHeader>
        <EmptyMedia className="bg-cyan-300 text-slate-950" variant="icon">
          <Search />
        </EmptyMedia>
        <EmptyTitle>{emptyState.title}</EmptyTitle>
        <EmptyDescription className="text-sky-100/70">{emptyState.description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function runtimeActionLabel(action: ApplicationRuntimeAction) {
  if (action === 'start') return 'Starting';
  if (action === 'stop') return 'Pausing';
  if (action === 'backup') return 'Backing up';
  if (action === 'repair') return 'Repairing';
  return 'Restarting';
}

function runtimeControlDisabledReason(item: ApplicationSurfaceItem, loadingAction: ApplicationRuntimeAction | null) {
  if (loadingAction) {
    return `${runtimeActionLabel(loadingAction)} is already running for ${item.name}.`;
  }
  if (item.operationState.kind !== 'idle' && item.operationState.kind !== 'failed') {
    return item.operationState.currentStep || `${item.operationState.label} is currently running for ${item.name}.`;
  }
  return 'This runtime control is currently available.';
}
