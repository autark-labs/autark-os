import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Check, Copy, ExternalLink, Eye, EyeOff, QrCode, ServerCog, TriangleAlert } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { NetworkAPIClient } from '@/api/NetworkAPIClient';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ApplicationsSetupGuide } from '@/pages/ApplicationsPage/ApplicationsSetupGuide';
import { cn } from '@/lib/utils';
import type { InstallOptions, InstallPlan, InstallResult, MarketplaceApp, MarketplaceUsageField, PostInstallGuide } from '@/types/marketplace';
import { defaultHostPort, type InstallOptionsUpdater } from './extensions/MarketplacePage.installation';
import { Config, FriendlyStat } from './MarketplacePage.shared';

type InstallWizardProps = {
  app: MarketplaceApp;
  installOptions: InstallOptions;
  installPlan: InstallPlan | null;
  installResult: InstallResult | null;
  installing: boolean;
  onInstall: (options: InstallOptions) => Promise<void>;
  onOptionsChange: Dispatch<SetStateAction<InstallOptions | null>>;
  onRequestPlan: (options: InstallOptions) => Promise<void>;
  planLoading: boolean;
};

export function InstallWizard({ app, installOptions, installPlan, installResult, installing, onInstall, onOptionsChange, onRequestPlan, planLoading }: InstallWizardProps) {
  const [open, setOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const hasResult = Boolean(installResult);
  const currentStep = installing ? 2 : hasResult ? 3 : 1;

  async function startInstall() {
    await onInstall(installOptions);
  }

  function updateOptions(updater: InstallOptionsUpdater) {
    onOptionsChange(updater(installOptions));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button className="border-slate-700/50 bg-slate-950/50 text-slate-200 hover:bg-slate-800" onClick={() => setOpen(true)} type="button" variant="outline">
        Customize
      </Button>
      <DialogContent className="max-h-[88vh] overflow-y-auto border-slate-700 bg-slate-950 text-slate-100 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl text-white">Customize {app.name}</DialogTitle>
          <DialogDescription className="text-slate-400">The default install is ready. Review or change specific choices before Project OS starts the app.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 overflow-y-auto pr-1">
          <WizardSteps currentStep={currentStep} />
          {requiresInstallCaution(app) && <InstallCaution app={app} />}

          <section className="rounded-lg border border-slate-700/40 bg-slate-900/70 p-4">
            <h4 className="font-bold text-white">Quick review</h4>
            <p className="mt-2 text-sm text-slate-300">{installPlan?.friendly.headline || app.plainLanguage}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <FriendlyStat label="Type" value={serviceKindLabel(app.usage.kind)} />
              <FriendlyStat label="Typical install" value={app.installTime} />
              <FriendlyStat label="Support level" value={app.supportLevel} />
              <FriendlyStat label="Ready when" value={app.health.successLabel} />
            </div>
            <p className="mt-3 rounded-md border border-slate-700/30 bg-slate-950/35 px-3 py-2 text-xs leading-5 text-slate-400">{expectedSetupText(app)}</p>
          </section>

          {installPlan && (
            <section className="rounded-lg border border-slate-700/40 bg-slate-900/70 p-4">
              <h4 className="font-bold text-white">What will happen</h4>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <MiniList title="Create" items={installPlan.friendly.willCreate} />
                <MiniList title="Expose" items={installPlan.friendly.willExpose} />
                <MiniList title="Configure" items={installPlan.friendly.willConfigure} />
                <MiniList title="Back up" items={installPlan.friendly.willBackUp} />
              </div>
            </section>
          )}

          <section className="rounded-lg border border-slate-700/40 bg-slate-900/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-white">Choices</h4>
                <p className="mt-1 text-sm text-slate-400">Leave these alone for the normal one-click setup, or change them for a specific port, folder, or backup plan.</p>
              </div>
              <Button className="border-slate-700/50 bg-slate-950/50 text-slate-200 hover:bg-slate-800" onClick={() => setShowAdvanced((value) => !value)} type="button" variant="outline">
                {showAdvanced ? 'Hide choices' : 'Show choices'}
              </Button>
            </div>

            {showAdvanced && (
              <div className="mt-4 grid gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-semibold text-slate-200">Local browser port</span>
                    <Input className="border-slate-700/40 bg-slate-950/60 text-white" max="65535" min="1" onChange={(event) => updateOptions((options) => ({ ...options, ports: { hostPort: event.target.value ? Number(event.target.value) : null } }))} placeholder={`Auto (${defaultHostPort(app)})`} type="number" value={installOptions?.ports?.hostPort ?? ''} />
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-700/30 bg-slate-950/35 p-3 text-sm">
                    <span>
                      <span className="block font-semibold text-slate-200">Private remote access</span>
                      <span className="text-slate-500">Save this preference for Tailscale support.</span>
                    </span>
                    <input checked={Boolean(installOptions?.access?.tailscaleEnabled)} onChange={(event) => updateOptions((options) => ({ ...options, access: { tailscaleEnabled: event.target.checked } }))} type="checkbox" />
                  </label>
                </div>

                <div className="grid gap-3 rounded-lg border border-slate-700/30 bg-slate-950/35 p-3">
                  <h5 className="font-bold text-white">Data folders</h5>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {Object.entries(installOptions?.storage?.subfolders ?? {}).map(([key, value]) => (
                      <label className="grid gap-1.5 text-sm" key={key}>
                        <span className="font-semibold text-slate-300">{key}</span>
                        <Input className="border-slate-700/40 bg-slate-950/60 text-white" onChange={(event) => updateOptions((options) => ({ ...options, storage: { subfolders: { ...(options.storage?.subfolders ?? {}), [key]: event.target.value } } }))} value={value} />
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-700/30 bg-slate-950/35 p-3">
                  <p className="text-sm font-semibold text-slate-200">Backups</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    New apps are included in Project OS backup protection by default. Routine timing and retention are managed globally from Backups and Settings.
                  </p>
                </div>
              </div>
            )}
          </section>

          {installing && <InstallProgressCard />}
          {installResult && <InstallResultCard result={installResult} />}
        </div>

        <DialogFooter className="border-slate-800 bg-slate-900/80">
          <Button className="border-slate-700/50 bg-slate-950/50 text-slate-200 hover:bg-slate-800" onClick={() => onRequestPlan(installOptions)} type="button" variant="outline">
            {planLoading ? 'Checking...' : 'Preview'}
          </Button>
          <Button className="bg-gradient-to-br from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500" disabled={installing} onClick={startInstall} type="button">
            {installing ? 'Installing...' : hasResult ? 'Install again' : 'Install with choices'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TechnicalPlanCard({ plan }: { plan: InstallPlan }) {
  return (
    <section className="rounded-lg border border-violet-300/25 bg-violet-600/10 p-4">
      <h4 className="font-bold text-white">Generated install plan</h4>
      <dl className="mt-3 grid gap-2 sm:grid-cols-[minmax(120px,0.7fr)_1fr]">
        <Config label="Runtime root" value={plan.technical.runtimeRoot} />
        <Config label="Compose project" value={plan.technical.composeProject} />
        <Config label="Network" value={plan.technical.network} />
        <Config label="Containers" value={plan.technical.containers.map((container) => `${container.name} (${container.image})`).join(', ')} />
        <Config label="Ports" value={plan.technical.ports.join(', ') || 'No public ports declared'} />
        <Config label="Volumes" value={plan.technical.volumes.join(', ')} />
        <Config label="Labels" value={plan.technical.labels.join(', ')} />
        <Config label="Backup paths" value={plan.technical.backupPaths.join(', ') || 'No backup paths declared'} />
        {plan.customization && (
          <>
            <Config label="Access URL" value={plan.customization.accessUrl} />
            <Config label="Tailscale" value={plan.customization.tailscaleEnabled ? 'Requested' : 'Not requested'} />
            <Config label="Backup protection" value={plan.customization.backup?.enabled ? 'Included in routine and manual backups' : 'Not included'} />
            <Config label="Storage folders" value={Object.entries(plan.customization.storageSubfolders ?? {}).map(([key, value]) => `${key} -> ${value}`).join(', ') || 'Default folders'} />
          </>
        )}
      </dl>
    </section>
  );
}

function WizardSteps({ currentStep }: { currentStep: number }) {
  const steps = ['Review', 'Install', 'Ready'];
  return (
    <div className="grid grid-cols-3 gap-2">
      {steps.map((step, index) => {
        const stepNumber = index + 1;
        const isComplete = currentStep > stepNumber;
        const isActive = currentStep === stepNumber;
        return (
          <div className="flex items-center gap-2 rounded-lg border border-slate-700/40 bg-slate-900/70 p-3" key={step}>
            <span className={cn('grid size-7 place-items-center rounded-full text-xs font-bold', isComplete && 'bg-emerald-500 text-white', isActive && 'bg-violet-600 text-white', !isComplete && !isActive && 'bg-slate-800 text-slate-400')}>
              {isComplete ? <Check className="size-4" /> : stepNumber}
            </span>
            <span className="text-sm font-medium text-white">{step}</span>
          </div>
        );
      })}
    </div>
  );
}

function InstallProgressCard() {
  return (
    <section className="rounded-lg border border-violet-300/25 bg-violet-600/10 p-4">
      <h4 className="font-bold text-white">Installing now</h4>
      <p className="mt-2 text-sm text-slate-300">Project OS is setting up storage and starting the app.</p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full w-2/3 animate-pulse rounded-full bg-violet-500" />
      </div>
    </section>
  );
}

function InstallCaution({ app }: { app: MarketplaceApp }) {
  return (
    <section className="rounded-lg border border-amber-300/25 bg-amber-500/10 p-4">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-200" />
        <div>
          <h4 className="font-bold text-white">{app.supportLevel} app</h4>
          <p className="mt-1 text-sm leading-6 text-amber-50/80">{app.supportSummary}</p>
          <p className="mt-2 text-xs leading-5 text-amber-100/70">Project OS can still install it, but review the generated plan and smoke-test notes before using it for anything important.</p>
        </div>
      </div>
    </section>
  );
}

function requiresInstallCaution(app: MarketplaceApp) {
  return ['Advanced', 'Needs testing', 'Experimental'].includes(app.supportLevel);
}

function InstallResultCard({ result }: { result: InstallResult }) {
  return (
    <section className={cn('rounded-lg border p-4', result.status === 'installed' ? 'border-emerald-400/25 bg-emerald-500/10' : 'border-red-400/25 bg-red-500/10')}>
      <h4 className="font-bold text-white">{result.status === 'installed' ? 'Ready to use' : 'Install needs attention'}</h4>
      <p className="mt-2 text-sm text-slate-300">{result.message}</p>
      {result.status !== 'installed' && privateHttpsFailed(result) && <PrivateHttpsSetupHint />}
      {result.status === 'installed' && result.postInstallGuide && <PostInstallGuideCard guide={result.postInstallGuide} accessUrl={result.accessUrl} />}
      {result.status === 'installed' && result.setupGuide && <div className="mt-4"><ApplicationsSetupGuide guide={result.setupGuide} /></div>}
      <div className="mt-4 grid gap-2">
        {result.steps.map((step) => (
          <div className="flex items-start gap-3 rounded-md bg-slate-950/30 p-3 text-sm" key={step.label + step.timestamp}>
            <span className={cn('mt-1 size-2 rounded-full', step.status === 'completed' ? 'bg-emerald-400' : 'bg-red-400')} />
            <div>
              <p className="font-semibold text-white">{step.label}</p>
              <p className="text-slate-400">{step.detail}</p>
            </div>
          </div>
        ))}
      </div>
      {result.logs.length > 0 && <InstallTerminal logs={result.logs} />}
    </section>
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

function expectedSetupText(app: MarketplaceApp) {
  if (app.usage.privateHttpsRequired) {
    return 'Project OS will create a private HTTPS link and show copyable setup details after install.';
  }
  if (app.usage.kind === 'companion-service') {
    return 'Project OS will start the service and then show connection details for your devices.';
  }
  if (app.health.type === 'no-web-ui' || app.health.type === 'container') {
    return 'Project OS will check that the background service is running; there may not be a normal web page to open.';
  }
  return 'Project OS will start the app, check its local link, and keep watching it from Applications.';
}

function privateHttpsFailed(result: InstallResult) {
  const text = [result.message, ...result.steps.map((step) => step.detail)].join(' ').toLowerCase();
  return text.includes('private https') || text.includes('tailscale serve') || text.includes('operator=');
}

function PrivateHttpsSetupHint() {
  const [copied, setCopied] = useState(false);
  const [command, setCommand] = useState('sudo /opt/project-os/bin/install-project-os-service.sh');

  useEffect(() => {
    let active = true;
    NetworkAPIClient.setupStatus()
      .then((status) => {
        if (active && status.installCommand) {
          setCommand(status.installCommand);
        }
      })
      .catch(() => {
        // Keep the stable installed fallback when the backend is not reachable.
      });
    return () => {
      active = false;
    };
  }, []);

  async function copy() {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mt-4 rounded-lg border border-amber-300/25 bg-amber-500/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-200">
            <ServerCog className="size-3.5" />
            Host setup needed
          </div>
          <p className="mt-3 text-sm leading-6 text-amber-100">Private HTTPS links need the Project OS service-user setup so the app can manage Tailscale Serve safely.</p>
        </div>
        <Button className="border-amber-300/30 bg-slate-950/50 text-amber-100 hover:bg-slate-900" onClick={copy} type="button" variant="outline">
          <Copy className="size-4" />
          {copied ? 'Copied' : 'Copy setup command'}
        </Button>
      </div>
      <code className="mt-3 block overflow-x-auto rounded-md bg-black/35 px-3 py-2 text-sm text-amber-100">{command}</code>
    </div>
  );
}

function PostInstallGuideCard({ guide, accessUrl }: { guide: PostInstallGuide; accessUrl: string }) {
  const openLabel = guide.openUrlLabel || 'Open app';
  const hasOpenUrl = Boolean(accessUrl);

  return (
    <div className="mt-4 grid gap-4 rounded-lg border border-emerald-300/20 bg-slate-950/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-200">
            <QrCode className="size-3.5" />
            Setup guide
          </div>
          <h5 className="mt-3 text-base font-bold text-white">{guide.headline}</h5>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-300">{guide.summary}</p>
        </div>
        {hasOpenUrl && (
          <Button asChild className="border-slate-700/50 bg-slate-950/50 text-slate-200 hover:bg-slate-800" type="button" variant="outline">
            <a href={accessUrl} rel="noreferrer" target="_blank">
              {openLabel}
              <ExternalLink className="size-4" />
            </a>
          </Button>
        )}
      </div>

      {guide.values.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {guide.values.map((value) => <SetupValueCard key={value.label} value={value} />)}
        </div>
      )}

      <div className="grid gap-2 rounded-lg border border-slate-700/30 bg-slate-950/40 p-3">
        <h6 className="text-sm font-bold text-white">Next steps</h6>
        <ol className="grid gap-2 text-sm text-slate-300">
          {guide.setupSteps.map((step, index) => (
            <li className="grid grid-cols-[24px_1fr] gap-2" key={step}>
              <span className="grid size-6 place-items-center rounded-full bg-slate-800 text-xs font-bold text-slate-300">{index + 1}</span>
              <span className="leading-6">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {guide.notes.length > 0 && (
        <div className="grid gap-1 text-xs leading-5 text-slate-400">
          {guide.notes.map((note) => <p key={note}>{note}</p>)}
        </div>
      )}
    </div>
  );
}

function SetupValueCard({ value }: { value: MarketplaceUsageField }) {
  const [visible, setVisible] = useState(!value.sensitive);
  const [copied, setCopied] = useState(false);
  const displayValue = value.sensitive && !visible ? '••••••••••••' : value.value;

  async function copy() {
    await navigator.clipboard.writeText(value.value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="grid gap-3 rounded-lg border border-slate-700/30 bg-slate-900/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{value.label}</span>
        <div className="flex items-center gap-1">
          {value.sensitive && (
            <Button className="size-8 border-slate-700/50 bg-slate-950/50 text-slate-300 hover:bg-slate-800" onClick={() => setVisible((current) => !current)} size="icon" type="button" variant="outline">
              {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
          )}
          <Button className="size-8 border-slate-700/50 bg-slate-950/50 text-slate-300 hover:bg-slate-800" onClick={copy} size="icon" type="button" variant="outline">
            <Copy className="size-4" />
          </Button>
        </div>
      </div>
      <div className="min-w-0 rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2 font-mono text-xs text-slate-200">
        <span className="break-all">{displayValue}</span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <span className={cn('text-xs', copied ? 'text-emerald-300' : 'text-slate-500')}>{copied ? 'Copied' : 'Copy for setup'}</span>
        {value.qr && (
          <div className="rounded-md bg-white p-2">
            <QRCodeSVG value={value.value} size={88} level="M" />
          </div>
        )}
      </div>
    </div>
  );
}

function InstallTerminal({ logs }: { logs: string[] }) {
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-slate-800 bg-black/70">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <span className="text-xs font-semibold uppercase text-slate-500">Install terminal</span>
        <span className="text-xs text-slate-600">condensed</span>
      </div>
      <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap px-3 py-2 font-mono text-[11px] leading-5 text-slate-400">
        {logs.slice(-80).join('\n')}
      </pre>
    </div>
  );
}

function MiniList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-slate-700/30 bg-slate-950/30 p-3">
      <h5 className="text-sm font-bold text-white">{title}</h5>
      <ul className="mt-2 grid gap-1 text-sm text-slate-400">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}
