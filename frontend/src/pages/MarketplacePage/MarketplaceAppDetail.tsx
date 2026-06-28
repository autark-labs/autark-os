import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ArrowLeft, BookOpen, CheckCircle2, ChevronDown, ExternalLink, Loader2, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { JobProgress } from '@/components/project-os/JobProgress';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { backupSafetyWarning } from '@/lib/backupSafety';
import { poButtonClass } from '@/lib/projectOsStyleKit';
import { cn } from '@/lib/utils';
import { currentJobStepText, terminalJob } from '@/repositories/jobRepository';
import type { DiscoverAppView, DiscoverInstalledAppSummary, DiscoverInstallPreview, DiscoverSetupSchema } from '@/types/discover';
import type { ProjectOsJob } from '@/types/jobs';
import type { InstallOptions, InstallPlan, MarketplaceApp } from '@/types/marketplace';
import { InstallWizard } from './MarketplaceInstallWizard';
import { AppImage, InfoCard, Stat, SupportBadge } from './MarketplacePage.shared';
import { DuplicateInstallWarningDialog } from './DuplicateInstallWarningDialog';

type AppDetailProps = {
  app: MarketplaceApp;
  appView: DiscoverAppView;
  backupJob: ProjectOsJob | null;
  installJob: ProjectOsJob | null;
  installOptions: InstallOptions;
  installPlan: InstallPlan | null;
  installLocked: boolean;
  installStatusMessage: string;
  installing: boolean;
  installedApp: DiscoverInstalledAppSummary | null;
  installPreview: DiscoverInstallPreview | null;
  onBack: () => void;
  onCreateBackup: (appId: string) => Promise<void>;
  onDuplicateInstallAcknowledged: () => void;
  onInstall: (options: InstallOptions) => Promise<void>;
  onReinstallCurrent: () => void | Promise<void>;
  onRequestPlan: (options: InstallOptions) => Promise<void>;
  onSetupAnswersChange: (answers: Record<string, unknown>) => void;
  planLoading: boolean;
  recoveryMode?: string | null;
  setupAnswers: Record<string, unknown>;
  setupReady: boolean;
  setupSchema: DiscoverSetupSchema;
};

