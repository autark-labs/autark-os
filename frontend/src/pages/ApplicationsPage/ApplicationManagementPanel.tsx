import type { ReactNode } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Copy } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { showActionNotification } from '@/lib/actionNotifications';
import { copyText } from '@/lib/copyText';
import { cn } from '@/lib/utils';
import { ApplicationDarkControlButton } from './components/ApplicationButtons';
import { DestructiveActionDialog } from './components/DestructiveActionDialog';
import { labelForAttention, labelForManagementState, labelForReadiness } from './components/AppStateBadges';
import { operationBlocksManagement } from './extensions/ApplicationsPage.operations';
import { ApplicationGuideTab } from './managementTabs/ApplicationGuideTab';
import { ApplicationLinksTab } from './managementTabs/ApplicationLinksTab';
import { ApplicationRecoveryTab } from './managementTabs/ApplicationRecoveryTab';
import { ApplicationSettingsTab } from './managementTabs/ApplicationSettingsTab';
import { ApplicationTelemetryTab } from './managementTabs/ApplicationTelemetryTab';
import { ObservedServiceCatalogMatchSection } from './managementTabs/ObservedServiceCatalogMatchSection';
import { ObservedServiceManagementSection } from './managementTabs/ObservedServiceManagementSection';
import type { ApplicationActionHandlers, ApplicationSettingsAction, ApplicationSurfaceItem } from './extensions/ApplicationsPage.types';

type ApplicationManagementPanelProps = {
  actions: Pick<
    ApplicationActionHandlers,
    | 'onAdoptObservedService'
    | 'onDirtyChange'
    | 'onLoadObservedServiceAdoptionPlan'
    | 'onLoadUninstallPlan'
    | 'onMatchObservedService'
    | 'onPinObservedService'
    | 'onRepair'
    | 'onRestart'
    | 'onRunUninstall'
    | 'onSaveSettings'
    | 'onSettingsPlanRequest'
    | 'onSetPrivateNetworkAccess'
    | 'onStart'
    | 'onStop'
    | 'onUnpinObservedService'
  >;
  item: ApplicationSurfaceItem;
  settingsLoadingAction?: ApplicationSettingsAction | null;
  tabValue?: string;
  onTabValueChange?: (value: string) => void;
  variant?: 'inline' | 'rail';
};

