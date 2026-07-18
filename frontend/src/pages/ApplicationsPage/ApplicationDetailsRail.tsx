import { forwardRef, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, Pause, Play, RotateCw, ShieldCheck, Wrench, X } from 'lucide-react';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { ApplicationDarkControlButton, ApplicationPrimaryButton } from './components/ApplicationButtons';
import { ExpandedOperationStatus } from './components/AppOperationStatus';
import { labelForAttention, labelForManagementState, labelForReadiness } from './components/AppStateBadges';
import { ApplicationIcon } from './extensions/ApplicationVisuals';
import { ApplicationManagementPanel } from './ApplicationManagementPanel';
import { runtimeActionDisabled, runtimeActionDisabledReason, runtimeControlsDisabled } from './extensions/ApplicationsPage.operations';
import type { ApplicationActionHandlers, ApplicationNextAction, ApplicationRuntimeAction, ApplicationSettingsAction, ApplicationSurfaceItem } from './extensions/ApplicationsPage.types';

type ApplicationDetailsRailProps = {
  actions: ApplicationActionHandlers;
  actionLoadingByItemId: Record<string, ApplicationRuntimeAction | null | undefined>;
  canCloseManagement: () => boolean;
  item: ApplicationSurfaceItem | null;
  managementOpen: boolean;
  onManagementOpenChange: (open: boolean) => void;
  settingsLoadingByItemId: Record<string, ApplicationSettingsAction | null | undefined>;
};

type RailView = 'overview' | 'attention';