export function MarketplaceAppDetail({ app, appView, backupJob, installJob, installedApp, installLocked, installOptions, installPlan, installPreview, installStatusMessage, installing, onBack, onCreateBackup, onDuplicateInstallAcknowledged, onInstall, onReinstallCurrent, onRequestPlan, onSetupAnswersChange, planLoading, recoveryMode, setupAnswers, setupReady, setupSchema }: AppDetailProps) {
  const [duplicateWarningOpen, setDuplicateWarningOpen] = useState(false);
  const [installReviewOpen, setInstallReviewOpen] = useState(false);
  const isInstalled = Boolean(installedApp);
  const needsExistingServiceReview = !isInstalled && appView.installCopyWarningRequired;

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

  return (
    <Card className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-lg border-white/10 bg-slate-900/55 text-slate-100 shadow-po-panel">
      <CardContent className="grid gap-5 p-5">
        <Button className={poButtonClass('quiet', 'w-fit')} onClick={onBack} type="button" variant="outline">
          <ArrowLeft className="size-4" />
          Back to apps
        </Button>

        <div className="grid gap-4 sm:grid-cols-[88px_minmax(0,1fr)]">
          <AppImage app={app} size="large" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="text-2xl font-bold text-white">{app.name}</h3>
              <Badge className={stateBadgeClass(appView.statusTone)} variant="outline">{appView.stateLabel}</Badge>
              <SupportBadge level={app.supportLevel} />
            </div>
            <p className="mt-2 text-sm text-slate-300">{app.description}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
              <span>{app.category}</span>
              <span>{app.difficulty}</span>
              <span>{app.installTime}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {app.tags.map((tag) => <Badge className="border-slate-700/40 bg-slate-950/50 text-slate-200" key={tag} variant="outline">{tag}</Badge>)}
        </div>

        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          {isInstalled ? (
            <Button asChild className="bg-emerald-500 text-slate-950 hover:bg-emerald-400">
              <Link to="/apps">
                <CheckCircle2 className="size-4" />
                View in My Apps
              </Link>
            </Button>
          ) : needsExistingServiceReview ? (
            <>
              {appView.reviewExistingHref ? (
                <Button asChild className="bg-amber-500 text-slate-950 hover:bg-amber-400">
                  <Link to={appView.reviewExistingHref}>
                    <TriangleAlert className="size-4" />
                    Review existing service
                  </Link>
                </Button>
              ) : (
                <Button className="bg-amber-500 text-slate-950" disabled type="button">
                  <TriangleAlert className="size-4" />
                  Review existing service
                </Button>
              )}
              <Button className={poButtonClass('quiet')} disabled={installing || installLocked || !setupReady} onClick={openDuplicateWarning} type="button" variant="outline">
                Install second copy
              </Button>
            </>
          ) : (
            <Button className={poButtonClass('primary')} disabled={installing || installLocked || !setupReady} onClick={openInstallReview} type="button">
              {installing ? <Loader2 className="size-4 animate-spin" /> : null}
              {installing ? 'Installing...' : installLocked ? 'Install blocked' : !setupReady ? 'Finish install choices' : 'Install'}
            </Button>
          )}
          <DocsSourceMenu app={app} />
          {!isInstalled && <InstallWizard app={app} hideTrigger installLocked={installLocked || !setupReady} installOptions={installOptions} installPlan={installPlan} installPreview={installPreview} installStatusMessage={!setupReady ? 'Finish the required install choices before installing.' : installStatusMessage} installing={installing} onInstall={onInstall} onOpenChange={setInstallReviewOpen} onRequestPlan={onRequestPlan} onSetupAnswersChange={onSetupAnswersChange} open={installReviewOpen} planLoading={planLoading} setupAnswers={setupAnswers} setupSchema={setupSchema} />}
        </div>

        {installLocked && <InstallBlockedNotice message={installStatusMessage} />}
        {needsExistingServiceReview && <ExistingServiceNotice appView={appView} />}
        {requiresInstallCaution(app) && !isInstalled && <InstallCautionNotice app={app} />}
        <DuplicateInstallWarningDialog appName={app.name} onInstallCopy={acknowledgeDuplicateInstall} onOpenChange={setDuplicateWarningOpen} open={duplicateWarningOpen} reviewHref={appView.reviewExistingHref} />
        {isInstalled && <InstalledAppNotice app={installedApp} />}
        {isInstalled && recoveryMode && recoveryMode !== 'reset-reinstall' && (
          <RecoveryInstallNotice
            disabled={installLocked || installing}
            mode={recoveryMode}
            onReinstallCurrent={onReinstallCurrent}
          />
        )}
        {(installJob || backupJob || installing) && <InlineInstallStatus app={app} backupJob={backupJob} installedApp={installedApp} installing={installing} job={installJob} onCreateBackup={onCreateBackup} />}

        <section className="rounded-lg border border-slate-700/30 bg-slate-950/30 p-4">
          <h4 className="font-bold text-white">About</h4>
          <p className="mt-2 text-sm leading-6 text-slate-300">{app.plainLanguage}</p>
        </section>

        <div className="grid gap-4">
          <InfoCard title="Key features" items={app.highlights} />
          <InfoCard title="Best for" items={app.bestFor} />
        </div>

        <section className="rounded-lg border border-slate-700/30 bg-slate-950/30 p-4">
          <h4 className="font-bold text-white">App details</h4>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Stat label="Version" value={app.version || 'Unavailable'} />
            <Stat label="Size" value={app.size || 'Unavailable'} />
            <Stat label="Last updated" value={app.lastUpdated || 'Unavailable'} />
            <Stat label="Source" value={app.source || 'Unavailable'} />
            <Stat label="Maintainer" value={app.maintainer || 'Unavailable'} />
            <Stat label="Downloads" value={app.downloads || 'Unavailable'} />
          </div>
        </section>

        <Collapsible className="rounded-lg border border-slate-700/30 bg-slate-950/30 p-4">
          <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between gap-3 text-left font-bold text-white">
            Advanced app info
            <ChevronDown className="size-4 text-slate-500" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-4 grid gap-4">
              {app.technicalSummary && <p className="text-sm leading-6 text-slate-300">{app.technicalSummary}</p>}
              {app.requirements.length > 0 && <InfoCard title="Requirements" items={app.requirements} />}
              {app.includes.length > 0 && <InfoCard title="Included services" items={app.includes} />}
              {app.usage.notes.length > 0 && <InfoCard title="Good to know" items={app.usage.notes} />}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

function DocsSourceMenu({ app }: { app: MarketplaceApp }) {
  return (
    <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className={poButtonClass('quiet')} type="button" variant="outline">
                Docs + source
                <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 border-slate-700 bg-slate-950 text-slate-100">
              <DropdownMenuLabel>{app.name}</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-slate-800" />
              {app.sourceUrl ? (
                <DropdownMenuItem asChild className="focus:bg-slate-800 focus:text-white">
                  <a href={app.sourceUrl} rel="noreferrer" target="_blank">
                    <ExternalLink className="mr-2 size-4" />
                    View source
                    <span className="ml-auto text-xs text-slate-500">{app.source}</span>
                  </a>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem className="focus:bg-slate-800 focus:text-white" disabled>
                  View source
                  <span className="ml-auto text-xs text-slate-500">Unavailable</span>
                </DropdownMenuItem>
              )}
              {app.documentationUrl ? (
                <DropdownMenuItem asChild className="focus:bg-slate-800 focus:text-white">
                  <a href={app.documentationUrl} rel="noreferrer" target="_blank">
                    <BookOpen className="mr-2 size-4" />
                    Read docs
                    <span className="ml-auto text-xs text-slate-500">External</span>
                  </a>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem className="focus:bg-slate-800 focus:text-white" disabled>
                  Read docs
                  <span className="ml-auto text-xs text-slate-500">Unavailable</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
  );
}

function InstallCautionNotice({ app }: { app: MarketplaceApp }) {
  return (
    <section className="rounded-lg border border-amber-300/25 bg-amber-500/10 p-4">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-200" />
        <div>
          <h4 className="font-bold text-white">Review before installing</h4>
          <p className="mt-1 text-sm leading-6 text-amber-50/80">{app.supportSummary}</p>
        </div>
      </div>
    </section>
  );
}

function ExistingServiceNotice({ appView }: { appView: DiscoverAppView }) {
  return (
    <section className="rounded-lg border border-amber-300/25 bg-amber-500/10 p-4 text-sm text-amber-100">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-200" />
        <div>
          <h4 className="font-bold text-white">{appView.stateLabel}</h4>
          <p className="mt-1 leading-6 text-amber-100/80">{appView.stateDescription}</p>
          <p className="mt-2 leading-6 text-amber-100/80">Project OS already sees this app on your system. Installing another copy can cause confusing behavior across your network, especially from phones, TVs, or other devices that discover services automatically. Pin or adopt the existing service when possible. Install a second copy only if you intentionally want two separate instances.</p>
          {appView.reviewExistingHref && (
            <Button asChild className="mt-3" size="sm" variant="outline">
              <Link to={appView.reviewExistingHref}>Review existing service</Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function stateBadgeClass(tone: string) {
  if (tone === 'success') return 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100';
  if (tone === 'warning') return 'border-amber-300/25 bg-amber-500/10 text-amber-100';
  if (tone === 'danger') return 'border-red-300/25 bg-red-500/10 text-red-100';
  if (tone === 'info') return 'border-sky-300/25 bg-sky-500/10 text-sky-100';
  if (tone === 'observed') return 'border-amber-300/25 bg-amber-500/10 text-amber-100';
  return 'border-slate-600 bg-slate-800/60 text-slate-300';
}

function InstallBlockedNotice({ message }: { message: string }) {
  return (
    <section className="rounded-lg border border-amber-300/25 bg-amber-500/10 p-4 text-sm text-amber-100">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-200" />
        <div>
          <h4 className="font-bold text-white">Another install is active</h4>
          <p className="mt-1 leading-6 text-amber-100/80">{message}</p>
        </div>
      </div>
    </section>
  );
}

function RecoveryInstallNotice({ disabled, mode: _mode, onReinstallCurrent }: { disabled: boolean; mode: string; onReinstallCurrent: () => void | Promise<void> }) {
  return (
    <section className="rounded-lg border border-amber-300/25 bg-amber-500/10 p-4">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-200" />
        <div className="min-w-0">
          <h4 className="font-bold text-white">Reinstall requested</h4>
          <p className="mt-1 text-sm leading-6 text-amber-100/80">
            {backupSafetyWarning('reinstall')}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild className={poButtonClass('quiet')} size="sm" type="button" variant="outline">
              <Link to="/backups">
                <Archive className="size-3.5" />
                Open Backups
              </Link>
            </Button>
            <Button className="bg-amber-500 text-slate-950 hover:bg-amber-400" disabled={disabled} onClick={onReinstallCurrent} size="sm" type="button">
              I backed up, reinstall
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function InstalledAppNotice({ app }: { app: DiscoverInstalledAppSummary | null }) {
  if (!app) {
    return null;
  }
  return (
    <section className="rounded-lg border border-emerald-300/20 bg-emerald-500/10 p-4">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 size-5 text-emerald-200" />
        <div className="min-w-0">
          <h4 className="font-bold text-white">Already installed</h4>
          <p className="mt-1 text-sm text-emerald-100/80">{app.appName} is already managed by Project OS. Use My Apps for day-to-day settings, repairs, and app status.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {app.accessUrl && (
              <Button asChild className="bg-emerald-500 text-slate-950 hover:bg-emerald-400" size="sm">
                <a href={app.accessUrl} rel="noreferrer" target="_blank">Open app</a>
              </Button>
            )}
            <Button asChild className={poButtonClass('quiet')} size="sm" variant="outline">
              <Link to="/apps">Manage in My Apps</Link>
            </Button>
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
  backupJob: ProjectOsJob | null;
  installedApp: DiscoverInstalledAppSummary | null;
  installing: boolean;
  job: ProjectOsJob | null;
  onCreateBackup: (appId: string) => Promise<void>;
}) {
  if (job) {
    const running = !terminalJob(job);
    const succeeded = job.status === 'succeeded';
    const failed = job.status === 'failed';
    return (
      <section className={cn('rounded-lg border p-4', succeeded ? 'border-emerald-300/20 bg-emerald-500/10' : failed ? 'border-red-300/20 bg-red-500/10' : 'border-violet-300/20 bg-violet-500/10')}>
        <div className="flex items-start gap-3">
          {running ? <Loader2 className="mt-0.5 size-5 animate-spin text-violet-200" /> : succeeded ? <CheckCircle2 className="mt-0.5 size-5 text-emerald-200" /> : <TriangleAlert className="mt-0.5 size-5 text-red-200" />}
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-white">{succeeded ? `${app.name} is ready` : failed ? `${app.name} did not finish installing` : `Installing ${app.name}`}</h4>
            <p className={cn('mt-1 text-sm', succeeded ? 'text-emerald-100/80' : failed ? 'text-red-100/80' : 'text-violet-100/75')}>
              {succeeded ? 'Open the app now, or create a first restore point before changing settings.' : failed ? job.error?.message || 'Project OS stopped before making this app available.' : currentJobStepText(job, 'Project OS is working on this job.')}
            </p>
            {running && <JobProgress className="mt-4" job={job} subjectLabel={app.name} />}
            <JobStepList job={job} />
            {succeeded && (
              <div className="mt-4 flex flex-wrap gap-2">
                {(installedApp?.accessUrl || app.accessUrl) && (
                  <Button asChild className="bg-emerald-500 text-slate-950 hover:bg-emerald-400" size="sm">
                    <a href={installedApp?.accessUrl || app.accessUrl} rel="noreferrer" target="_blank">Open {app.name}</a>
                  </Button>
                )}
                {installedApp && shouldOfferFirstBackup(installedApp) && (
                  <Button className={poButtonClass('quiet')} disabled={backupJob ? !terminalJob(backupJob) : false} onClick={() => onCreateBackup(installedApp.appId)} size="sm" type="button" variant="outline">
                    {backupJob && !terminalJob(backupJob) ? <Loader2 className="size-3.5 animate-spin" /> : <Archive className="size-3.5" />}
                    {backupJob?.status === 'succeeded' ? 'Backup created' : backupJob && !terminalJob(backupJob) ? 'Creating backup' : 'Create first backup'}
                  </Button>
                )}
                <Button asChild className={poButtonClass('quiet')} size="sm" variant="outline">
                  <Link to="/apps">View in My Apps</Link>
                </Button>
              </div>
            )}
            {failed && (
              <Collapsible className="mt-4 rounded-lg border border-red-300/20 bg-slate-950/35 p-3 text-sm text-red-100/80">
                <CollapsibleTrigger className="w-full cursor-pointer text-left font-semibold text-white">View details</CollapsibleTrigger>
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
      <section className="rounded-lg border border-violet-300/20 bg-violet-500/10 p-4">
        <div className="flex items-center gap-3">
          <Loader2 className="size-5 animate-spin text-violet-200" />
          <div>
            <h4 className="font-bold text-white">Installing with safe defaults</h4>
            <p className="mt-1 text-sm text-violet-100/75">Project OS is creating storage, choosing the saved access settings, and starting the app.</p>
          </div>
        </div>
      </section>
    );
  }

  return null;
}

function JobStepList({ job }: { job: ProjectOsJob }) {
  return (
    <div className="mt-4 grid gap-2">
      {job.steps.map((step) => (
        <div className="flex items-start gap-2 text-sm" key={step.id}>
          <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-[0.65rem] font-bold', step.status === 'succeeded' ? 'border-emerald-300/30 bg-emerald-500/15 text-emerald-100' : step.status === 'failed' ? 'border-red-300/30 bg-red-500/15 text-red-100' : step.status === 'running' ? 'border-violet-300/30 bg-violet-500/15 text-violet-100' : 'border-slate-700 bg-slate-950 text-slate-400')}>
            {step.status === 'succeeded' ? 'ok' : step.status === 'failed' ? '!' : step.status === 'running' ? '...' : ''}
          </span>
          <span>
            <span className="block font-semibold text-white">{step.label}</span>
            {step.message && <span className="block leading-5 text-slate-400">{step.message}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

function shouldOfferFirstBackup(_app: DiscoverInstalledAppSummary) {
  return true;
}

function CatalogConfidenceCard({ app }: { app: MarketplaceApp }) {
  return (
    <section className="rounded-lg border border-slate-700/30 bg-slate-950/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="font-bold text-white">Catalog confidence</h4>
          <p className="mt-1 text-sm leading-6 text-slate-400">{app.supportSummary}</p>
        </div>
        <SupportBadge level={app.supportLevel} />
      </div>
      <div className="mt-4 grid gap-2">
        {app.smokeTests.map((test) => (
          <div className="grid gap-2 rounded-lg border border-slate-800 bg-slate-900/45 p-3 sm:grid-cols-[minmax(160px,0.7fr)_minmax(140px,0.6fr)_1fr]" key={test.label}>
            <span className="font-semibold text-slate-200">{test.label}</span>
            <span className={cn('text-sm font-semibold', smokeStatusTone(test.status))}>{test.status}</span>
            <span className="text-sm leading-5 text-slate-400">{test.detail}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function smokeStatusTone(status: string) {
  switch (status) {
    case 'Passed':
      return 'text-emerald-300';
    case 'Blocked':
      return 'text-red-300';
    case 'Not applicable':
      return 'text-slate-400';
    default:
      return 'text-amber-300';
  }
}

function requiresInstallCaution(app: MarketplaceApp) {
  return ['Advanced', 'Needs testing', 'Experimental'].includes(app.supportLevel);
}

function serviceKindLabel(kind: string) {
  const labels: Record<string, string> = {
    'web-app': 'App you open',
    'companion-service': 'Service you connect to',
    'admin-service': 'Setup tool',
    'background-service': 'Background service',
    infrastructure: 'Infrastructure',
  };
  return labels[kind] || kind.replaceAll('-', ' ');
}