export function ApplicationManagementPanel({
  actions,
  item,
  onTabValueChange,
  settingsLoadingAction = null,
  tabValue,
  variant = 'inline',
}: ApplicationManagementPanelProps) {
  const managed = item.managementState === 'managed';
  const rail = variant === 'rail';
  const recentEvents = item.runtime.recentEvents.slice(0, 5);
  const recoveryNeeded = item.operationState.kind === 'failed';

  return (
    <section
      className={cn(
        'bg-slate-900 text-slate-50',
        rail
          ? 'min-h-full'
          : 'animate-in fade-in-0 slide-in-from-top-2 rounded-2xl border border-cyan-300/40 shadow-2xl shadow-cyan-950/40',
      )}
    >
      <Tabs className="gap-0" defaultValue="overview" onValueChange={onTabValueChange} value={tabValue}>
        <TabsList className={cn('w-full justify-start overflow-x-auto rounded-none border-b border-sky-400/20 bg-slate-900', rail ? 'px-2 py-1' : 'px-3 py-2')} variant="line">
          {recoveryNeeded && (
            <TabsTrigger className="bg-red-600 px-3 py-2 text-white data-active:bg-red-500 data-active:text-white" value="recovery">
              Recovery
            </TabsTrigger>
          )}
          <ManagementTabTrigger value="overview">Overview</ManagementTabTrigger>
          <ManagementTabTrigger value="guide">Guide</ManagementTabTrigger>
          <ManagementTabTrigger value="settings">Settings</ManagementTabTrigger>
          <ManagementTabTrigger value="telemetry">Telemetry</ManagementTabTrigger>
          <ManagementTabTrigger value="links">Links</ManagementTabTrigger>
          <ManagementTabTrigger value="advanced">Advanced</ManagementTabTrigger>
        </TabsList>

        <div className={rail ? 'p-3' : 'p-4'}>
          {recoveryNeeded && (
            <TabsContent className="grid gap-4" value="recovery">
              <ApplicationRecoveryTab
                actions={actions}
                item={item}
                onEditSettings={() => onTabValueChange?.('settings')}
              />
            </TabsContent>
          )}

          <TabsContent className="grid gap-4" value="overview">
            <section className="grid gap-2 sm:grid-cols-2">
              <Detail label="State" value={labelForReadiness(item.readinessState)} />
              <Detail label="Attention" value={labelForAttention(item.attentionState)} />
              <Detail label="Container" value={item.settings.containerStatus || item.runtime.health?.dockerStatus || 'Not reported'} />
              <Detail label="Policy" value={managed ? 'Plan before apply' : 'Read only'} />
            </section>

            <ObservedServiceManagementSection actions={actions} item={item} />

            <DangerZone actions={actions} item={item} managed={managed} />
          </TabsContent>

          <TabsContent className="grid gap-4" value="guide">
            <ApplicationGuideTab item={item} />
          </TabsContent>

          <TabsContent className="grid gap-4" value="settings">
            <ApplicationSettingsTab actions={actions} item={item} loadingAction={settingsLoadingAction} />
          </TabsContent>

          <TabsContent className="grid gap-4" value="telemetry">
            <ApplicationTelemetryTab item={item} />
          </TabsContent>

          <TabsContent className="grid gap-4" value="links">
            <ApplicationLinksTab item={item} />
          </TabsContent>

          <TabsContent className="grid gap-4" value="advanced">
            <ObservedServiceCatalogMatchSection actions={actions} item={item} />
            <section className="flex flex-col gap-3 rounded-xl border border-sky-400/20 bg-slate-800 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Support details</p>
                <p className="text-xs leading-5 text-sky-100/60">Copy the compact app state, runtime path, access links, and last event for troubleshooting.</p>
              </div>
              <ApplicationDarkControlButton className="w-fit" onClick={() => copySupportDetails(item)} size="sm" type="button">
                <Copy data-icon="inline-start" />
                Copy details
              </ApplicationDarkControlButton>
            </section>
            <Accordion className="rounded-xl border border-sky-400/20 bg-slate-800 px-3" collapsible defaultValue="runtime" type="single">
              <AccordionItem value="runtime">
                <AccordionTrigger className="text-sky-50">Runtime details</AccordionTrigger>
                <AccordionContent className="grid gap-2">
                  <Detail label="Compose project" value={item.runtime.composeProject || 'Not reported'} />
                  <Detail label="Runtime path" value={item.runtime.runtimePath || 'Not reported'} />
                  <Detail label="Version" value={item.runtime.version || 'Not reported'} />
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="template">
                <AccordionTrigger className="text-sky-50">Template values</AccordionTrigger>
                <AccordionContent className="grid gap-2 sm:grid-cols-2">
                  <Detail label="Image" value={item.runtime.image || 'Not reported'} />
                  <Detail label="Category" value={labelForManagementState(item.managementState)} />
                  <Detail label="Port" value={formatPort(item.settings.expectedLocalPort)} />
                  <Detail label="Policy" value={managed ? 'Plan before apply' : 'Read only'} />
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="events">
                <AccordionTrigger className="text-sky-50">Recent events</AccordionTrigger>
                <AccordionContent className="grid gap-2">
                  {recentEvents.length > 0 ? recentEvents.map((event) => (
                    <ActivityRow key={event.id} label={event.message} value={formatRuntimeTimestamp(event.createdAt)} />
                  )) : (
                    <EmptyActivity item={item} />
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </TabsContent>
        </div>
      </Tabs>
    </section>
  );
}

function ManagementTabTrigger({ children, value }: { children: ReactNode; value: string }) {
  return (
    <TabsTrigger className="px-3 py-2 text-sky-100/60 data-active:text-white" value={value}>
      {children}
    </TabsTrigger>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-900 px-3 py-2">
      <p className="text-xs font-medium text-sky-100/60">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function DangerZone({
  actions,
  item,
  managed,
}: {
  actions: Pick<ApplicationActionHandlers, 'onLoadUninstallPlan' | 'onRunUninstall'>;
  item: ApplicationSurfaceItem;
  managed: boolean;
}) {
  const uninstallBlockedByOperation = operationBlocksManagement(item.operationState);
  const uninstallDisabledReason = !managed
    ? 'Only managed apps can be uninstalled from Autark-OS.'
    : uninstallBlockedByOperation
      ? 'Wait for the current app action to finish before uninstalling.'
      : null;

  return (
    <section className="rounded-xl border border-red-400/25 bg-red-500/10 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-red-100">Uninstall</p>
          <p className="text-xs text-red-100/70">{managed ? 'Data is preserved by default.' : 'Observed services are not managed.'}</p>
          {backupSafetyMessage(item) && (
            <p className="mt-1 text-xs leading-5 text-red-100/80">{backupSafetyMessage(item)}</p>
          )}
        </div>
        {uninstallDisabledReason ? (
          <DestructiveActionDialog
            className="border-red-300/30 bg-slate-900 text-red-100 hover:bg-red-950"
            disabledReason={uninstallDisabledReason}
            triggerLabel="Review"
          />
        ) : (
          <DestructiveActionDialog
            className="border-red-300/30 bg-slate-900 text-red-100 hover:bg-red-950"
            loadPlan={() => actions.onLoadUninstallPlan(item.id)}
            runAction={() => actions.onRunUninstall(item.id)}
            triggerLabel="Review"
          />
        )}
      </div>
    </section>
  );
}

function backupSafetyMessage(item: ApplicationSurfaceItem) {
  if (item.managementState !== 'managed' || item.backup === 'Protected') {
    return '';
  }
  if (item.backup === 'Not managed') {
    return 'Backups are disabled for this app. Review settings before relying on restore points.';
  }
  return 'No verified backup is available yet. Create a backup before uninstalling when the app can safely run one.';
}

function ActivityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-sky-400/20 bg-slate-900 px-3 py-2">
      <span className="min-w-0 truncate text-sm text-sky-50">{label}</span>
      <span className="shrink-0 text-xs text-sky-100/60">{value}</span>
    </div>
  );
}

function EmptyActivity({ item }: { item: ApplicationSurfaceItem }) {
  return (
    <div className="rounded-lg border border-sky-400/20 bg-slate-900 px-3 py-2">
      <p className="text-sm font-medium text-sky-50">{item.lastEvent || 'No recent events reported'}</p>
      <p className="mt-1 text-xs text-sky-100/60">
        {item.runtime.checkedAt ? `Last checked ${formatRuntimeTimestamp(item.runtime.checkedAt)}` : 'Autark-OS has not reported activity for this item.'}
      </p>
    </div>
  );
}

function formatPort(value: number | null) {
  return value ? String(value) : 'Not reported';
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

async function copySupportDetails(item: ApplicationSurfaceItem) {
  const result = await copyText(supportDetailsText(item));
  if (!result.ok) {
    showActionNotification({ ok: false, severity: 'warning', title: 'Copy unavailable', message: result.message }, 'Copy unavailable');
    return;
  }
  showActionNotification({ ok: true, severity: 'success', title: 'Support details copied', message: 'App details are ready to share.' }, 'Support details copied');
}

function supportDetailsText(item: ApplicationSurfaceItem) {
  return [
    `App ID: ${item.sourceId || item.id}`,
    `Name: ${item.name}`,
    `Type: ${labelForManagementState(item.managementState)}`,
    `Readiness: ${labelForReadiness(item.readinessState)}`,
    `Attention: ${labelForAttention(item.attentionState)}`,
    `Operation: ${operationStateText(item)}`,
    `Access: ${item.access}`,
    `Backup: ${item.backup}`,
    `Primary URL: ${item.links.primaryUrl || 'Not configured'}`,
    `Private URL: ${item.links.privateUrl || 'Not configured'}`,
    `Local URL: ${item.links.localUrl || 'Not configured'}`,
    `Compose project: ${item.runtime.composeProject || 'Not reported'}`,
    `Runtime path: ${item.runtime.runtimePath || 'Not reported'}`,
    `Container status: ${item.settings.containerStatus || item.runtime.health?.dockerStatus || 'Not reported'}`,
    `Last event: ${item.lastEvent || item.runtime.recentEvents[0]?.message || 'No recent event reported'}`,
  ].join('\n');
}

function operationStateText(item: ApplicationSurfaceItem) {
  if (item.operationState.kind === 'idle') {
    return 'Idle';
  }
  if (item.operationState.kind === 'failed') {
    return item.operationState.message || item.operationState.label;
  }
  return item.operationState.currentStep || item.operationState.label;
}
