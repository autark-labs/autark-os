import { AlertTriangle, ListChecks, Play, Settings, Square, Wrench } from 'lucide-react';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { ApplicationActionHandlers, ApplicationSurfaceItem } from '../extensions/ApplicationsPage.types';
import { applicationActionRestriction } from '../extensions/ApplicationsPage.operations';

type ApplicationRecoveryTabProps = {
  actions: Pick<ApplicationActionHandlers, 'onRepair' | 'onStart' | 'onStop' | 'onRestart'>;
  item: ApplicationSurfaceItem;
  onEditSettings: () => void;
};

export function ApplicationRecoveryTab({ actions, item, onEditSettings }: ApplicationRecoveryTabProps) {
  if (item.operationState.kind !== 'failed') {
    return null;
  }

  const repairAction = item.availableActions.find((action) => action.id === 'repair');
  const start = applicationActionRestriction(item, 'start');
  const stop = applicationActionRestriction(item, 'stop');
  const settings = applicationActionRestriction(item, 'settings');
  const recovery = explainFailure(item.operationState.message);
  const recentEvents = item.runtime.recentEvents.slice(0, 4);
  const backupWarning = backupSafetyMessage(item);

  return (
    <section className="grid gap-4 rounded-xl border border-red-300/40 bg-red-950 p-4 text-red-50 shadow-inner shadow-red-950/40">
      <Alert className="border-red-300/40 bg-red-900 text-red-50">
        <AlertTriangle />
        <AlertTitle>Recovery needed</AlertTitle>
        <AlertDescription className="text-red-50/80">
          Autark-OS could not finish the last app action. Review the likely cause, then adjust settings or stop the app before trying again.
        </AlertDescription>
      </Alert>

      <div className="grid gap-2 rounded-lg border border-red-300/30 bg-red-900/70 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-100/70">Error</p>
        <p className="text-sm leading-6 text-white">{item.operationState.message}</p>
      </div>

      <div className="grid gap-2 rounded-lg border border-red-300/30 bg-red-900/70 p-3">
        <p className="text-sm font-semibold text-white">{recovery.title}</p>
        <p className="text-sm leading-6 text-red-50/80">{recovery.description}</p>
      </div>

      {backupWarning && (
        <Alert className="border-red-300/40 bg-red-900 text-red-50">
          <AlertTriangle />
          <AlertTitle>Backup status</AlertTitle>
          <AlertDescription className="text-red-50/80">{backupWarning}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {repairAction && (
          <DisabledAction disabled={Boolean(repairAction.disabled)} reason={repairAction.reason || 'Repair is not available for this app right now.'}>
            <Button className="bg-red-100 text-red-950 hover:bg-white" disabled={repairAction.disabled} onClick={() => actions.onRepair(item.id)} title={repairAction.reason || undefined} type="button">
              <Wrench data-icon="inline-start" />
              Run repair
            </Button>
          </DisabledAction>
        )}
        <DisabledAction disabled={start.disabled} reason={start.reason || 'Start is not available for this app right now.'}>
          <Button className="bg-red-100 text-red-950 hover:bg-white" disabled={start.disabled} onClick={() => actions.onStart(item.id)} type="button">
            <Play data-icon="inline-start" />
            Start again
          </Button>
        </DisabledAction>
        <DisabledAction disabled={stop.disabled} reason={stop.reason || 'Stop is not available for this app right now.'}>
          <Button className="border-red-200/40 bg-red-950 text-red-50 hover:bg-red-900" disabled={stop.disabled} onClick={() => actions.onStop(item.id)} type="button" variant="outline">
            <Square data-icon="inline-start" />
            Stop app
          </Button>
        </DisabledAction>
        <DisabledAction disabled={settings.disabled} reason={settings.reason || 'Settings are not available for this app right now.'}>
          <Button className="border-red-200/40 bg-red-950 text-red-50 hover:bg-red-900" disabled={settings.disabled} onClick={onEditSettings} type="button" variant="outline">
            <Settings data-icon="inline-start" />
            Edit settings
          </Button>
        </DisabledAction>
      </div>

      <div className="grid gap-2 rounded-lg border border-red-300/30 bg-red-900/70 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <ListChecks className="size-4" />
          Review recent activity
        </div>
        {recentEvents.length > 0 ? (
          <div className="grid gap-2">
            {recentEvents.map((event) => (
              <div key={event.id} className="grid gap-1 rounded-md bg-red-950/70 px-3 py-2">
                <p className="text-sm text-red-50">{event.message}</p>
                <p className="text-xs text-red-100/60">{formatRuntimeTimestamp(event.createdAt)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-red-50/75">No recent logs were reported for this app.</p>
        )}
      </div>
    </section>
  );
}

function backupSafetyMessage(item: ApplicationSurfaceItem) {
  if (item.backup === 'Protected') {
    return '';
  }
  if (item.backup === 'Not managed') {
    return 'Repair preserves data when possible, but backups are disabled for this app.';
  }
  return 'Repair preserves data when possible. Create a backup first if the app can safely run one.';
}

function explainFailure(message: string) {
  const lowerMessage = message.toLowerCase();
  const portMatch = message.match(/port\s+(?:0\.0\.0\.0:)?(\d+)/i) ?? message.match(/:(\d+)\/tcp/i);

  if (lowerMessage.includes('address already in use') || lowerMessage.includes('port is already in use')) {
    const portText = portMatch?.[1] ? ` ${portMatch[1]}` : '';
    return {
      title: `Port${portText} is already in use`,
      description: 'Another service is using the same local port. Change this app port in settings or stop the service using that port, then start the app again.',
    };
  }

  if (lowerMessage.includes('network') && lowerMessage.includes('external')) {
    return {
      title: 'Network ownership needs review',
      description: 'Docker found a network with the expected name that was not created for this app project. Review advanced details before retrying recovery.',
    };
  }

  if (lowerMessage.includes('ready') || lowerMessage.includes('reachable')) {
    return {
      title: 'App did not become reachable',
      description: 'The container command completed, but Autark-OS could not confirm the app endpoint is ready. Check settings and recent activity before retrying.',
    };
  }

  return {
    title: 'Last action failed',
    description: 'Use settings to correct app configuration, stop the app if it is stuck, or start it again after reviewing the recent activity.',
  };
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
