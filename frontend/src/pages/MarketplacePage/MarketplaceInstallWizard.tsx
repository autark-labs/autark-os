import { useState } from 'react';
import { Settings2, TriangleAlert } from 'lucide-react';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { ProjectDarkControlButton, ProjectPrimaryButton } from '@/components/primitives/ProjectButtons';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { DiscoverInstallPreview, DiscoverSetupSchema } from '@/types/discover';
import type { InstallOptions, InstallPlan, MarketplaceApp } from '@/types/marketplace';
import { appSpecificSetupInputs } from './MarketplaceAppSettingsDialog';
import { Config, FriendlyStat } from './MarketplacePage.shared';

type InstallWizardProps = {
  app: MarketplaceApp;
  hasAppSettings: boolean;
  hideTrigger?: boolean;
  installLocked: boolean;
  installOptions: InstallOptions;
  installPlan: InstallPlan | null;
  installStatusMessage: string;
  installing: boolean;
  installPreview: DiscoverInstallPreview | null;
  onInstall: (options: InstallOptions) => Promise<void>;
  onRequestPlan: (options: InstallOptions) => Promise<void>;
  onOpenSettings: () => void;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  planLoading: boolean;
  setupAnswers: Record<string, unknown>;
  setupSchema: DiscoverSetupSchema;
  triggerLabel?: string;
};

export function InstallWizard({ app, hasAppSettings, hideTrigger = false, installLocked, installOptions, installPlan, installPreview, installStatusMessage, installing, onInstall, onOpenChange, onOpenSettings, onRequestPlan, open: controlledOpen, planLoading, setupAnswers, setupSchema, triggerLabel = 'Customize' }: InstallWizardProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const installDisabled = installing || installLocked;
  const installDisabledReason = installing ? `${app.name} is already installing.` : installStatusMessage || 'Resolve the blocked install state before continuing.';

  async function startInstall() {
    await onInstall(installOptions);
    setOpen(false);
  }

  function openSettings() {
    setOpen(false);
    onOpenSettings();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <ProjectDarkControlButton onClick={() => setOpen(true)} type="button">
          {triggerLabel}
        </ProjectDarkControlButton>
      )}
      <DialogContent className="max-h-[88vh] overflow-y-auto border-slate-600 bg-slate-800 text-slate-50 shadow-xl shadow-slate-950/20 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl text-slate-50">Review install for {app.name}</DialogTitle>
          <DialogDescription className="text-slate-300">Review the plan before Autark-OS changes this server. Routine access, storage, and backup choices use safe defaults.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 overflow-y-auto pr-1">
          {installLocked && <InstallBlockedCard message={installStatusMessage} />}
          {requiresInstallCaution(app) && <InstallCaution app={app} />}

          <InstallSettingsSummary answers={setupAnswers} hasAppSettings={hasAppSettings} onOpenSettings={openSettings} schema={setupSchema} />

          <InstallImpactSummary app={app} installPlan={installPlan} installPreview={installPreview} />

          {installPlan && (
            <Collapsible className="rounded-lg border border-slate-600 bg-slate-700/45 p-4">
              <CollapsibleTrigger className="w-full cursor-pointer text-left font-bold text-slate-50">Technical details</CollapsibleTrigger>
              <CollapsibleContent>
              <div className="mt-4">
                <TechnicalPlanCard plan={installPlan} />
              </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {installPreview && installPreview.warnings.length > 0 && (
            <Collapsible className="rounded-lg border border-orange-400/40 bg-orange-500/10 p-4">
              <CollapsibleTrigger className="w-full cursor-pointer text-left font-bold text-slate-50">Warnings and recovery notes</CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="mt-3 grid gap-2 text-sm leading-6 text-orange-200">
                  {installPreview.warnings.map((warning) => <li key={`${warning.fieldId}-${warning.message}`}>{warning.message}</li>)}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          )}

        </div>

        <DialogFooter className="border-slate-600 bg-slate-700/45">
          <ProjectDarkControlButton onClick={() => onRequestPlan(installOptions)} type="button">
            {planLoading ? 'Checking...' : 'Preview'}
          </ProjectDarkControlButton>
          <DisabledAction disabled={installDisabled} reason={installDisabledReason}>
            <ProjectPrimaryButton disabled={installDisabled} onClick={startInstall} type="button">
              {installing ? 'Installing...' : installLocked ? 'Install blocked' : `Install ${app.name}`}
            </ProjectPrimaryButton>
          </DisabledAction>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InstallSettingsSummary({ answers, hasAppSettings, onOpenSettings, schema }: { answers: Record<string, unknown>; hasAppSettings: boolean; onOpenSettings: () => void; schema: DiscoverSetupSchema }) {
  const settings = appSpecificSetupInputs(schema, answers);

  return (
    <section className="rounded-xl border border-slate-600 bg-slate-700/45 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-bold text-white">App configuration</h4>
          <p className="mt-1 text-sm leading-6 text-slate-300">
            {hasAppSettings ? 'Only app-specific choices are shown here. Access, storage, and backup protection use Autark-OS defaults.' : 'No app-specific choices are needed. Autark-OS will use safe defaults.'}
          </p>
        </div>
        {hasAppSettings && (
          <ProjectDarkControlButton onClick={onOpenSettings} size="sm" type="button">
            <Settings2 className="size-3.5" />
            App settings
          </ProjectDarkControlButton>
        )}
      </div>
      {hasAppSettings && (
        <dl className="mt-3 grid gap-2 text-sm">
          {settings.map((input) => <ConfigurationLine input={input.label} key={input.id} value={displaySetupValue(input.options, answers[input.id])} />)}
        </dl>
      )}
    </section>
  );
}

function ConfigurationLine({ input, value }: { input: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-slate-600 pt-2 first:border-t-0 first:pt-0">
      <dt className="text-slate-300">{input}</dt>
      <dd className="w-1/2 truncate text-right font-medium text-slate-50" title={value}>{value}</dd>
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
    <section className="rounded-lg border border-slate-600 bg-slate-700/45 p-4">
      <h4 className="font-bold text-slate-50">What Autark-OS will do</h4>
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
    <section className="rounded-lg border border-orange-400/40 bg-orange-500/10 p-4">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-orange-200" />
        <div>
          <h4 className="font-bold text-slate-50">Install waiting</h4>
          <p className="mt-1 text-sm leading-6 text-slate-300">{message}</p>
        </div>
      </div>
    </section>
  );
}

export function TechnicalPlanCard({ plan }: { plan: InstallPlan }) {
  return (
    <section className="rounded-lg border border-cyan-300/35 bg-cyan-400/10 p-4">
      <h4 className="font-bold text-slate-50">Generated install plan</h4>
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
    <section className="rounded-lg border border-orange-400/40 bg-orange-500/10 p-4">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-orange-200" />
        <div>
          <h4 className="font-bold text-slate-50">{app.supportLevel} app</h4>
          <p className="mt-1 text-sm leading-6 text-slate-300">{app.supportSummary}</p>
          <p className="mt-2 text-xs leading-5 text-slate-400">Autark-OS can still install it, but review the generated plan and smoke-test notes before using it for anything important.</p>
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

function displaySetupValue(options: Array<{ label: string; value: string }>, value: unknown) {
  const option = options.find((candidate) => candidate.value === value);
  if (option) {
    return option.label;
  }
  if (value === null || value === undefined || value === '') {
    return 'Not selected';
  }
  return String(value);
}
