import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, CheckCircle2, Clock3, Loader2, Settings2, TriangleAlert } from 'lucide-react';
import { MetadataBadge } from '@/components/autark-os/MetadataBadge';
import { StatusBadge } from '@/components/autark-os/StatusBadge';
import { Button } from '@/components/ui/button';
import { ProjectDarkControlButton, ProjectPrimaryButton, ProjectWarningButton } from '@/components/primitives/ProjectButtons';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { JobProgress } from '@/components/autark-os/JobProgress';
import { ResponsiveDetailsSheet } from '@/components/autark-os/ResponsiveDetailsSheet';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { backupSafetyWarning } from '@/lib/backupSafety';
import { cn } from '@/lib/utils';
import { currentJobStepText, queuedJobText, terminalJob } from '@/repositories/jobRepository';
import type { DiscoverAppView, DiscoverInstalledAppSummary, DiscoverInstallPreview, DiscoverSetupSchema } from '@/types/discover';
import type { AutarkOsJob } from '@/types/jobs';
import type { InstallOptions, InstallPlan, MarketplaceApp } from '@/types/marketplace';
import {
  applicationDeepLinkForManagedApp,
  applicationDeepLinkForObservedService,
  applicationRouteWithManagementPanel,
} from '../ApplicationsPage/extensions/ApplicationsPage.deepLinks';
import { InstallWizard } from './MarketplaceInstallWizard';
import { MarketplaceAppDetailsCard } from './MarketplaceAppInformation';
import { AppImage, marketplaceStatusTone, SupportBadge } from './MarketplacePage.shared';
import { DuplicateInstallWarningDialog } from './DuplicateInstallWarningDialog';

type AppDetailProps = {
  app: MarketplaceApp;
  appView: DiscoverAppView;
  backupJob: AutarkOsJob | null;
  installJob: AutarkOsJob | null;
  installOptions: InstallOptions;
  installPlan: InstallPlan | null;
  installLocked: boolean;
  installStatusMessage: string;
  installing: boolean;
  installedApp: DiscoverInstalledAppSummary | null;
  installPreview: DiscoverInstallPreview | null;
  hasAppSettings: boolean;
  onBack: () => void;
  onCreateBackup: (appId: string) => Promise<void>;
  onDuplicateInstallAcknowledged: () => void;
  onInstall: (options: InstallOptions) => Promise<void>;
  onOpenSettings: () => void;
  onReinstallCurrent: () => void | Promise<void>;
  onRequestPlan: (options: InstallOptions) => Promise<void>;
  recoveryMode?: string | null;
  setupAnswers: Record<string, unknown>;
  setupReady: boolean;
  setupSchema: DiscoverSetupSchema;
};

