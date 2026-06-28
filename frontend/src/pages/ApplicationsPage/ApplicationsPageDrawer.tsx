import { Link } from 'react-router-dom';
import {
  BadgeAlert,
  ChevronDown,
  ExternalLink,
  Play,
  RefreshCcw,
  ShieldCheck,
  Square,
} from 'lucide-react';
import { DisabledAction } from '@/components/project-os/DisabledAction';
import { JobProgress } from '@/components/project-os/JobProgress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { AppAccessCheck, AppHealthSnapshot, AppRuntimeView, AppTelemetry, AppUpdateStatus } from '@/types/app';
import type { ProjectOsJob } from '@/types/jobs';
import type { PrivateAccessReconciliationItem } from '@/types/network';
import { ActivityTimeline, AppIcon, Diagnostic, StatusBadge } from './ApplicationsPage.shared';
import { UninstallDialog } from './ApplicationsPageRemoveDialog';
import { appCardPrimaryUrl } from './extensions/ApplicationsPage.cardModel';
import {
  accessLabel,
  appNotice,
  displayStatus,
  formatTime,
  privateLinkLabel,
  statusReason,
  telemetryValue,
} from './extensions/ApplicationsPage.logic';
import { appRemediationDisplay, shouldShowRemediation } from './extensions/ApplicationsPage.remediation';
import type { AppAction } from './extensions/ApplicationsPage.types';

type AppManagementSheetProps = {
  access?: AppAccessCheck;
  actionLoading?: AppAction | 'update' | 'rollback' | null;
  app: AppRuntimeView | null;
  health?: AppHealthSnapshot | null;
  onAction: (appId: string, action: AppAction) => void;
  onOpenChange: (open: boolean) => void;
  onRollback: (appId: string) => void;
  onUninstall: (appId: string) => void;
  onUpdate: (appId: string) => void;
  open: boolean;
  reconciliation?: PrivateAccessReconciliationItem | null;
  showAdvanced: boolean;
  telemetry?: AppTelemetry | null;
  uninstallJob?: ProjectOsJob | null;
  update?: AppUpdateStatus | null;
};

