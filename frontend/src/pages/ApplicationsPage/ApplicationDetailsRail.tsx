import { forwardRef, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Pause, Play, RotateCw, ShieldCheck, Wrench, X } from 'lucide-react';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ApplicationDarkControlButton, ApplicationPrimaryButton, ApplicationWarningButton } from './components/ApplicationButtons';
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

export const ApplicationDetailsRail = forwardRef<HTMLDivElement, ApplicationDetailsRailProps>(function ApplicationDetailsRail(
  { actions, actionLoadingByItemId, canCloseManagement, item, managementOpen, onManagementOpenChange, settingsLoadingByItemId },
  ref,
) {
  const [managementTab, setManagementTab] = useState('overview');

  useEffect(() => {
    setManagementTab(item?.operationState.kind === 'failed' ? 'recovery' : 'overview');
  }, [item?.id, item?.operationState.kind]);

  return (
    <Card
      className={cn(
        'relative z-30 h-fit w-full scroll-mt-5 justify-self-end overflow-hidden rounded-2xl border border-sky-400/30 bg-slate-900 text-slate-50 shadow-xl shadow-slate-950/30 ring-0 transition-[width,box-shadow] duration-300 ease-out lg:sticky lg:top-5 lg:w-[22rem]',
        managementOpen && 'shadow-2xl shadow-cyan-950/50 lg:w-[66rem] xl:w-[72rem]',
      )}
      onPointerDown={(event) => event.stopPropagation()}
      ref={ref}
    >
      <CardHeader>
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            {item && <ApplicationIcon item={item} size="md" />}
            <div className="min-w-0 flex-1">
              <CardTitle className="truncate text-white">{item?.name ?? 'Selected app'}</CardTitle>
              <CardDescription className="text-sky-100/70">{item?.description ?? 'Select an app or service to review details.'}</CardDescription>
            </div>
          </div>

          {item && (
            <Button
              className={cn(
                'border-sky-400/40 bg-slate-800 text-sky-50 hover:bg-slate-700 hover:text-white',
                managementOpen && 'border-cyan-300 bg-cyan-300 text-slate-950 hover:bg-cyan-200 hover:text-slate-950',
              )}
              onClick={() => {
                if (managementOpen && !canCloseManagement()) {
                  return;
                }
                onManagementOpenChange(!managementOpen);
              }}
              type="button"
              variant="outline"
            >
              {managementOpen ? <X data-icon="inline-start" /> : <Wrench data-icon="inline-start" />}
              {managementOpen ? 'Close details' : 'Manage app'}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="overflow-hidden">
        {item ? (
          <div
            className={cn(
              'grid transition-[grid-template-columns,gap] duration-300 ease-out',
              managementOpen
                ? 'grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_21rem]'
                : 'grid-cols-[0fr_minmax(0,1fr)] gap-0',
            )}
          >
            <div
              aria-hidden={!managementOpen}
              className={cn(
                'min-w-0 overflow-hidden transition-[max-height,opacity] duration-200',
                managementOpen ? 'max-h-[80rem] opacity-100 delay-100' : 'max-h-0 pointer-events-none opacity-0',
              )}
            >
              <div className="mb-3">
                <p className="text-sm font-semibold text-white">Management</p>
                <p className="text-xs text-sky-100/60">Focused controls, settings, links, and diagnostics for the selected item.</p>
              </div>
              <ApplicationManagementPanel
                actions={actions}
                item={item}
                onTabValueChange={setManagementTab}
                settingsLoadingAction={settingsLoadingByItemId[item.id] ?? null}
                tabValue={managementTab}
                variant="rail"
              />
            </div>

            <div className="min-w-0">
              <div className="flex flex-col gap-4">
                <ExpandedOperationStatus item={item} />
                {item.operationState.kind === 'failed' && (
                  <Button
                    className="justify-start bg-red-600 text-white shadow-lg shadow-red-950/30 hover:bg-red-500"
                    onClick={() => {
                      setManagementTab('recovery');
                      onManagementOpenChange(true);
                    }}
                    type="button"
                  >
                    <AlertTriangle data-icon="inline-start" />
                    Open recovery
                  </Button>
                )}
                <RailControls actions={actions} item={item} loadingAction={actionLoadingByItemId[item.id] ?? null} />

                <div className="grid gap-2 text-sm">
                  <InfoRow label="Type" value={labelForManagementState(item.managementState)} />
                  <InfoRow label="State" value={labelForReadiness(item.readinessState)} />
                  <InfoRow label="Attention" value={labelForAttention(item.attentionState)} />
                  <InfoRow label="Access" value={item.access} />
                  <InfoRow label="Backup" value={item.backup} />
                  {item.lastEvent && <InfoRow label="Last event" value={item.lastEvent} />}
                </div>
                <RecentActivitySummary item={item} />
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-sky-100/70">No item selected.</p>
        )}
      </CardContent>
    </Card>
  );
});

function RailControls({ actions, item, loadingAction }: { actions: ApplicationActionHandlers; item: ApplicationSurfaceItem; loadingAction: ApplicationRuntimeAction | null }) {
  const primaryAction: ApplicationRuntimeAction = item.readinessState === 'paused' || item.readinessState === 'stopped' ? 'start' : 'stop';
  const actionDisabled = (action: ApplicationRuntimeAction) => runtimeActionDisabled(item, action, loadingAction);
  const disabledReason = (action: ApplicationRuntimeAction) => runtimeActionDisabledReason(item, action, loadingAction);
  const nextRuntimeAction: ApplicationRuntimeAction | null = item.nextAction?.id === 'start_app'
    ? 'start'
    : item.nextAction?.id === 'create_backup' ? 'backup' : null;
  const nextActionDisabled = nextRuntimeAction ? actionDisabled(nextRuntimeAction) : runtimeControlsDisabled(item.operationState, loadingAction);
  const nextActionReason = nextRuntimeAction ? disabledReason(nextRuntimeAction) : disabledReason('repair');
  const repairAction = item.availableActions.find((action) => action.id === 'repair');

  return (
    <section className="grid gap-3 rounded-xl border border-sky-400/20 bg-slate-800 p-3">
      {item.href && (
        <ApplicationPrimaryButton asChild>
          <a href={item.href} rel="noreferrer" target="_blank">
            <ExternalLink data-icon="inline-start" />
            Open app
          </a>
        </ApplicationPrimaryButton>
      )}

      {item.nextAction ? (
        <div className="rounded-lg border border-orange-400 bg-orange-200 p-3 text-orange-950">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">{item.nextAction.label}</p>
              <p className="mt-1 text-xs leading-5">{item.nextAction.description}</p>
            </div>
            <DisabledAction disabled={nextActionDisabled} reason={nextActionReason}>
              <ApplicationWarningButton className="shadow-none" disabled={nextActionDisabled} onClick={() => actions.onRunNextAction(item.id)} size="sm" type="button">
                {loadingAction && nextRuntimeAction ? 'Running' : nextActionDisabled && nextRuntimeAction ? 'Unavailable' : nextActionButtonLabel(item.nextAction.id)}
              </ApplicationWarningButton>
            </DisabledAction>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-200 px-3 py-2 text-sm text-emerald-950">
          <CheckCircle2 data-icon="inline-start" />
          {item.managementState === 'managed' ? 'App fully functional' : 'No action needed'}
        </div>
      )}

      {item.managementState === 'managed' && (
        <div className="grid gap-2 sm:grid-cols-3">
          <DisabledAction disabled={actionDisabled(primaryAction)} reason={disabledReason(primaryAction)}>
            <ApplicationDarkControlButton disabled={actionDisabled(primaryAction)} onClick={() => primaryAction === 'start' ? actions.onStart(item.id) : actions.onStop(item.id)} type="button">
              {loadingAction === 'start' || loadingAction === 'stop'
                ? <Loader2 className="animate-spin" data-icon="inline-start" />
                : item.readinessState === 'paused' || item.readinessState === 'stopped' ? <Play data-icon="inline-start" /> : <Pause data-icon="inline-start" />}
              {loadingAction === 'start' ? 'Starting' : loadingAction === 'stop' ? 'Pausing' : item.readinessState === 'paused' || item.readinessState === 'stopped' ? 'Start' : 'Pause'}
            </ApplicationDarkControlButton>
          </DisabledAction>
          <DisabledAction disabled={actionDisabled('restart')} reason={disabledReason('restart')}>
            <ApplicationDarkControlButton disabled={actionDisabled('restart')} onClick={() => actions.onRestart(item.id)} type="button">
              {loadingAction === 'restart' ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RotateCw data-icon="inline-start" />}
              {loadingAction === 'restart' ? 'Restarting' : 'Restart'}
            </ApplicationDarkControlButton>
          </DisabledAction>
          <DisabledAction disabled={actionDisabled('backup')} reason={disabledReason('backup')}>
            <ApplicationDarkControlButton disabled={actionDisabled('backup')} onClick={() => actions.onCreateBackup(item.id)} type="button">
              {loadingAction === 'backup' ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ShieldCheck data-icon="inline-start" />}
              {loadingAction === 'backup' ? 'Backing up' : 'Backup'}
            </ApplicationDarkControlButton>
          </DisabledAction>
          {repairAction && (
            <DisabledAction disabled={actionDisabled('repair')} reason={disabledReason('repair')}>
              <Button
                className="border-orange-300/40 bg-slate-900 text-orange-100 hover:bg-slate-700 hover:text-orange-50"
                disabled={actionDisabled('repair')}
                onClick={() => actions.onRepair(item.id)}
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
      )}
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-slate-800 px-3 py-2">
      <span className="text-sky-100/70">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
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
      <div className="flex items-center justify-between gap-3">
        <span className="text-sky-100/70">Last action</span>
        <span className="min-w-0 truncate font-medium text-white">{lastAction}</span>
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