export function MarketplaceAppDetail({ app, appView, backupJob, hasAppSettings, installJob, installedApp, installLocked, installOptions, installPlan, installPreview, installStatusMessage, installing, onBack, onCreateBackup, onDuplicateInstallAcknowledged, onInstall, onOpenSettings, onReinstallCurrent, onRequestPlan, recoveryMode, setupAnswers, setupReady, setupSchema }: AppDetailProps) {
  const [duplicateWarningOpen, setDuplicateWarningOpen] = useState(false);
  const [installReviewOpen, setInstallReviewOpen] = useState(false);
  const isInstalled = Boolean(installedApp);
  const needsExistingServiceReview = !isInstalled && appView.installCopyWarningRequired;
  const installedAppHref = installedApp ? applicationDeepLinkForManagedApp(installedApp.appId) : '/apps';
  const manageInstalledAppHref = installedApp ? applicationDeepLinkForManagedApp(installedApp.appId, { panel: 'manage' }) : '/apps';
  const reviewExistingHref = appView.observedService
    ? applicationDeepLinkForObservedService(appView.observedService, { panel: 'manage' })
    : applicationRouteWithManagementPanel(appView.reviewExistingHref) ?? null;
  const installDisabled = installing || installLocked || !setupReady;
  const installDisabledReason = installing
    ? `${app.name} is already installing.`
    : installLocked
      ? installStatusMessage || 'Another install is active.'
      : 'Finish the required app settings before installing.';

  function openInstallReview() {
    setInstallReviewOpen(true);
    void onRequestPlan(installOptions);
  }

  function openDuplicateWarning() {
    setDuplicateWarningOpen(true);
  }

  function acknowledgeDuplicateInstall() {
    onDuplicateInstallAcknowledged();
    openInstallReview();
  }

  const content = (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="grid gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <AppImage app={app} size="large" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={marketplaceStatusTone(appView.statusTone)}>{appView.stateLabel}</StatusBadge>
              <SupportBadge level={app.supportLevel} />
            </div>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-300">{app.description}</p>
          </div>
        </div>

        <div className={cn('grid gap-2', hasAppSettings && 'sm:grid-cols-[minmax(0,1fr)_auto]')}>
          {isInstalled ? (
            <ProjectPrimaryButton asChild>
              <Link to={installedAppHref}>
                <CheckCircle2 className="size-4" />
                View in My Apps
              </Link>
            </ProjectPrimaryButton>
          ) : needsExistingServiceReview ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {reviewExistingHref && (
                <ProjectWarningButton asChild>
                  <Link to={reviewExistingHref}>
                    <TriangleAlert className="size-4" />
                    Review existing service
                  </Link>
                </ProjectWarningButton>
              )}
              <DisabledAction disabled={installDisabled} reason={installDisabledReason}>
                <ProjectDarkControlButton className="w-full" disabled={installDisabled} onClick={openDuplicateWarning} type="button">
                  Install second copy
                </ProjectDarkControlButton>
              </DisabledAction>
            </div>
          ) : (
            <DisabledAction disabled={installDisabled} reason={installDisabledReason}>
              <ProjectPrimaryButton className="w-full" disabled={installDisabled} onClick={openInstallReview} type="button">
                {installing ? <Loader2 className="size-4 animate-spin" /> : null}
                {installing ? 'Installing...' : installLocked ? 'Install blocked' : !setupReady ? 'Finish install choices' : 'Review install'}
              </ProjectPrimaryButton>
            </DisabledAction>
          )}
          {hasAppSettings && (
            <ProjectDarkControlButton onClick={onOpenSettings} type="button">
              <Settings2 className="size-4" />
              App settings
            </ProjectDarkControlButton>
          )}
          {!isInstalled && <InstallWizard app={app} hasAppSettings={hasAppSettings} hideTrigger installLocked={installLocked || !setupReady} installOptions={installOptions} installPlan={installPlan} installPreview={installPreview} installStatusMessage={!setupReady ? 'Finish the required app settings before installing.' : installStatusMessage} installing={installing} onInstall={onInstall} onOpenChange={setInstallReviewOpen} onOpenSettings={onOpenSettings} open={installReviewOpen} setupAnswers={setupAnswers} setupSchema={setupSchema} />}
        </div>
      </div>

      <Tabs className="min-h-0 flex-1" defaultValue="overview">
        <TabsList className="w-full justify-start overflow-x-auto rounded-lg border border-sky-300/15 bg-slate-950/25 p-1" variant="default">
          <TabsTrigger className="shrink-0 text-xs" value="overview">Overview</TabsTrigger>
          {!isInstalled && <TabsTrigger className="shrink-0 text-xs" value="install">Install</TabsTrigger>}
          <TabsTrigger className="shrink-0 text-xs" value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent className="mt-4 grid gap-3" value="overview">
          {installLocked && <InstallBlockedNotice message={installStatusMessage} />}
          {needsExistingServiceReview && <ExistingServiceNotice appView={appView} reviewHref={reviewExistingHref} />}
          {isInstalled && <InstalledAppNotice app={installedApp} manageHref={manageInstalledAppHref} />}
          {isInstalled && recoveryMode && recoveryMode !== 'reset-reinstall' && (
            <RecoveryInstallNotice
              disabled={installLocked || installing}
              mode={recoveryMode}
              onReinstallCurrent={onReinstallCurrent}
            />
          )}
          {(installJob || backupJob || installing) && <InlineInstallStatus app={app} backupJob={backupJob} installedApp={installedApp} installing={installing} job={installJob} onCreateBackup={onCreateBackup} />}
          <AppOverview app={app} />
        </TabsContent>

        {!isInstalled && (
          <TabsContent className="mt-4 grid gap-3" value="install">
            {requiresInstallCaution(app) && <InstallCautionNotice app={app} />}
            <InstallReadinessSummary app={app} hasAppSettings={hasAppSettings} />
          </TabsContent>
        )}

        <TabsContent className="mt-4" value="details">
          <MarketplaceAppDetailsCard app={app} />
        </TabsContent>
      </Tabs>

      <DuplicateInstallWarningDialog appName={app.name} onInstallCopy={acknowledgeDuplicateInstall} onOpenChange={setDuplicateWarningOpen} open={duplicateWarningOpen} reviewHref={reviewExistingHref} />
    </div>
  );

  return (
    <ResponsiveDetailsSheet
      className="border-sky-300/30 bg-app-overlay-panel sm:!max-w-xl lg:!max-w-[42rem]"
      headerAccessory={<StatusBadge tone={marketplaceStatusTone(appView.statusTone)}>{appView.stateLabel}</StatusBadge>}
      model={{ description: `${app.category} · ${app.installTime}`, title: app.name }}
      onOpenChange={(open) => !open && onBack()}
      open
    >
      {content}
    </ResponsiveDetailsSheet>
  );
}