export function AppManagementSheet({
  access,
  actionLoading = null,
  app,
  health,
  onAction,
  onOpenChange,
  onRollback,
  onUninstall,
  onUpdate,
  open,
  reconciliation,
  showAdvanced,
  telemetry,
  uninstallJob,
  update,
}: AppManagementSheetProps) {
  const status = app ? displayStatus(app, health) : 'Unknown';
  const busy = Boolean(actionLoading || uninstallJob);
  const uninstalling = Boolean(uninstallJob);
  const remediation = app ? appRemediationDisplay({ app, health }) : null;
  const notice = app ? appNotice(app, telemetry, access, health, reconciliation) : null;
  const openUrl = app ? appCardPrimaryUrl(app) : null;
  const repairSuggested = app ? status === 'Needs attention' || status === 'Unavailable' || shouldShowRemediation(remediation) : false;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full border-slate-700 bg-slate-950 p-0 text-slate-100 shadow-2xl sm:max-w-xl">
        {app ? (
          <>
            <SheetHeader className="border-b border-border p-4 pr-12">
              <div className="flex items-start gap-3">
                <AppIcon app={app} large />
                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate text-xl font-semibold">{app.appName}</SheetTitle>
                  <SheetDescription className="mt-1 line-clamp-2">{app.description || app.category}</SheetDescription>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <StatusBadge status={uninstalling ? 'Uninstalling' : status} />
                    <Badge variant="secondary">{appTypeLabel(app)}</Badge>
                  </div>
                </div>
              </div>
            </SheetHeader>

            <ScrollArea className="min-h-0 flex-1">
              <div className="grid gap-4 p-4">
                {uninstallJob && (
                  <JobProgress job={uninstallJob} subjectLabel={app.appName} />
                )}

                <section className={cn(
                  'rounded-lg border p-4',
                  remediation?.tone === 'critical' ? 'border-destructive/30 bg-destructive/10' : 'border-border bg-card'
                )}>
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 text-primary" data-icon="inline-start" />
                    <div className="min-w-0">
                      <h3 className="font-semibold">{uninstalling ? 'Uninstalling safely' : remediation?.label || 'Ready'}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {uninstalling
                          ? 'Project OS is removing this app safely. App data is kept unless you choose to delete it later.'
                          : notice || remediation?.summary || statusReason(app, telemetry, access, health, reconciliation)}
                      </p>
                    </div>
                  </div>
                </section>

                <section className="grid gap-2">
                  <h3 className="text-sm font-semibold">Actions</h3>
                  <div className="flex flex-wrap gap-2">
                    {openUrl ? (
                      <Button asChild disabled={uninstalling}>
                        <a href={openUrl} rel="noreferrer" target="_blank">
                          <ExternalLink data-icon="inline-start" />
                          {app.usageGuide?.openUrlLabel || 'Open'}
                        </a>
                      </Button>
                    ) : (
                      <DisabledAction disabled reason="This app does not have an openable link yet. Review Access for details.">
                        <Button disabled type="button">
                          <ExternalLink data-icon="inline-start" />
                          No link yet
                        </Button>
                      </DisabledAction>
                    )}
                    <DisabledAction disabled={busy} reason="Wait for the current app action to finish before changing runtime state.">
                      <Button disabled={busy} onClick={() => onAction(app.appId, status === 'Paused' ? 'start' : 'stop')} type="button" variant="outline">
                        {status === 'Paused' ? <Play data-icon="inline-start" /> : <Square data-icon="inline-start" />}
                        {status === 'Paused' ? 'Start' : 'Pause'}
                      </Button>
                    </DisabledAction>
                    <DisabledAction disabled={busy} reason="Wait for the current app action to finish before restarting.">
                      <Button disabled={busy} onClick={() => onAction(app.appId, 'restart')} type="button" variant="outline">
                        <RefreshCcw className={cn(actionLoading === 'restart' && 'animate-spin')} data-icon="inline-start" />
                        Restart
                      </Button>
                    </DisabledAction>
                    {repairSuggested && (
                      <DisabledAction disabled={busy} reason="Wait for the current app action to finish before repairing.">
                        <Button disabled={busy} onClick={() => onAction(app.appId, 'repair')} type="button" variant="outline">
                          <BadgeAlert data-icon="inline-start" />
                          Repair
                        </Button>
                      </DisabledAction>
                    )}
                    <Button asChild type="button" variant="outline">
                      <Link to="/backups">
                        <ShieldCheck data-icon="inline-start" />
                        Backups
                      </Link>
                    </Button>
                    <Button asChild type="button" variant="outline">
                      <Link to="/access">
                        <ExternalLink data-icon="inline-start" />
                        Access
                      </Link>
                    </Button>
                    {update?.updateAvailable && (
                      <DisabledAction disabled={busy} reason="Wait for the current app action to finish before updating.">
                        <Button disabled={busy} onClick={() => onUpdate(app.appId)} type="button" variant="outline">
                          <RefreshCcw className={cn(actionLoading === 'update' && 'animate-spin')} data-icon="inline-start" />
                          Update
                        </Button>
                      </DisabledAction>
                    )}
                    {update?.rollbackAvailable && (
                      <DisabledAction disabled={busy} reason="Wait for the current app action to finish before rolling back.">
                        <Button disabled={busy} onClick={() => onRollback(app.appId)} type="button" variant="outline">
                          <RefreshCcw className={cn(actionLoading === 'rollback' && 'animate-spin')} data-icon="inline-start" />
                          Roll back
                        </Button>
                      </DisabledAction>
                    )}
                    <UninstallDialog app={app} disabled={busy} onUninstall={onUninstall} />
                  </div>
                </section>

                <section className="grid gap-3">
                  <h3 className="text-sm font-semibold">Facts</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Fact label="Status" value={uninstalling ? 'Uninstalling safely' : status} />
                    <Fact label="Access" value={privateLinkLabel(app, reconciliation) || accessLabel(access)} />
                    <Fact label="Backup protection" value={app.lastBackup || 'Not configured'} />
                    <Fact label="Last repair" value={app.settings?.lastRepairStatus || 'No repair recorded'} />
                  </div>
                </section>

                {showAdvanced && (
                  <Collapsible className="rounded-lg border border-border bg-card">
                    <CollapsibleTrigger asChild>
                      <Button className="w-full justify-between rounded-b-none" type="button" variant="ghost">
                        Technical details
                        <ChevronDown data-icon="inline-end" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <Separator />
                      <div className="grid gap-4 p-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Diagnostic label="Compose project" value={app.composeProject} />
                          <Diagnostic label="Runtime path" value={app.runtimePath} />
                          <Diagnostic label="Health" value={health?.message || app.healthCheck} />
                          <Diagnostic label="Checked" value={formatTime(health?.checkedAt || telemetry?.checkedAt)} />
                          <Diagnostic label="CPU" value={telemetryValue(telemetry?.cpuPercent)} />
                          <Diagnostic label="Memory" value={telemetryValue(telemetry?.memoryUsage)} />
                        </div>
                        <ActivityTimeline events={app.recentEvents} />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            </ScrollArea>
          </>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>Manage app</SheetTitle>
              <SheetDescription>Select an app to manage it.</SheetDescription>
            </SheetHeader>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Fact({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{value || 'Not available'}</p>
    </div>
  );
}

function appTypeLabel(app: AppRuntimeView) {
  const kind = app.usageGuide?.kind;
  if (kind === 'companion-service') {
    return `${app.category} companion service`;
  }
  if (kind === 'admin-service') {
    return `${app.category} setup service`;
  }
  if (kind === 'background-service' || kind === 'infrastructure') {
    return `${app.category} service`;
  }
  return app.category;
}
