import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Copy, ExternalLink } from 'lucide-react';
import { AppBrowserLink } from '@/components/autark-os/AppBrowserLink';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { LocalizedDateTime } from '@/components/autark-os/LocalizedDateTime';
import { ApplicationStateNotice } from '@/components/autark-os/ApplicationStateNotice';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { showActionNotification } from '@/lib/actionNotifications';
import { copyText } from '@/lib/copyText';
import { accessDeepLinkForManagedApp } from '@/pages/NetworkPage/extensions/NetworkPage.deepLinks';
import { ApplicationIcon } from './extensions/ApplicationVisuals';
import { DestructiveActionDialog } from './components/DestructiveActionDialog';
import { RuntimeBadge, labelForRelationship, labelForRuntimeState } from './components/AppStateBadges';
import { operationBlocksManagement, applicationActionRestriction, runtimeActionDisabled, runtimeActionDisabledReason } from './extensions/ApplicationsPage.operations';
import { ApplicationGuideTab } from './managementTabs/ApplicationGuideTab';
import { ApplicationLinksTab } from './managementTabs/ApplicationLinksTab';
import { ApplicationRecoveryTab } from './managementTabs/ApplicationRecoveryTab';
import { ApplicationSettingsTab } from './managementTabs/ApplicationSettingsTab';
import { ApplicationTelemetryTab } from './managementTabs/ApplicationTelemetryTab';
import type { ApplicationActionHandlers, ApplicationRuntimeAction, ApplicationSettingsAction, ApplicationSurfaceItem } from './extensions/ApplicationsPage.types';

type ApplicationManagementPanelProps = {
  actions: ApplicationActionHandlers;
  item: ApplicationSurfaceItem;
  loadingAction?: ApplicationRuntimeAction | null;
  settingsLoadingAction?: ApplicationSettingsAction | null;
  tabValue: string;
  onTabValueChange: (value: string) => void;
};

const managementTabs = ['overview', 'guide', 'settings', 'links', 'diagnostics'];