function AppOverview({ app }: { app: MarketplaceApp }) {
  return (
    <>
      <section className="rounded-xl border border-sky-300/15 bg-slate-950/25 p-4">
        <h4 className="font-semibold text-slate-50">About</h4>
        <p className="mt-2 text-sm leading-6 text-slate-300">{app.plainLanguage}</p>
        {app.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {app.tags.map((tag) => <MetadataBadge key={tag}>{tag}</MetadataBadge>)}
          </div>
        )}
      </section>
      <div className="grid gap-3 sm:grid-cols-2">
        <AppFactList items={app.highlights} title="Key features" />
        <AppFactList items={app.bestFor} title="Best for" />
      </div>
    </>
  );
}

function AppFactList({ items, title }: { items: string[]; title: string }) {
  return (
    <section className="rounded-xl border border-sky-300/15 bg-slate-950/25 p-4">
      <h4 className="font-semibold text-slate-50">{title}</h4>
      <ul className="mt-2 grid gap-1.5 text-sm leading-5 text-slate-300">
        {items.map((item) => <li className="flex gap-2" key={item}><span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-cyan-300" />{item}</li>)}
      </ul>
    </section>
  );
}

function InstallReadinessSummary({ app, hasAppSettings }: { app: MarketplaceApp; hasAppSettings: boolean }) {
  return (
    <section className="rounded-xl border border-sky-300/15 bg-slate-950/25 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-slate-50">Install readiness</h4>
          <p className="mt-1 text-sm leading-5 text-slate-300">Review the final plan before Autark-OS changes this server.</p>
        </div>
        <span className="shrink-0 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-2 py-1 text-xs font-medium text-cyan-100">{hasAppSettings ? 'Configuration ready' : 'Safe defaults'}</span>
      </div>
      <dl className="mt-4 grid gap-2 text-sm">
        <DrawerDetail label="Typical install" value={app.installTime} />
        <DrawerDetail label="Ready when" value={app.health.successLabel} />
        <DrawerDetail label="Backup protection" value="Included by default" />
      </dl>
    </section>
  );
}

function DrawerDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-sky-300/10 pt-2 first:border-t-0 first:pt-0">
      <dt className="text-slate-400">{label}</dt>
      <dd className="max-w-[60%] truncate text-right font-medium text-slate-100" title={value}>{value}</dd>
    </div>
  );
}

function InstallCautionNotice({ app }: { app: MarketplaceApp }) {
  return (
    <section className="rounded-lg border border-orange-400/40 bg-orange-500/10 p-4">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-orange-200" />
        <div>
          <h4 className="font-bold text-slate-50">Review before installing</h4>
          <p className="mt-1 text-sm leading-6 text-slate-300">{app.supportSummary}</p>
        </div>
      </div>
    </section>
  );
}

