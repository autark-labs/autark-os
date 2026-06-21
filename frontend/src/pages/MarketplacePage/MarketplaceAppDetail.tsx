import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ArrowLeft, BookOpen, CheckCircle2, ChevronDown, ExternalLink, Loader2, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import type { DiscoverInstalledAppSummary, DiscoverInstallPreview, DiscoverSetupSchema } from '@/types/discover';
import type { HostInventoryResource } from '@/types/host';
import type { ProjectOsJob } from '@/types/jobs';
import type { InstallOptions, InstallPlan, InstallResult, MarketplaceApp } from '@/types/marketplace';
import { InstallWizard, TechnicalPlanCard } from './MarketplaceInstallWizard';
import { AppImage, InfoCard, Stat, SupportBadge } from './MarketplacePage.shared';
import { InstallPlanPreview, MarketplaceSetupPanel } from './MarketplaceSetupPanel';

type AppDetailProps = {
  app: MarketplaceApp;
  backupJob: ProjectOsJob | null;
  installJob: ProjectOsJob | null;
  installOptions: InstallOptions;
  installPlan: InstallPlan | null;
  installResult: InstallResult | null;
  installLocked: boolean;
  installStatusMessage: string;
  installing: boolean;
  installedApp: DiscoverInstalledAppSummary | null;
  installPreview: DiscoverInstallPreview | null;
  foundResource?: HostInventoryResource | null;
  onBack: () => void;
  onCreateBackup: (appId: string) => Promise<void>;
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

export function MarketplaceAppDetail({ app, backupJob, foundResource = null, installJob, installedApp, installLocked, installOptions, installPlan, installPreview, installResult, installStatusMessage, installing, onBack, onCreateBackup, onInstall, onReinstallCurrent, onRequestPlan, onSetupAnswersChange, planLoading, recoveryMode, setupAnswers, setupReady, setupSchema }: AppDetailProps) {
  const [conflictOpen, setConflictOpen] = useState(false);
  const [installReviewOpen, setInstallReviewOpen] = useState(false);
  const [technicalValidationOpen, setTechnicalValidationOpen] = useState(false);
  const isInstalled = Boolean(installedApp);
  const installBlockedByFoundResource = Boolean(foundResource && !isInstalled);
  const showFreshInstallResult = installResult?.appId === app.id && (installResult.status === 'installed' || installResult.status === 'already_installed');

  function openInstallReview() {
    if (installBlockedByFoundResource) {
      setConflictOpen(true);
      return;
    }
    setInstallReviewOpen(true);
    void onRequestPlan(installOptions);
  }

  return (
    <Card className="rounded-lg border-white/10 bg-slate-900/55 text-slate-100 shadow-po-panel">
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
              {isInstalled && <Badge className="border-emerald-300/25 bg-emerald-500/10 text-emerald-100" variant="outline">Installed</Badge>}
              {installBlockedByFoundResource && <Badge className="border-amber-300/25 bg-amber-500/10 text-amber-100" variant="outline">{foundResourceLabel(foundResource)}</Badge>}
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

        {requiresInstallCaution(app) && !isInstalled && (
          <section className="rounded-lg border border-amber-300/25 bg-amber-500/10 p-4">
            <div className="flex items-start gap-3">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-200" />
              <div>
                <h4 className="font-bold text-white">Review before installing</h4>
                <p className="mt-1 text-sm leading-6 text-amber-50/80">{app.supportSummary}</p>
              </div>
            </div>
          </section>
        )}

        <div className="flex flex-wrap gap-2">
          {app.tags.map((tag) => <Badge className="border-slate-700/40 bg-slate-950/50 text-slate-200" key={tag} variant="outline">{tag}</Badge>)}
        </div>

        <div className="flex flex-wrap gap-2">
          {isInstalled ? (
            <Button asChild className="bg-emerald-500 text-slate-950 hover:bg-emerald-400">
              <Link to="/apps">
                <CheckCircle2 className="size-4" />
                View in My Apps
              </Link>
            </Button>
          ) : (
            <Button className={poButtonClass('primary')} disabled={installing || installLocked} onClick={openInstallReview} type="button">
              {installing ? <Loader2 className="size-4 animate-spin" /> : installResult?.status === 'installed' ? <CheckCircle2 className="size-4" /> : null}
              {installing ? 'Installing...' : installLocked ? 'Install blocked' : installBlockedByFoundResource ? 'Resolve conflict' : !setupReady ? 'Finish setup' : installResult?.status === 'installed' ? 'Installed' : requiresInstallCaution(app) ? 'Review install' : 'Review install'}
            </Button>
          )}
          {!isInstalled && !installBlockedByFoundResource && <InstallWizard app={app} installLocked={installLocked || !setupReady} installOptions={installOptions} installPlan={installPlan} installPreview={installPreview} installResult={installResult} installStatusMessage={!setupReady ? 'Finish the required setup choices before installing.' : installStatusMessage} installing={installing} onInstall={onInstall} onOpenChange={setInstallReviewOpen} onRequestPlan={onRequestPlan} open={installReviewOpen} planLoading={planLoading} setupAnswers={setupAnswers} setupSchema={setupSchema} triggerLabel="Customize" />}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className={poButtonClass('quiet')} type="button" variant="outline">
                More
                <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 border-slate-700 bg-slate-950 text-slate-100">
              <DropdownMenuLabel>{isInstalled ? 'Installed app options' : 'Install options'}</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-slate-800" />
              <DropdownMenuItem className="focus:bg-slate-800 focus:text-white" onSelect={() => onRequestPlan(installOptions)}>
                Refresh install check
                <span className="ml-auto text-xs text-slate-500">{planLoading ? 'Checking' : 'Preview'}</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="focus:bg-slate-800 focus:text-white" onSelect={() => setTechnicalValidationOpen(true)}>
                Technical validation
                <span className="ml-auto text-xs text-slate-500">Advanced</span>
              </DropdownMenuItem>
              {isInstalled && (
                <>
                  <DropdownMenuSeparator className="bg-slate-800" />
                  <DropdownMenuItem className="focus:bg-slate-800 focus:text-white" disabled={installLocked || installing} onSelect={onReinstallCurrent}>
                    Reinstall with current settings
                    <span className="ml-auto text-xs text-amber-300">Advanced</span>
                  </DropdownMenuItem>
                </>
              )}
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
        </div>

        {installLocked && <InstallBlockedNotice message={installStatusMessage} />}
        {installBlockedByFoundResource && <FoundResourceNotice resource={foundResource} />}
        {foundResource && <FoundResourceConflictDialog appName={app.name} open={conflictOpen} resource={foundResource} onOpenChange={setConflictOpen} />}
        <TechnicalValidationDialog app={app} installPlan={installPlan} open={technicalValidationOpen} onOpenChange={setTechnicalValidationOpen} />
        {isInstalled && !showFreshInstallResult && <InstalledAppNotice app={installedApp} />}
        {isInstalled && recoveryMode && recoveryMode !== 'reset-reinstall' && (
          <RecoveryInstallNotice
            disabled={installLocked || installing}
            mode={recoveryMode}
            onReinstallCurrent={onReinstallCurrent}
          />
        )}
        {(installJob || backupJob || installing || installResult) && <InlineInstallStatus app={app} backupJob={backupJob} installedApp={installedApp} installing={installing} job={installJob} onCreateBackup={onCreateBackup} result={installResult} />}

        <section className="grid gap-4">
          <section className="rounded-lg border border-slate-700/30 bg-slate-950/30 p-4">
            <h4 className="font-bold text-white">About</h4>
            <p className="mt-2 text-sm leading-6 text-slate-300">{app.plainLanguage}</p>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <InfoCard title="Key features" items={app.highlights} />
            <InfoCard title="Best for" items={app.bestFor} />
          </div>

          <MarketplaceSetupPanel app={app} answers={setupAnswers} preview={installPreview} schema={setupSchema} onAnswersChange={onSetupAnswersChange} />
          <InstallPlanPreview preview={installPreview} />

          <section className="rounded-lg border border-slate-700/30 bg-slate-950/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Badge className="border-emerald-300/30 bg-emerald-400/10 text-emerald-200" variant="outline">
                  {serviceKindLabel(app.usage.kind)}
                </Badge>
                <h4 className="mt-3 font-bold text-white">{app.usage.headline}</h4>
              </div>
              <span className="rounded-full border border-slate-700/40 px-3 py-1 text-xs font-semibold text-slate-300">{app.usage.openUrlLabel}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-300">{app.usage.summary}</p>
            <div className="mt-4 grid gap-3 rounded-lg border border-slate-700/30 bg-slate-900/45 p-3 sm:grid-cols-3">
              <Stat label="Service type" value={serviceKindLabel(app.usage.kind)} />
              <Stat label="Ready state" value={app.health.successLabel} />
              <Stat label="Startup window" value={`${app.health.startupGraceSeconds}s`} />
              <p className="text-sm leading-6 text-slate-400 sm:col-span-3">{app.health.description}</p>
            </div>
            {app.usage.notes.length > 0 && <div className="mt-4"><InfoCard title="Good to know" items={app.usage.notes} /></div>}
          </section>
        </section>
      </CardContent>
    </Card>
  );
}

function FoundResourceNotice({ resource }: { resource: HostInventoryResource | null }) {
  if (!resource) {
    return null;
  }
  return (
    <section className="rounded-lg border border-amber-300/25 bg-amber-500/10 p-4 text-sm text-amber-100">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-200" />
        <div>
          <h4 className="font-bold text-white">{foundResourceLabel(resource)}</h4>
          <p className="mt-1 leading-6 text-amber-100/80">{resource.summary}</p>
          <Button asChild className="mt-3" size="sm" variant="outline">
            <Link to={`/apps/found?resource=${encodeURIComponent(resource.id)}`}>Resolve existing app</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function FoundResourceConflictDialog({
  appName,
  onOpenChange,
  open,
  resource,
}: {
  appName: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  resource: HostInventoryResource;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-700 bg-slate-950 text-slate-100 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{appName} already exists on this server</DialogTitle>
          <DialogDescription className="text-slate-400">
            Project OS found a matching resource before starting a new install. Resolve it first to avoid duplicate containers, duplicate ports, or split app data.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <div className="rounded-lg border border-amber-300/25 bg-amber-500/10 p-3 text-amber-100">
            <p className="m-0 font-bold text-white">{foundResourceLabel(resource)}</p>
            <p className="m-0 mt-1 leading-6 text-amber-100/80">{resource.summary}</p>
          </div>
          <div className="grid gap-2 rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <p className="m-0 font-semibold text-white">Recommended next step</p>
            <p className="m-0 text-slate-400">{conflictRecommendation(resource)}</p>
          </div>
        </div>
        <DialogFooter className="border-slate-800 bg-slate-900/60">
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">Cancel</Button>
          <Button asChild>
            <Link to={`/apps/found?resource=${encodeURIComponent(resource.id)}`}>Resolve existing app</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function foundResourceLabel(resource: HostInventoryResource | null) {
  if (!resource) return 'Found on server';
  if (resource.ownershipState === 'foreign_project_os') return 'Owned by another Project OS';
  if (resource.ownershipState === 'legacy_project_os') return 'Recoverable existing app';
  if (resource.ownershipState === 'unknown_conflict') return 'Blocked by server conflict';
  return 'Found on server';
}

function conflictRecommendation(resource: HostInventoryResource) {
  if (resource.ownershipState === 'legacy_project_os') {
    return 'Recover the existing app into this Project OS installation if it is the app you want to keep.';
  }
  if (resource.ownershipState === 'foreign_project_os') {
    return 'Review the cleanup plan before removing the old container. Data deletion stays separate.';
  }
  return 'Open the found resource, add it as a linked service, ignore the prompt, or stop it manually before installing a managed copy.';
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

function TechnicalValidationDialog({
  app,
  installPlan,
  onOpenChange,
  open,
}: {
  app: MarketplaceApp;
  installPlan: InstallPlan | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const checksPassed = app.smokeTests.filter((test) => test.status === 'Passed').length;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] overflow-y-auto border-slate-700 bg-slate-950 text-slate-100 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Technical validation for {app.name}</DialogTitle>
          <DialogDescription className="text-slate-400">
            Advanced details for install confidence and troubleshooting. Normal installs do not require reviewing this information.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <section className="rounded-lg border border-slate-700/30 bg-slate-900/45 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-white">Project OS checks</h4>
                <p className="mt-1 text-sm leading-6 text-slate-400">{checksPassed}/{app.smokeTests.length} checks are marked passed in the catalog.</p>
              </div>
              <Badge className={requiresInstallCaution(app) ? 'border-amber-300/25 bg-amber-500/10 text-amber-100' : 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100'} variant="outline">
                {requiresInstallCaution(app) ? 'Needs review' : 'Ready to install'}
              </Badge>
            </div>
          </section>
          <CatalogConfidenceCard app={app} />
          {installPlan ? <TechnicalPlanCard plan={installPlan} /> : (
            <section className="rounded-lg border border-slate-700/30 bg-slate-900/45 p-4 text-sm text-slate-400">
              Generate an install preview to see the technical plan for this app.
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InlineInstallStatus({
  app,
  backupJob,
  installedApp,
  installing,
  job,
  onCreateBackup,
  result,
}: {
  app: MarketplaceApp;
  backupJob: ProjectOsJob | null;
  installedApp: DiscoverInstalledAppSummary | null;
  installing: boolean;
  job: ProjectOsJob | null;
  onCreateBackup: (appId: string) => Promise<void>;
  result: InstallResult | null;
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
              {succeeded ? 'Open the app now, or create a first restore point before changing settings.' : failed ? job.error?.message || 'Project OS stopped before making this app available.' : currentJobStep(job)}
            </p>
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

  if (!result) {
    return null;
  }

  const installed = result.status === 'installed' || result.status === 'already_installed';
  return (
    <section className={installed ? 'rounded-lg border border-emerald-300/20 bg-emerald-500/10 p-4' : 'rounded-lg border border-red-300/20 bg-red-500/10 p-4'}>
      <div className="flex items-start gap-3">
        {installed ? <CheckCircle2 className="mt-0.5 size-5 text-emerald-200" /> : <TriangleAlert className="mt-0.5 size-5 text-red-200" />}
        <div className="min-w-0">
          <h4 className="font-bold text-white">{result.status === 'already_installed' ? 'Already installed' : installed ? 'Installed and ready' : 'Install needs attention'}</h4>
          <p className={installed ? 'mt-1 text-sm text-emerald-100/80' : 'mt-1 text-sm text-red-100/80'}>{result.message}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {installed && result.accessUrl && (
              <Button asChild className="bg-emerald-500 text-slate-950 hover:bg-emerald-400" size="sm">
                <a href={result.accessUrl} rel="noreferrer" target="_blank">Open app</a>
              </Button>
            )}
            <Button asChild className={poButtonClass('quiet')} size="sm" variant="outline">
              <Link to="/apps">View in My Apps</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
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

function terminalJob(job: ProjectOsJob) {
  return ['succeeded', 'failed', 'cancelled'].includes(job.status);
}

function currentJobStep(job: ProjectOsJob) {
  const step = job.steps.find((candidate) => candidate.id === job.currentStep) ?? job.steps.find((candidate) => candidate.status === 'running') ?? job.steps.find((candidate) => candidate.status === 'pending');
  return step?.message || step?.label || 'Project OS is working on this job.';
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