export const ApplicationDetailsRail = forwardRef<HTMLDivElement, ApplicationDetailsRailProps>(function ApplicationDetailsRail(
  { actions, actionLoadingByItemId, canCloseManagement, item, managementOpen, onManagementOpenChange, settingsLoadingByItemId },
  ref,
) {
  const [managementTab, setManagementTab] = useState('overview');
  const [railView, setRailView] = useState<RailView>('overview');
  const managementDrawerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setManagementTab(item?.operationState.kind === 'failed' ? 'recovery' : 'overview');
    setRailView('overview');
  }, [item?.id, item?.operationState.kind]);

  useEffect(() => {
    const drawer = managementDrawerRef.current;
    if (!drawer) {
      return;
    }
    if (managementOpen) {
      drawer.removeAttribute('inert');
      return;
    }
    drawer.setAttribute('inert', '');
  }, [item?.id, managementOpen]);

  return (
    <div
      className="relative z-30 h-fit w-full scroll-mt-5 justify-self-end lg:h-full lg:sticky lg:top-5 lg:w-[22rem]"
      onPointerDown={(event) => event.stopPropagation()}
      ref={ref}
    >
      {item && (
        <section
          aria-hidden={!managementOpen}
          className={cn(
            'absolute right-[calc(100%-1px)] top-0 z-20 h-full w-[42rem] max-w-[calc(100vw-24rem)] overflow-y-auto rounded-l-2xl border border-r-0 border-cyan-300/40 bg-slate-900 text-slate-50 shadow-2xl shadow-cyan-950/40 transition-transform duration-300 ease-out motion-reduce:transition-none',
            managementOpen ? 'translate-x-0' : 'pointer-events-none translate-x-[calc(100%+22rem)]',
          )}
          ref={managementDrawerRef}
        >
          <div className="border-b border-sky-400/20 px-3 py-3">
            <p className="text-sm font-semibold text-white">Management</p>
            <p className="text-xs leading-5 text-sky-100/60">Focused controls, settings, links, and diagnostics for the selected item.</p>
          </div>
          <ApplicationManagementPanel
            actions={actions}
            item={item}
            onTabValueChange={setManagementTab}
            settingsLoadingAction={settingsLoadingByItemId[item.id] ?? null}
            tabValue={managementTab}
            variant="rail"
          />
        </section>
      )}

      <Card
        size="sm"
        className={cn(
          'relative z-30 h-fit w-full overflow-hidden rounded-2xl border border-sky-400/30 bg-slate-900 text-slate-50 shadow-xl shadow-slate-950/30 ring-0 transition-[border-radius,box-shadow] duration-200 ease-out lg:h-full lg:max-h-full lg:overflow-y-auto',
          managementOpen && 'rounded-l-none shadow-2xl shadow-cyan-950/50',
        )}
      >
        <CardHeader className="min-w-0 gap-2 px-3">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-start gap-2">
            {item && <ApplicationIcon item={item} size="md" />}
            <div className="min-w-0 flex-1">
              <CardTitle className="line-clamp-2 break-words text-white">{item?.name ?? 'Selected app'}</CardTitle>
              <CardDescription className="break-words leading-5 text-sky-100/70">{item?.description ?? 'Select an app or service to review details.'}</CardDescription>
            </div>
          </div>

          {item && (
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
              {item.href && (
                <ApplicationPrimaryButton asChild className="w-full min-w-0 overflow-hidden" size="sm">
                  <a href={item.href} rel="noreferrer" target="_blank">
                    <ExternalLink data-icon="inline-start" />
                    <span className="truncate">Open app</span>
                  </a>
                </ApplicationPrimaryButton>
              )}
              <Button
                className={cn(
                  'w-full min-w-0 overflow-hidden border-sky-400/40 bg-slate-800 text-sky-50 hover:bg-slate-700 hover:text-white',
                  !item.href && 'col-span-2',
                  managementOpen && 'border-cyan-300 bg-cyan-300 text-slate-950 hover:bg-cyan-200 hover:text-slate-950',
                )}
                onClick={() => {
                  if (managementOpen && !canCloseManagement()) {
                    return;
                  }
                  onManagementOpenChange(!managementOpen);
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                {managementOpen ? <X data-icon="inline-start" /> : <Wrench data-icon="inline-start" />}
                <span className="truncate">{managementOpen ? 'Close details' : 'Manage app'}</span>
              </Button>
            </div>
          )}
        </div>
        </CardHeader>

        <CardContent className="min-h-0 overflow-hidden px-3">
        {item ? (
          <CompactRailView
            actions={actions}
            item={item}
            loadingAction={actionLoadingByItemId[item.id] ?? null}
            onOpenRecovery={() => {
              setManagementTab('recovery');
              onManagementOpenChange(true);
            }}
            railView={railView}
            setRailView={setRailView}
          />
        ) : (
          <p className="text-sm text-sky-100/70">No item selected.</p>
        )}
        </CardContent>
      </Card>
    </div>
  );
});