function ExistingServiceNotice({ appView, reviewHref }: { appView: DiscoverAppView; reviewHref: string | null }) {
  return (
    <section className="rounded-lg border border-orange-400/40 bg-orange-500/10 p-4 text-sm text-orange-200">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-orange-200" />
        <div>
          <h4 className="font-bold text-current">{appView.stateLabel}</h4>
          <p className="mt-1 leading-6 text-current/80">{appView.stateDescription}</p>
          <p className="mt-2 leading-6 text-current/80">Review or adopt the existing service before creating another copy.</p>
          {reviewHref && (
            <Button asChild className="mt-3" size="sm" variant="outline">
              <Link to={reviewHref}>Review existing service</Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function InstallBlockedNotice({ message }: { message: string }) {
  return (
    <section className="rounded-lg border border-orange-400/40 bg-orange-500/10 p-4 text-sm text-orange-200">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-orange-200" />
        <div>
          <h4 className="font-bold text-current">Another install is active</h4>
          <p className="mt-1 leading-6 text-current/80">{message}</p>
        </div>
      </div>
    </section>
  );
}

function RecoveryInstallNotice({ disabled, mode: _mode, onReinstallCurrent }: { disabled: boolean; mode: string; onReinstallCurrent: () => void | Promise<void> }) {
  return (
    <section className="rounded-lg border border-orange-400/40 bg-orange-500/10 p-4">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-orange-200" />
        <div className="min-w-0">
          <h4 className="font-bold text-slate-50">Reinstall requested</h4>
          <p className="mt-1 text-sm leading-6 text-slate-300">
            {backupSafetyWarning('reinstall')}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ProjectDarkControlButton asChild size="sm" type="button">
              <Link to="/backups">
                <Archive className="size-3.5" />
                Open Backups
              </Link>
            </ProjectDarkControlButton>
            <DisabledAction disabled={disabled} reason="Wait for the active install or reinstall job to finish.">
              <ProjectWarningButton disabled={disabled} onClick={onReinstallCurrent} size="sm" type="button">
                I backed up, reinstall
              </ProjectWarningButton>
            </DisabledAction>
          </div>
        </div>
      </div>
    </section>
  );
}

function InstalledAppNotice({ app, manageHref }: { app: DiscoverInstalledAppSummary | null; manageHref: string }) {
  if (!app) {
    return null;
  }
  return (
    <section className="rounded-lg border border-emerald-300/35 bg-emerald-500/10 p-4">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 size-5 text-emerald-200" />
        <div className="min-w-0">
          <h4 className="font-bold text-slate-50">Already installed</h4>
          <p className="mt-1 text-sm text-slate-300">{app.appName} is already managed by Autark-OS. Use My Apps for day-to-day settings, repairs, and app status.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {app.accessUrl && (
              <ProjectPrimaryButton asChild size="sm">
                <a href={app.accessUrl} rel="noreferrer" target="_blank">Open app</a>
              </ProjectPrimaryButton>
            )}
            <ProjectDarkControlButton asChild size="sm">
              <Link to={manageHref}>Manage in My Apps</Link>
            </ProjectDarkControlButton>
          </div>
        </div>
      </div>
    </section>
  );
}

function InlineInstallStatus({
  app,
  backupJob,
  installedApp,
  installing,
  job,
  onCreateBackup,
}: {
  app: MarketplaceApp;
  backupJob: AutarkOsJob | null;
  installedApp: DiscoverInstalledAppSummary | null;
  installing: boolean;
  job: AutarkOsJob | null;
  onCreateBackup: (appId: string) => Promise<void>;
}) {
  if (job) {
    const active = !terminalJob(job);
    const queued = job.status === 'queued';
    const running = active && !queued;
    const succeeded = job.status === 'succeeded';
    const failed = job.status === 'failed';
    return (
      <section className={cn('rounded-lg border p-4', succeeded ? 'border-emerald-300/35 bg-emerald-500/10' : failed ? 'border-red-400/35 bg-red-500/10' : 'border-cyan-300/35 bg-cyan-400/10')}>
        <div className="flex items-start gap-3">
          {queued ? <Clock3 className="mt-0.5 size-5 text-cyan-200" /> : running ? <Loader2 className="mt-0.5 size-5 animate-spin text-cyan-200" /> : succeeded ? <CheckCircle2 className="mt-0.5 size-5 text-emerald-200" /> : <TriangleAlert className="mt-0.5 size-5 text-red-200" />}
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-slate-50">{succeeded ? `${app.name} is ready` : failed ? `${app.name} did not finish installing` : queued ? `${app.name} is waiting to install` : `Installing ${app.name}`}</h4>
            <p className={cn('mt-1 text-sm', succeeded ? 'text-emerald-200' : failed ? 'text-red-200' : 'text-cyan-200')}>
              {succeeded ? 'Open the app now, or create a first restore point before changing settings.' : failed ? job.error?.message || 'Autark-OS stopped before making this app available.' : queued ? queuedJobText(job, app.name) : currentJobStepText(job, 'Autark-OS is working on this job.')}
            </p>
            {active && <JobProgress className="mt-4" job={job} subjectLabel={app.name} />}
            <JobStepList job={job} />
            {succeeded && (
              <div className="mt-4 flex flex-wrap gap-2">
                {(installedApp?.accessUrl || app.accessUrl) && (
                  <ProjectPrimaryButton asChild size="sm">
                    <a href={installedApp?.accessUrl || app.accessUrl} rel="noreferrer" target="_blank">Open {app.name}</a>
                  </ProjectPrimaryButton>
                )}
                {installedApp && shouldOfferFirstBackup(installedApp) && (
                  <DisabledAction disabled={backupJob ? !terminalJob(backupJob) : false} reason="Autark-OS is already creating the first backup for this app.">
                    <ProjectDarkControlButton disabled={backupJob ? !terminalJob(backupJob) : false} onClick={() => onCreateBackup(installedApp.appId)} size="sm" type="button">
                      {backupJob && !terminalJob(backupJob) ? <Loader2 className="size-3.5 animate-spin" /> : <Archive className="size-3.5" />}
                      {backupJob?.status === 'succeeded' ? 'Backup created' : backupJob && !terminalJob(backupJob) ? 'Creating backup' : 'Create first backup'}
                    </ProjectDarkControlButton>
                  </DisabledAction>
                )}
                <ProjectDarkControlButton asChild size="sm">
                  <Link to={applicationDeepLinkForManagedApp(installedApp?.appId || app.id)}>View in My Apps</Link>
                </ProjectDarkControlButton>
              </div>
            )}
            {failed && (
              <Collapsible className="mt-4 rounded-lg border border-red-400/35 bg-slate-800 p-3 text-sm text-red-200">
                <CollapsibleTrigger className="w-full cursor-pointer text-left font-semibold text-slate-50">View details</CollapsibleTrigger>
                <CollapsibleContent>
                <div className="mt-2 grid gap-1">
                  {job.steps.map((step) => <p key={step.id}>{step.label}: {step.message || step.status}</p>)}
                </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        </div>
      </section>
    );
  }

  if (installing) {
    return (
      <section className="rounded-lg border border-cyan-300/35 bg-cyan-400/10 p-4">
        <div className="flex items-center gap-3">
          <Loader2 className="size-5 animate-spin text-cyan-200" />
          <div>
            <h4 className="font-bold text-slate-50">Installing with safe defaults</h4>
            <p className="mt-1 text-sm text-slate-300">Autark-OS is creating storage, choosing the saved access settings, and starting the app.</p>
          </div>
        </div>
      </section>
    );
  }

  return null;
}

function JobStepList({ job }: { job: AutarkOsJob }) {
  return (
    <div className="mt-4 grid gap-2">
      {job.steps.map((step) => (
        <div className="flex items-start gap-2 text-sm" key={step.id}>
          <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-[0.65rem] font-bold', step.status === 'succeeded' ? 'border-emerald-300/35 bg-emerald-500/10 text-emerald-200' : step.status === 'failed' ? 'border-red-400/35 bg-red-500/10 text-red-200' : step.status === 'warning' ? 'border-orange-400/35 bg-orange-500/10 text-orange-200' : step.status === 'running' ? 'border-cyan-300/35 bg-cyan-400/10 text-cyan-200' : 'border-sky-400/25 bg-slate-800 text-slate-400')}>
            {step.status === 'succeeded' ? 'ok' : step.status === 'failed' ? '!' : step.status === 'warning' ? '!' : step.status === 'running' ? '...' : ''}
          </span>
          <span>
            <span className="block font-semibold text-slate-50">{step.label}</span>
            {step.message && <span className="block leading-5 text-slate-400">{step.message}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

function shouldOfferFirstBackup(app: DiscoverInstalledAppSummary) {
  return app.firstBackupRecommended && !app.protectedByBackups;
}

function requiresInstallCaution(app: MarketplaceApp) {
  return ['Advanced', 'Needs testing', 'Experimental'].includes(app.supportLevel);
}
