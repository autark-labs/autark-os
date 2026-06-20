import type { Dispatch, SetStateAction } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ArrowLeft, BookOpen, CheckCircle2, ChevronDown, ExternalLink, Loader2, Star, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { AppRuntimeView } from '@/types/app';
import type { InstallOptions, InstallPlan, InstallResult, MarketplaceApp } from '@/types/marketplace';
import { InstallWizard, TechnicalPlanCard } from './MarketplaceInstallWizard';
import { AppImage, Config, InfoCard, Stat, SupportBadge, VerifiedBadge } from './MarketplacePage.shared';

type AppDetailProps = {
  app: MarketplaceApp;
  installOptions: InstallOptions;
  installPlan: InstallPlan | null;
  installResult: InstallResult | null;
  installLocked: boolean;
  installStatusMessage: string;
  installing: boolean;
  installedApp: AppRuntimeView | null;
  onBack: () => void;
  onInstall: (options: InstallOptions) => Promise<void>;
  onOptionsChange: Dispatch<SetStateAction<InstallOptions | null>>;
  onReinstallCurrent: () => void | Promise<void>;
  onRequestPlan: (options: InstallOptions) => Promise<void>;
  onResetReinstall: () => void | Promise<void>;
  planLoading: boolean;
  recoveryMode?: string | null;
};

