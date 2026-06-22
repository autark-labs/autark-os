import { useState } from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { poButtonClass } from '@/lib/projectOsStyleKit';
import { cn } from '@/lib/utils';
import type { DiscoverInstallPreview, DiscoverSetupSchema } from '@/types/discover';
import type { InstallOptions, InstallPlan, MarketplaceApp } from '@/types/marketplace';
import { Config, FriendlyStat } from './MarketplacePage.shared';
import { InstallPlanPreview, SetupSummaryList } from './MarketplaceSetupPanel';

type InstallWizardProps = {
  app: MarketplaceApp;
  hideTrigger?: boolean;
  installLocked: boolean;
  installOptions: InstallOptions;
  installPlan: InstallPlan | null;
  installStatusMessage: string;
  installing: boolean;
  installPreview: DiscoverInstallPreview | null;
  onInstall: (options: InstallOptions) => Promise<void>;
  onRequestPlan: (options: InstallOptions) => Promise<void>;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  planLoading: boolean;
  setupAnswers: Record<string, unknown>;
  setupSchema: DiscoverSetupSchema;
  triggerLabel?: string;
};

export function InstallWizard({ app, hideTrigger = false, installLocked, installOptions, installPlan, installPreview, installStatusMessage, installing, onInstall, onOpenChange, onRequestPlan, open: controlledOpen, planLoading, setupAnswers, setupSchema, triggerLabel = 'Customize' }: InstallWizardProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const currentStep = installing ? 2 : 1;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  async function startInstall() {
    await onInstall(installOptions);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <Button className={poButtonClass('quiet')} onClick={() => setOpen(true)} type="button" variant="outline">
          {triggerLabel}
        </Button>
      )}
      <DialogContent className="max-h-[88vh] overflow-y-auto border-slate-700 bg-slate-950 text-slate-100 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl text-white">Install {app.name}</DialogTitle>
          <DialogDescription className="text-slate-400">Review what Project OS will do before it starts this app.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 overflow-y-auto pr-1">
          <WizardSteps currentStep={currentStep} />
          {installLocked && <InstallBlockedCard message={installStatusMessage} />}
          {requiresInstallCaution(app) && <InstallCaution app={app} />}

          <section className="rounded-lg border border-slate-700/40 bg-slate-900/70 p-4">
            <h4 className="font-bold text-white">Review setup</h4>
            <p className="mt-2 text-sm text-slate-300">{installPlan?.friendly.headline || app.plainLanguage}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <FriendlyStat label="Type" value={serviceKindLabel(app.usage.kind)} />
              <FriendlyStat label="Typical install" value={app.installTime} />
              <FriendlyStat label="Support level" value={app.supportLevel} />
              <FriendlyStat label="Ready when" value={app.health.successLabel} />
            </div>
            <div className="mt-4">
              <SetupSummaryList answers={setupAnswers} schema={setupSchema} />
            </div>
          </section>

          <InstallPlanPreview preview={installPreview} />

          {installPlan && (
            <Collapsible className="rounded-lg border border-slate-700/40 bg-slate-900/70 p-4">
              <CollapsibleTrigger className="w-full cursor-pointer text-left font-bold text-white">Technical details</CollapsibleTrigger>
              <CollapsibleContent>
              <div className="mt-4">
                <TechnicalPlanCard plan={installPlan} />
              </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {installing && <InstallProgressCard />}
        </div>

        <DialogFooter className="border-slate-800 bg-slate-900/80">
          <Button className={poButtonClass('quiet')} onClick={() => onRequestPlan(installOptions)} type="button" variant="outline">
            {planLoading ? 'Checking...' : 'Preview'}
          </Button>
          <Button className={poButtonClass('primary')} disabled={installing || installLocked} onClick={startInstall} type="button">
            {installing ? 'Installing...' : installLocked ? 'Install blocked' : `Install ${app.name}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InstallBlockedCard({ message }: { message: string }) {
  return (
    <section className="rounded-lg border border-amber-300/25 bg-amber-500/10 p-4">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-200" />
        <div>
          <h4 className="font-bold text-white">Install waiting</h4>
          <p className="mt-1 text-sm leading-6 text-amber-100/80">{message}</p>
        </div>
      </div>
    </section>
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
            <Config label="External folders" value={Object.entries(plan.customization.storageHostPaths ?? {}).map(([key, value]) => `${key} -> ${value}`).join(', ') || 'None'} />
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