function CompactRailView({
  actions,
  item,
  loadingAction,
  onOpenRecovery,
  railView,
  setRailView,
}: {
  actions: ApplicationActionHandlers;
  item: ApplicationSurfaceItem;
  loadingAction: ApplicationRuntimeAction | null;
  onOpenRecovery: () => void;
  railView: RailView;
  setRailView: (view: RailView) => void;
}) {
  const issues = buildAttentionIssues({ actions, item, loadingAction, onOpenRecovery });

  return (
    <div className="flex min-h-0 flex-col gap-3" data-management-state={labelForManagementState(item.managementState)}>
      <ExpandedOperationStatus item={item} />
      <StatusLegend />
      <Tabs onValueChange={(value) => setRailView(value as RailView)} value={railView}>
        <TabsList className="w-full rounded-lg border border-sky-400/20 bg-slate-800 p-1" variant="default">
          <TabsTrigger className="text-xs" value="overview">Overview</TabsTrigger>
          <TabsTrigger className="text-xs" value="attention">
            Attention
            {issues.length > 0 && <span className="ml-0.5 rounded-full bg-orange-400/20 px-1.5 py-0.5 text-[10px] text-orange-100">{issues.length}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent className="grid gap-3" value="overview">
          <div className="grid gap-2">
            <RailStatusRow label="State" tone={readinessTone(item)} value={labelForReadiness(item.readinessState)} />
            <RailStatusRow label="Access" tone={accessTone(item)} value={item.access} />
            <RailStatusRow label="Backup" tone={backupTone(item)} value={item.backup} />
          </div>
          <RailControls actions={actions} item={item} loadingAction={loadingAction} />
          <RecentActivitySummary item={item} />
        </TabsContent>

        <TabsContent className="grid gap-2" value="attention">
          <AttentionPanel issues={issues} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatusLegend() {
  return (
    <div aria-label="Status legend" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-sky-400/15 py-2 text-[10px] text-sky-100/65">
      <span className="font-semibold text-sky-100/80">Status</span>
      <LegendItem label="Healthy" tone="healthy" />
      <LegendItem label="Needs attention" tone="warning" />
      <LegendItem label="Error" tone="error" />
    </div>
  );
}

function LegendItem({ label, tone }: { label: string; tone: RailStatusTone }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusDot tone={tone} />
      {label}
    </span>
  );
}

function RailStatusRow({ label, tone, value }: { label: string; tone: RailStatusTone; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg bg-slate-800 px-3 py-2 text-xs">
      <span className="text-sky-100/65">{label}</span>
      <span className="inline-flex min-w-0 max-w-[68%] flex-wrap items-center justify-end gap-1.5 text-right font-semibold leading-4 text-white">
        <StatusDot tone={tone} />
        <span className="break-words">{value}</span>
      </span>
    </div>
  );
}

function StatusDot({ tone }: { tone: RailStatusTone }) {
  return <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', tone === 'healthy' && 'bg-emerald-300', tone === 'warning' && 'bg-amber-300', tone === 'error' && 'bg-red-300', tone === 'info' && 'bg-cyan-300')} />;
}

function AttentionPanel({ issues }: { issues: RailAttentionIssue[] }) {
  if (!issues.length) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-3 py-2.5 text-xs text-emerald-100">
        <CheckCircle2 className="size-4 shrink-0" />
        No attention needed
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {issues.map((issue) => (
        <div className={cn('rounded-xl border px-3 py-2.5', issue.tone === 'error' ? 'border-red-300/30 bg-red-500/10' : issue.tone === 'warning' ? 'border-amber-300/30 bg-amber-400/10' : 'border-cyan-300/25 bg-cyan-300/10')} key={issue.id}>
          <div className="flex items-start gap-2">
            <StatusDot tone={issue.tone} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white">{issue.title}</p>
              <p className="mt-1 text-[11px] leading-4 text-sky-100/70">{issue.description}</p>
              {issue.action && (
                <DisabledAction disabled={issue.action.disabled} reason={issue.action.reason}>
                  <Button className="mt-2" disabled={issue.action.disabled} onClick={issue.action.onClick} size="sm" type="button" variant={issue.tone === 'error' ? 'destructive' : 'outline'}>
                    {issue.action.label}
                  </Button>
                </DisabledAction>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

type RailStatusTone = 'healthy' | 'warning' | 'error' | 'info';
type RailAttentionIssue = {
  action?: {
    disabled: boolean;
    label: string;
    onClick: () => void;
    reason: string;
  };
  description: string;
  id: string;
  title: string;
  tone: Exclude<RailStatusTone, 'healthy'>;
};

function buildAttentionIssues({ actions, item, loadingAction, onOpenRecovery }: { actions: ApplicationActionHandlers; item: ApplicationSurfaceItem; loadingAction: ApplicationRuntimeAction | null; onOpenRecovery: () => void }) {
  const issues: RailAttentionIssue[] = [];
  const actionDisabled = (action: ApplicationRuntimeAction) => runtimeActionDisabled(item, action, loadingAction);
  const disabledReason = (action: ApplicationRuntimeAction) => runtimeActionDisabledReason(item, action, loadingAction);

  if (item.operationState.kind === 'failed') {
    issues.push({
      action: { disabled: false, label: 'Open recovery', onClick: onOpenRecovery, reason: '' },
      description: item.operationState.message || 'Autark-OS could not finish the last operation.',
      id: 'operation-failed',
      title: item.operationState.label,
      tone: 'error',
    });
  } else if (item.operationState.kind !== 'idle') {
    issues.push({
      description: item.operationState.currentStep || 'Autark-OS is still working on this app.',
      id: 'operation-running',
      title: item.operationState.label,
      tone: 'info',
    });
  }

  if (item.attentionState !== 'none') {
    issues.push({
      description: item.userStatusDescription || 'Review this app before taking another action.',
      id: 'attention-state',
      title: labelForAttention(item.attentionState),
      tone: item.attentionState === 'conflict' || item.attentionState === 'blocked' ? 'error' : 'warning',
    });
  }

  if (item.nextAction) {
    const nextRuntimeAction: ApplicationRuntimeAction | null = item.nextAction.id === 'start_app'
      ? 'start'
      : item.nextAction.id === 'create_backup' ? 'backup' : null;
    const nextActionDisabled = nextRuntimeAction ? actionDisabled(nextRuntimeAction) : runtimeControlsDisabled(item.operationState, loadingAction);
    issues.push({
      action: {
        disabled: nextActionDisabled,
        label: nextActionDisabled && nextRuntimeAction ? 'Unavailable' : nextActionButtonLabel(item.nextAction.id),
        onClick: () => actions.onRunNextAction(item.id),
        reason: nextRuntimeAction ? disabledReason(nextRuntimeAction) : disabledReason('repair'),
      },
      description: item.nextAction.description,
      id: 'next-action',
      title: item.nextAction.label,
      tone: 'warning',
    });
  } else if (item.backup === 'Needs backup' && item.managementState === 'managed') {
    issues.push({
      action: { disabled: actionDisabled('backup'), label: 'Create backup', onClick: () => actions.onCreateBackup(item.id), reason: disabledReason('backup') },
      description: 'Create a verified restore point before relying on this app.',
      id: 'backup-needed',
      title: 'Backup needs attention',
      tone: 'warning',
    });
  }

  return issues;
}

function readinessTone(item: ApplicationSurfaceItem): RailStatusTone {
  if (item.readinessState === 'ready') return 'healthy';
  if (item.readinessState === 'starting') return 'info';
  if (item.readinessState === 'unreachable') return 'error';
  return 'warning';
}

function accessTone(item: ApplicationSurfaceItem): RailStatusTone {
  if (item.access === 'Open' || item.access === 'Private') return 'healthy';
  if (item.access === 'No link') return 'warning';
  return 'info';
}

function backupTone(item: ApplicationSurfaceItem): RailStatusTone {
  if (item.backup === 'Protected') return 'healthy';
  if (item.backup === 'Needs backup') return 'warning';
  return 'info';
}

function RailControls({ actions, item, loadingAction }: { actions: ApplicationActionHandlers; item: ApplicationSurfaceItem; loadingAction: ApplicationRuntimeAction | null }) {
  const primaryAction: ApplicationRuntimeAction = item.readinessState === 'paused' || item.readinessState === 'stopped' ? 'start' : 'stop';
  const actionDisabled = (action: ApplicationRuntimeAction) => runtimeActionDisabled(item, action, loadingAction);
  const disabledReason = (action: ApplicationRuntimeAction) => runtimeActionDisabledReason(item, action, loadingAction);
  const repairAction = item.availableActions.find((action) => action.id === 'repair');

  if (item.managementState !== 'managed') {
    return null;
  }

  return (
    <section className="grid gap-2 rounded-xl border border-sky-400/20 bg-slate-800 p-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-100/55">Controls</p>
      <div className="grid grid-cols-2 gap-2">
        <DisabledAction className="min-w-0" disabled={actionDisabled(primaryAction)} reason={disabledReason(primaryAction)}>
          <ApplicationDarkControlButton className="w-full min-w-0" disabled={actionDisabled(primaryAction)} onClick={() => primaryAction === 'start' ? actions.onStart(item.id) : actions.onStop(item.id)} size="sm" type="button">
            {loadingAction === 'start' || loadingAction === 'stop'
              ? <Loader2 className="animate-spin" data-icon="inline-start" />
              : item.readinessState === 'paused' || item.readinessState === 'stopped' ? <Play data-icon="inline-start" /> : <Pause data-icon="inline-start" />}
            {loadingAction === 'start' ? 'Starting' : loadingAction === 'stop' ? 'Pausing' : item.readinessState === 'paused' || item.readinessState === 'stopped' ? 'Start' : 'Pause'}
          </ApplicationDarkControlButton>
        </DisabledAction>
        <DisabledAction className="min-w-0" disabled={actionDisabled('restart')} reason={disabledReason('restart')}>
          <ApplicationDarkControlButton className="w-full min-w-0" disabled={actionDisabled('restart')} onClick={() => actions.onRestart(item.id)} size="sm" type="button">
            {loadingAction === 'restart' ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RotateCw data-icon="inline-start" />}
            {loadingAction === 'restart' ? 'Restarting' : 'Restart'}
          </ApplicationDarkControlButton>
        </DisabledAction>
        <DisabledAction className="min-w-0" disabled={actionDisabled('backup')} reason={disabledReason('backup')}>
          <ApplicationDarkControlButton className="w-full min-w-0" disabled={actionDisabled('backup')} onClick={() => actions.onCreateBackup(item.id)} size="sm" type="button">
            {loadingAction === 'backup' ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ShieldCheck data-icon="inline-start" />}
            {loadingAction === 'backup' ? 'Backing up' : 'Backup'}
          </ApplicationDarkControlButton>
        </DisabledAction>
        {repairAction && (
          <DisabledAction className="min-w-0" disabled={actionDisabled('repair')} reason={disabledReason('repair')}>
            <Button
              className="w-full min-w-0 border-orange-300/40 bg-slate-900 text-orange-100 hover:bg-slate-700 hover:text-orange-50"
              disabled={actionDisabled('repair')}
              onClick={() => actions.onRepair(item.id)}
              size="sm"
              title={repairAction.reason || undefined}
              type="button"
              variant="outline"
            >
              {loadingAction === 'repair' ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Wrench data-icon="inline-start" />}
              {loadingAction === 'repair' ? 'Repairing' : repairAction.label || 'Repair'}
            </Button>
          </DisabledAction>
        )}
      </div>
    </section>
  );
}

function nextActionButtonLabel(id: ApplicationNextAction['id']) {
  if (id === 'start_app') return 'Start';
  if (id === 'create_backup') return 'Create backup';
  return 'Review';
}

function RecentActivitySummary({ item }: { item: ApplicationSurfaceItem }) {
  const lastAction = item.lastEvent || operationStateText(item.operationState) || 'No recent app action reported.';
  const timestamp = item.runtime.recentEvents[0]?.createdAt || item.runtime.checkedAt;

  return (
    <div className="grid gap-1 rounded-lg border border-sky-400/20 bg-slate-800 px-3 py-2 text-sm">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sky-100/70">Last action</span>
        <span className="min-w-0 max-w-[68%] break-words text-right font-medium leading-4 text-white">{lastAction}</span>
      </div>
      <p className="text-xs text-sky-100/70">{timestamp ? formatRuntimeTimestamp(timestamp) : 'Autark-OS will show the latest app event here when one is reported.'}</p>
    </div>
  );
}

function operationStateText(operationState: ApplicationSurfaceItem['operationState']) {
  if (operationState.kind === 'idle') {
    return '';
  }
  if (operationState.kind === 'failed') {
    return operationState.message || operationState.label;
  }
  return operationState.currentStep || operationState.label;
}

function formatRuntimeTimestamp(value?: string) {
  if (!value) {
    return 'Not reported';
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp);
}
