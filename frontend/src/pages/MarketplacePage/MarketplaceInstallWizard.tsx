import { useState } from 'react';
import { HelpCircle, TriangleAlert } from 'lucide-react';
import { DisabledAction } from '@/components/project-os/DisabledAction';
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
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { poButtonClass } from '@/lib/projectOsStyleKit';
import { cn } from '@/lib/utils';
import type { DiscoverInstallIssue, DiscoverInstallPreview, DiscoverSetupInput, DiscoverSetupSchema } from '@/types/discover';
import type { InstallOptions, InstallPlan, MarketplaceApp } from '@/types/marketplace';
import { Config, FriendlyStat } from './MarketplacePage.shared';

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
  onSetupAnswersChange: (answers: Record<string, unknown>) => void;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  planLoading: boolean;
  setupAnswers: Record<string, unknown>;
  setupSchema: DiscoverSetupSchema;
  triggerLabel?: string;
};

export function InstallWizard({ app, hideTrigger = false, installLocked, installOptions, installPlan, installPreview, installStatusMessage, installing, onInstall, onOpenChange, onRequestPlan, onSetupAnswersChange, open: controlledOpen, planLoading, setupAnswers, setupSchema, triggerLabel = 'Customize' }: InstallWizardProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const installDisabled = installing || installLocked;
  const installDisabledReason = installing ? `${app.name} is already installing.` : installStatusMessage || 'Resolve the blocked install state before continuing.';

  async function startInstall() {
    await onInstall(installOptions);
    setOpen(false);
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
          <DialogDescription className="text-slate-400">Choose the basics. Project OS will use safe defaults unless you change them.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 overflow-y-auto pr-1">
          {installLocked && <InstallBlockedCard message={installStatusMessage} />}
          {requiresInstallCaution(app) && <InstallCaution app={app} />}

          <InstallationChoicesForm answers={setupAnswers} issues={installPreview?.blockingIssues ?? []} schema={setupSchema} onAnswersChange={onSetupAnswersChange} />

          <InstallImpactSummary app={app} installPlan={installPlan} installPreview={installPreview} />

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

          {installPreview && installPreview.warnings.length > 0 && (
            <Collapsible className="rounded-lg border border-amber-300/25 bg-amber-500/10 p-4">
              <CollapsibleTrigger className="w-full cursor-pointer text-left font-bold text-white">Warnings and recovery notes</CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="mt-3 grid gap-2 text-sm leading-6 text-amber-100/80">
                  {installPreview.warnings.map((warning) => <li key={`${warning.fieldId}-${warning.message}`}>{warning.message}</li>)}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          )}

        </div>

        <DialogFooter className="border-slate-800 bg-slate-900/80">
          <Button className={poButtonClass('quiet')} onClick={() => onRequestPlan(installOptions)} type="button" variant="outline">
            {planLoading ? 'Checking...' : 'Preview'}
          </Button>
          <DisabledAction disabled={installDisabled} reason={installDisabledReason}>
            <Button className={poButtonClass('primary')} disabled={installDisabled} onClick={startInstall} type="button">
              {installing ? 'Installing...' : installLocked ? 'Install blocked' : `Install ${app.name}`}
            </Button>
          </DisabledAction>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InstallationChoicesForm({ answers, issues, onAnswersChange, schema }: { answers: Record<string, unknown>; issues: DiscoverInstallIssue[]; onAnswersChange: (answers: Record<string, unknown>) => void; schema: DiscoverSetupSchema }) {
  const visibleInputs = schema.inputs.filter((input) => input.tier !== 'advanced' && shouldShowInput(input, answers));
  const advancedInputs = schema.inputs.filter((input) => input.tier === 'advanced' && shouldShowInput(input, answers));

  function updateAnswer(inputId: string, value: unknown) {
    onAnswersChange({ ...answers, [inputId]: value });
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-500/40 bg-slate-800 text-slate-100">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-500/20 bg-slate-700 p-4">
        <div>
          <h4 className="font-bold text-white">Installation choices</h4>
          <p className="mt-1 text-sm leading-6 text-slate-300">These choices need your attention before Project OS starts this app.</p>
        </div>
        <span className="rounded-full border border-slate-400/40 bg-slate-900/40 px-2.5 py-1 text-xs font-bold text-slate-100">Required</span>
      </div>
      <div className="grid gap-4 p-4">
        {visibleInputs.length ? visibleInputs.map((input) => (
          <InstallationChoiceField input={input} key={input.id} problem={issues.find((issue) => issue.fieldId === input.id)} value={answers[input.id]} onChange={(value) => updateAnswer(input.id, value)} />
        )) : (
          <p className="rounded-lg border border-slate-600/50 bg-slate-900/50 p-3 text-sm text-slate-300">No choices are needed for this app. Project OS will use safe defaults.</p>
        )}
        {advancedInputs.length > 0 && (
          <Collapsible className="rounded-lg border border-slate-600/50 bg-slate-900/40 p-3">
            <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between gap-3 text-left text-sm font-bold text-white">
              Advanced install options
              <span className="text-slate-400">Show</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-3 grid gap-4">
                {advancedInputs.map((input) => (
                  <InstallationChoiceField input={input} key={input.id} problem={issues.find((issue) => issue.fieldId === input.id)} value={answers[input.id]} onChange={(value) => updateAnswer(input.id, value)} />
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </section>
  );
}

function InstallationChoiceField({ input, onChange, problem, value }: { input: DiscoverSetupInput; onChange: (value: unknown) => void; problem?: DiscoverInstallIssue; value: unknown }) {
  const selectedOption = input.options?.find((option) => option.value === value);
  const inputId = `install-choice-${input.id}`;
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-bold text-white" htmlFor={inputId}>{input.label}</label>
        {input.help && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
              <Button aria-label={`Explain ${input.label}`} className="size-7 rounded-full border-slate-500/50 bg-slate-900/50 text-slate-200 hover:bg-slate-900 hover:text-white" size="icon" type="button" variant="outline">
                <HelpCircle className="size-3.5" />
              </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-72 border border-slate-700 bg-slate-950 text-slate-200">
                <p className="text-sm leading-6">{input.help}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      {input.type === 'choice' ? (
        <>
          <Select value={String(value ?? '')} onValueChange={onChange}>
            <SelectTrigger className={cn('h-12 w-full border-slate-500/40 bg-slate-950 text-white', problem && 'border-amber-300/60')} id={inputId}>
              <SelectValue placeholder="Choose an option" />
            </SelectTrigger>
            <SelectContent className="border-slate-700 bg-slate-950 text-slate-100">
              {input.options?.map((option) => (
                <SelectItem className="focus:bg-slate-800 focus:text-white" key={option.value} value={option.value}>
                  {option.label}{option.recommended ? ' (Recommended)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className={cn('text-xs leading-5 text-slate-300', problem && 'text-amber-100')}>{problem?.message || selectedOption?.description || 'Project OS will use this choice when it prepares the app.'}</p>
        </>
      ) : (
        <>
          <Input
            className={cn('h-12 border-slate-500/40 bg-slate-950 text-white placeholder:text-slate-500', problem && 'border-amber-300/60')}
            id={inputId}
            inputMode={input.type === 'number-or-auto' ? 'numeric' : undefined}
            onChange={(event) => onChange(input.type === 'number-or-auto' ? normalizePortValue(event.target.value) : event.target.value)}
            placeholder={input.type === 'number-or-auto' ? 'Auto-select a safe port' : undefined}
            type="text"
            value={String(value ?? '')}
          />
          <p className={cn('text-xs leading-5 text-slate-300', problem && 'text-amber-100')}>{problem?.message || input.help || 'Project OS will use this value when it prepares the app.'}</p>
        </>
      )}
    </div>
  );
}

function InstallImpactSummary({ app, installPlan, installPreview }: { app: MarketplaceApp; installPlan: InstallPlan | null; installPreview: DiscoverInstallPreview | null }) {
  const planItems = installPlan ? [
    ...installPlan.friendly.willCreate,
    ...installPlan.friendly.willExpose,
    ...installPlan.friendly.willConfigure,
    ...installPlan.friendly.willBackUp,
  ].filter(Boolean).slice(0, 5) : [];
  const previewItems = installPreview?.sections.flatMap((section) => section.items.map((item) => item.label)).filter(Boolean).slice(0, 5) ?? [];
  const items = planItems.length ? planItems : previewItems.length ? previewItems : [
    `Create managed storage for ${app.name}.`,
    'Start the app and check that it is reachable.',
    'Add it to My Apps with a safe default open link.',
    'Include managed app data in backup protection.',
  ];

  return (
    <section className="rounded-lg border border-slate-700/40 bg-slate-900/70 p-4">
      <h4 className="font-bold text-white">What Project OS will do</h4>
      <ul className="mt-3 grid gap-2 pl-5 text-sm leading-6 text-slate-300">
        {items.map((item) => <li className="list-disc" key={item}>{item}</li>)}
      </ul>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <FriendlyStat label="Type" value={serviceKindLabel(app.usage.kind)} />
        <FriendlyStat label="Typical install" value={app.installTime} />
        <FriendlyStat label="Ready when" value={app.health.successLabel} />
      </div>
    </section>
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

function shouldShowInput(input: DiscoverSetupInput, answers: Record<string, unknown>) {
  if (!input.showWhen || Object.keys(input.showWhen).length === 0) {
    return true;
  }
  return Object.entries(input.showWhen).every(([fieldId, expected]) => answers[fieldId] === expected);
}

function normalizePortValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'auto') {
    return 'auto';
  }
  return Number(trimmed);
}