export function ApplicationManagementPanel({ actions, item, loadingAction = null, settingsLoadingAction = null, tabValue, onTabValueChange }: ApplicationManagementPanelProps) {
  const tab = ['advanced', 'telemetry'].includes(tabValue) ? 'diagnostics' : managementTabs.includes(tabValue) ? tabValue : 'overview';
  const [uninstallOpen, setUninstallOpen] = useState(false);
  const actionsTrigger = useRef<HTMLButtonElement>(null);
  const nextRuntimeAction = item.nextAction?.id === 'start_app' ? 'start' : item.nextAction?.id === 'create_backup' ? 'backup' : null;
  const nextActionDisabled = nextRuntimeAction ? runtimeActionDisabled(item, nextRuntimeAction, loadingAction) : false;
  const { onLoadUninstallPlan } = actions;
  const loadUninstallPlan = useCallback(() => onLoadUninstallPlan(item.id), [onLoadUninstallPlan, item.id]);
  const uninstallRestriction = applicationActionRestriction(item, 'uninstall');
  const uninstallReason = operationBlocksManagement(item.operation) || loadingAction
    ? 'Wait for the current app action to finish before uninstalling.'
    : uninstallRestriction.disabled ? uninstallRestriction.reason || 'Uninstall is unavailable for this app.' : '';
  const runtimeActions: [ApplicationRuntimeAction, string, (id: string) => void][] = [
    [item.state === 'stopped' ? 'start' : 'stop', item.state === 'stopped' ? 'Start app' : 'Pause app', item.state === 'stopped' ? actions.onStart : actions.onStop],
    ['restart', 'Restart app', actions.onRestart],
    ['backup', 'Create backup', actions.onCreateBackup],
    ['repair', 'Repair app', actions.onRepair],
  ];

  return (
    <>
      <header className="flex shrink-0 items-center gap-4 border-b border-border p-6 pr-12">
        <ApplicationIcon item={item} />
        <div className="min-w-0 flex-1">
          <DialogTitle className="truncate text-xl" title={item.name}>{item.name}</DialogTitle>
          <DialogDescription className="mt-2">Manage this app, its settings, and access.</DialogDescription>
        </div>
        <RuntimeBadge item={item} />
        {item.href ? <Button asChild><AppBrowserLink href={item.href} target="_blank" rel="noreferrer"><ExternalLink />Open app</AppBrowserLink></Button>
          : <DisabledAction disabled reason="No usable app link is available yet."><Button disabled>Open app</Button></DisabledAction>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button ref={actionsTrigger} variant="outline">App actions<ChevronDown /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            {runtimeActions.filter(([id]) => id !== 'repair' || item.availableActions.some((action) => action.id === 'repair')).map(([id, label, run]) => {
              const disabled = runtimeActionDisabled(item, id, loadingAction);
              return <DropdownMenuItem key={id} disabled={disabled} onSelect={() => run(item.id)} className="flex-col items-start">
                <span>{label}</span>
                {id === 'repair' && item.backup !== 'Protected' && <span className="text-xs text-muted-foreground">No verified backup. Create one first when the app can safely run one.</span>}
                {disabled && <span className="text-xs text-muted-foreground">{runtimeActionDisabledReason(item, id, loadingAction)}</span>}
              </DropdownMenuItem>;
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={Boolean(uninstallReason)} onSelect={() => setUninstallOpen(true)} className="flex-col items-start text-destructive">
              <span>Uninstall app</span>
              {uninstallReason && <span className="text-xs">{uninstallReason}</span>}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <Tabs className="min-h-0 flex-1 gap-0" value={tab} onValueChange={onTabValueChange}>
        <TabsList className="h-12 w-full shrink-0 justify-start rounded-none border-b border-border px-6" variant="line">
          {managementTabs.map((value) => <TabsTrigger key={value} className="flex-none px-4" value={value}>{value[0].toUpperCase() + value.slice(1)}</TabsTrigger>)}
        </TabsList>
        <TabsContent className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6" value="overview">
          <ApplicationStateNotice />
          {item.operation.kind === 'failed' ? <ApplicationRecoveryTab item={item} onEditSettings={() => onTabValueChange('settings')} onReviewManagement={() => setUninstallOpen(true)} /> : (
            <section className="space-y-2 rounded-xl border border-border bg-muted/30 p-5">
              <h3 className="font-semibold">{item.operation.kind !== 'idle' ? item.operation.label : item.issues[0]?.title || labelForRuntimeState(item.state)}</h3>
              <p className="text-sm text-muted-foreground">{item.operation.kind !== 'idle' ? item.operation.currentStep || 'Follow progress in Activity.' : item.issues[0]?.summary || item.description}</p>
              {item.nextAction && <DisabledAction disabled={nextActionDisabled} reason={nextRuntimeAction ? runtimeActionDisabledReason(item, nextRuntimeAction, loadingAction) : ''}>
                <Button disabled={nextActionDisabled} onClick={() => nextRuntimeAction === 'start' ? actions.onStart(item.id) : nextRuntimeAction === 'backup' ? actions.onCreateBackup(item.id) : onTabValueChange('diagnostics')} size="sm" variant="outline">{nextRuntimeAction ? item.nextAction.label : 'Review issue'}</Button>
              </DisabledAction>}
            </section>
          )}
          <dl className="divide-y divide-border">
            <div className="flex items-center gap-4 py-4"><dt className="w-20 text-muted-foreground">Access</dt><dd className="flex flex-1 items-center justify-between gap-4">{item.access}<Button asChild size="sm" variant="outline"><Link to={accessDeepLinkForManagedApp(item.sourceId || item.id)}>Review access</Link></Button></dd></div>
            <div className="flex items-center gap-4 py-4"><dt className="w-20 text-muted-foreground">Backups</dt><dd className="flex flex-1 items-center justify-between gap-4">{item.backup}<Button asChild size="sm" variant="outline"><Link to={`/backups?app=${encodeURIComponent(item.sourceId || item.id)}`}>Review backups</Link></Button></dd></div>
          </dl>
          <section className="space-y-2 text-sm"><h3 className="font-medium">Latest activity</h3><p className="text-muted-foreground">{item.lastEvent || item.runtime.recentEvents[0]?.message || 'No recent activity reported.'}</p></section>
        </TabsContent>
        <TabsContent className="min-h-0 flex-1 overflow-y-auto p-6" value="guide"><ApplicationGuideTab item={item} /></TabsContent>
        <TabsContent className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden" forceMount value="settings">
          <ApplicationSettingsTab actions={actions} item={item} loadingAction={settingsLoadingAction} />
        </TabsContent>
        <TabsContent className="min-h-0 flex-1 overflow-y-auto p-6" value="links"><ApplicationLinksTab item={item} /></TabsContent>
        <TabsContent className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6" value="diagnostics">
          <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => void copySupportDetails(item)}><Copy />Copy details</Button></div>
          <ApplicationTelemetryTab item={item} />
          {item.issues.map((issue) => <section key={issue.id} className="space-y-1"><h3 className="font-medium">{issue.title}</h3><p className="text-muted-foreground">{issue.summary}</p></section>)}
          <Accordion type="single" collapsible>
            <AccordionItem value="template"><AccordionTrigger>Container configuration</AccordionTrigger><AccordionContent className="space-y-2 break-all">
              <p>Image: {item.runtime.image || 'Not reported'}</p><p>Local port: {item.settings.expectedLocalPort || 'Not reported'}</p>
            </AccordionContent></AccordionItem>
            <AccordionItem value="events"><AccordionTrigger>Recent events</AccordionTrigger><AccordionContent className="space-y-3">
              {item.runtime.recentEvents.length ? item.runtime.recentEvents.slice(0, 5).map((event) => <div key={event.id}><p>{event.message}</p><LocalizedDateTime className="text-xs text-muted-foreground" model={{ value: event.createdAt }} /></div>) : <p>No recent events reported.</p>}
            </AccordionContent></AccordionItem>
          </Accordion>
        </TabsContent>
      </Tabs>
      {tab !== 'settings' && <footer className="shrink-0 border-t border-border px-6 py-4 text-xs text-muted-foreground">Changes and long-running actions are recorded in Activity.</footer>}
      {uninstallOpen && <DestructiveActionDialog onClose={() => setUninstallOpen(false)} onReturnFocus={() => actionsTrigger.current?.focus()} loadPlan={loadUninstallPlan} runAction={() => actions.onRunUninstall(item.id)} />}
    </>
  );
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
    `Type: ${labelForRelationship(item.relationship)}`,
    `Readiness: ${labelForRuntimeState(item.state)}`,
    `Issue: ${item.issues[0]?.title || 'None'}`,
    `Operation: ${operationText(item)}`,
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

function operationText(item: ApplicationSurfaceItem) {
  if (item.operation.kind === 'idle') {
    return 'Idle';
  }
  if (item.operation.kind === 'failed') {
    return item.operation.message || item.operation.label;
  }
  return item.operation.currentStep || item.operation.label;
}