export function MarketplaceAppDetail({ app, installedApp, installLocked, installOptions, installPlan, installResult, installStatusMessage, installing, onBack, onInstall, onOptionsChange, onReinstallCurrent, onRequestPlan, onResetReinstall, planLoading, recoveryMode }: AppDetailProps) {
  const isInstalled = Boolean(installedApp);
  const showFreshInstallResult = installResult?.appId === app.id && (installResult.status === 'installed' || installResult.status === 'already_installed');
  return (
    <Card className="rounded-lg border-white/10 bg-slate-900/55 text-slate-100 shadow-po-panel">
      <CardContent className="grid gap-5 p-5">
        <Button className="w-fit border-slate-700/50 bg-slate-950/50 text-slate-200 hover:bg-slate-800" onClick={onBack} type="button" variant="outline">
          <ArrowLeft className="size-4" />
          Back to apps
        </Button>

        <div className="grid gap-4 sm:grid-cols-[88px_minmax(0,1fr)]">
          <AppImage app={app} size="large" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="text-2xl font-bold text-white">{app.name}</h3>
              {isInstalled && <Badge className="border-emerald-300/25 bg-emerald-500/10 text-emerald-100" variant="outline">Installed</Badge>}
              <SupportBadge level={app.supportLevel} />
              <VerifiedBadge label={app.badge} />
            </div>
            <p className="mt-2 text-sm text-slate-300">{app.description}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1">
                <Star className="size-3 fill-yellow-300 text-yellow-300" />
                {app.rating} rating
              </span>
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
              <Link to="/applications">
                <CheckCircle2 className="size-4" />
                View in Applications
              </Link>
            </Button>
          ) : (
            <Button className="bg-gradient-to-br from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500" disabled={installing || installLocked} onClick={() => onInstall(installOptions)} type="button">
              {installing ? <Loader2 className="size-4 animate-spin" /> : installResult?.status === 'installed' ? <CheckCircle2 className="size-4" /> : null}
              {installing ? 'Installing...' : installLocked ? 'Install blocked' : installResult?.status === 'installed' ? 'Installed' : requiresInstallCaution(app) ? 'Install after review' : 'Install'}
            </Button>
          )}
          {!isInstalled && <InstallWizard app={app} installLocked={installLocked} installOptions={installOptions} installPlan={installPlan} installResult={installResult} installStatusMessage={installStatusMessage} installing={installing} onInstall={onInstall} onOptionsChange={onOptionsChange} onRequestPlan={onRequestPlan} planLoading={planLoading} />}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="border-slate-700/50 bg-slate-950/50 text-slate-200 hover:bg-slate-800" type="button" variant="outline">
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
              {isInstalled && (
                <>
                  <DropdownMenuSeparator className="bg-slate-800" />
                  <DropdownMenuItem className="focus:bg-slate-800 focus:text-white" disabled={installLocked || installing} onSelect={onReinstallCurrent}>
                    Reinstall with current settings
                    <span className="ml-auto text-xs text-amber-300">Advanced</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="focus:bg-slate-800 focus:text-white" disabled={installLocked || installing} onSelect={onResetReinstall}>
                    Reset and reinstall
                    <span className="ml-auto text-xs text-red-300">Advanced</span>
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
        {isInstalled && !showFreshInstallResult && <InstalledAppNotice app={installedApp} />}
        {isInstalled && recoveryMode && (
          <RecoveryInstallNotice
            disabled={installLocked || installing}
            mode={recoveryMode}
            onReinstallCurrent={onReinstallCurrent}
            onResetReinstall={onResetReinstall}
          />
        )}
        {(installing || installResult) && <InlineInstallStatus installing={installing} result={installResult} />}

        <Tabs className="gap-4" defaultValue="overview">
          <TabsList className="w-full justify-start overflow-x-auto border-b border-slate-700/30 bg-transparent p-0" variant="line">
            <TabsTrigger className="px-3 py-2 text-slate-400 data-active:text-white" value="overview">Overview</TabsTrigger>
            <TabsTrigger className="px-3 py-2 text-slate-400 data-active:text-white" value="setup">Setup</TabsTrigger>
            <TabsTrigger className="px-3 py-2 text-slate-400 data-active:text-white" value="details">Details</TabsTrigger>
            <TabsTrigger className="px-3 py-2 text-slate-400 data-active:text-white" value="screenshots">Screenshots</TabsTrigger>
            <TabsTrigger className="px-3 py-2 text-slate-400 data-active:text-white" value="settings">Settings</TabsTrigger>
            <TabsTrigger className="px-3 py-2 text-slate-400 data-active:text-white" value="reviews">Reviews</TabsTrigger>
            <TabsTrigger className="px-3 py-2 text-slate-400 data-active:text-white" value="changelog">Changelog</TabsTrigger>
          </TabsList>

          <TabsContent className="grid gap-4" value="overview">
            <section className="rounded-lg border border-slate-700/30 bg-slate-950/30 p-4">
              <h4 className="font-bold text-white">About</h4>
              <p className="mt-2 text-sm leading-6 text-slate-300">{app.plainLanguage}</p>
            </section>
            <InfoCard title="Key features" items={app.highlights} />
            <div className="grid gap-4 md:grid-cols-2">
              <InfoCard title="Best for" items={app.bestFor} />
              <InfoCard title="Includes" items={app.includes} />
            </div>
          </TabsContent>

          <TabsContent className="grid gap-4" value="setup">
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
              <ol className="mt-4 grid gap-2 text-sm text-slate-300">
                {app.usage.setupSteps.map((step, index) => (
                  <li className="grid grid-cols-[24px_1fr] gap-2" key={step}>
                    <span className="grid size-6 place-items-center rounded-full bg-slate-800 text-xs font-bold text-slate-300">{index + 1}</span>
                    <span className="leading-6">{step}</span>
                  </li>
                ))}
              </ol>
            </section>
            {hasMarketplaceSetup(app) && (
              <section className="grid gap-3 rounded-lg border border-violet-300/20 bg-violet-500/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Badge className="border-violet-300/30 bg-violet-400/10 text-violet-200" variant="outline">
                      {setupKindLabel(app.setup.kind)}
                    </Badge>
                    <h4 className="mt-3 font-bold text-white">Setup help included</h4>
                  </div>
                  <span className="rounded-full border border-slate-700/40 px-3 py-1 text-xs font-semibold text-slate-300">{automationLabel(app.setup.automation)}</span>
                </div>
                {app.setup.automationCapabilities.length > 0 && <MiniList title="Project OS can prepare" items={app.setup.automationCapabilities} />}
                {app.setup.userSteps.length > 0 && <MiniList title="You still control" items={app.setup.userSteps} />}
                {app.setup.integrations.length > 0 && (
                  <div className="grid gap-2">
                    {app.setup.integrations.map((integration) => (
                      <div className="rounded-lg border border-slate-700/30 bg-slate-950/35 p-3" key={integration.id}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h5 className="text-sm font-bold text-white">{integration.name}</h5>
                          {integration.requiresApproval && <span className="text-xs text-amber-200">approval required</span>}
                        </div>
                        <p className="mt-1 text-sm leading-6 text-slate-400">{integration.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
            {app.usage.notes.length > 0 && <InfoCard title="Good to know" items={app.usage.notes} />}
          </TabsContent>

          <TabsContent className="grid gap-4" value="details">
            <section className="grid gap-4 rounded-lg border border-slate-700/30 bg-slate-950/30 p-4 sm:grid-cols-2">
              <Stat label="Downloads" value={app.downloads} />
              <Stat label="Last updated" value={app.lastUpdated} />
              <Stat label="Size" value={app.size} />
              <Stat label="Maintainer" value={app.maintainer} />
              <Stat label="Source" value={app.source} />
              <Stat label="Version" value={app.version} />
              <Stat label="Support level" value={app.supportLevel} />
            </section>
            <CatalogConfidenceCard app={app} />
            <InfoCard title="System requirements" items={app.requirements} />
            {installPlan && <TechnicalPlanCard plan={installPlan} />}
            <section className="rounded-lg border border-slate-700/30 bg-slate-950/30 p-4">
              <h4 className="font-bold text-white">Template settings preview</h4>
              <dl className="mt-3 grid gap-2 sm:grid-cols-[minmax(120px,0.7fr)_1fr]">
                {app.configuration.map((item) => <Config key={item.label} label={item.label} value={item.value} />)}
              </dl>
            </section>
          </TabsContent>

          <TabsContent value="screenshots">
            <section className="grid gap-3 rounded-lg border border-slate-700/30 bg-slate-950/30 p-4">
              <h4 className="font-bold text-white">Preview</h4>
              <img alt={`${app.name} preview`} className="h-48 w-full rounded-lg object-cover" src={app.image} />
              <p className="text-sm text-slate-400">More screenshots will appear here as app templates add them.</p>
            </section>
          </TabsContent>

          <TabsContent value="settings">
            <InfoCard title="Choices you can review before install" items={['Where the app keeps its data', 'How you open it', 'Whether backups are on', 'Whether private remote access is requested']} />
          </TabsContent>

          <TabsContent value="reviews">
            <section className="rounded-lg border border-slate-700/30 bg-slate-950/30 p-4">
              <h4 className="font-bold text-white">Community signal</h4>
              <p className="mt-2 text-sm text-slate-400">Rated {app.rating} by homelab users. Full reviews will appear here later.</p>
            </section>
          </TabsContent>

          <TabsContent value="changelog">
            <section className="rounded-lg border border-slate-700/30 bg-slate-950/30 p-4">
              <h4 className="font-bold text-white">Latest template update</h4>
              <p className="mt-2 text-sm text-slate-400">Version {app.version} was refreshed {app.lastUpdated}. Install behavior is now connected to the local installer.</p>
            </section>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
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

function RecoveryInstallNotice({ disabled, mode, onReinstallCurrent, onResetReinstall }: { disabled: boolean; mode: string; onReinstallCurrent: () => void | Promise<void>; onResetReinstall: () => void | Promise<void> }) {
  const resetMode = mode === 'reset-reinstall';
  return (
    <section className={cn('rounded-lg border p-4', resetMode ? 'border-red-300/25 bg-red-500/10' : 'border-amber-300/25 bg-amber-500/10')}>
      <div className="flex items-start gap-3">
        <TriangleAlert className={cn('mt-0.5 size-5 shrink-0', resetMode ? 'text-red-200' : 'text-amber-200')} />
        <div className="min-w-0">
          <h4 className="font-bold text-white">{resetMode ? 'Reset and reinstall requested' : 'Reinstall requested'}</h4>
          <p className={cn('mt-1 text-sm leading-6', resetMode ? 'text-red-100/80' : 'text-amber-100/80')}>
            Create a backup before continuing. {resetMode ? 'Reset and reinstall can remove app state and should only be used when you are ready to rebuild the app.' : 'Reinstalling with current settings should keep configured data folders, but a backup gives you a restore point if anything goes wrong.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild className="border-slate-700/50 bg-slate-950/50 text-slate-200 hover:bg-slate-800" size="sm" type="button" variant="outline">
              <Link to="/backups">
                <Archive className="size-3.5" />
                Open Backups
              </Link>
            </Button>
            <Button className={resetMode ? 'bg-red-500 text-white hover:bg-red-400' : 'bg-amber-500 text-slate-950 hover:bg-amber-400'} disabled={disabled} onClick={resetMode ? onResetReinstall : onReinstallCurrent} size="sm" type="button">
              {resetMode ? 'I backed up, reset and reinstall' : 'I backed up, reinstall'}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function InstalledAppNotice({ app }: { app: AppRuntimeView | null }) {
  if (!app) {
    return null;
  }
  return (
    <section className="rounded-lg border border-emerald-300/20 bg-emerald-500/10 p-4">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 size-5 text-emerald-200" />
        <div className="min-w-0">
          <h4 className="font-bold text-white">Already installed</h4>
          <p className="mt-1 text-sm text-emerald-100/80">{app.appName} is already managed by Project OS. Use Applications for day-to-day settings, repairs, and app status.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {app.accessUrl && (
              <Button asChild className="bg-emerald-500 text-slate-950 hover:bg-emerald-400" size="sm">
                <a href={app.accessUrl} rel="noreferrer" target="_blank">Open app</a>
              </Button>
            )}
            <Button asChild className="border-slate-700/50 bg-slate-950/50 text-slate-200 hover:bg-slate-800" size="sm" variant="outline">
              <Link to="/applications">Manage in Applications</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function InlineInstallStatus({ installing, result }: { installing: boolean; result: InstallResult | null }) {
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
            <Button asChild className="border-slate-700/50 bg-slate-950/50 text-slate-200 hover:bg-slate-800" size="sm" variant="outline">
              <Link to="/applications">View in Applications</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
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

function hasMarketplaceSetup(app: MarketplaceApp) {
  return app.setup.generatedValues.length > 0
    || app.setup.copyableFields.length > 0
    || app.setup.qrFields.length > 0
    || app.setup.integrations.length > 0
    || app.setup.userSteps.length > 0
    || app.setup.automationCapabilities.length > 0;
}

function setupKindLabel(kind: string) {
  const labels: Record<string, string> = {
    basic: 'Basic setup',
    companion: 'Device setup',
    dashboard: 'Dashboard setup',
    integration: 'Integration setup',
    'media-stack': 'Media stack setup',
    infrastructure: 'Infrastructure setup',
  };
  return labels[kind] || kind.replaceAll('-', ' ');
}

function automationLabel(automation: string) {
  const labels: Record<string, string> = {
    manual: 'Manual steps',
    guided: 'Guided setup',
    ready: 'Prepared setup',
    planned: 'Future autowire',
  };
  return labels[automation] || automation.replaceAll('-', ' ');
}

function MiniList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-slate-700/30 bg-slate-950/35 p-3">
      <h5 className="text-sm font-bold text-white">{title}</h5>
      <ul className="mt-2 grid gap-1 text-sm leading-6 text-slate-400">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
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
