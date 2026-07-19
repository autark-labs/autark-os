import { useEffect, useState } from 'react';
import { Check, Cloud, FolderOpen, LockKeyhole, PackageOpen, Settings2, TriangleAlert, type LucideIcon } from 'lucide-react';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { ProjectDarkControlButton, ProjectPrimaryButton } from '@/components/primitives/ProjectButtons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import type { DiscoverInstallPreview, DiscoverSetupSchema } from '@/types/discover';
import type { InstallOptions, InstallPlan, MarketplaceApp } from '@/types/marketplace';
import { appSpecificSetupInputs } from './MarketplaceAppSettingsDialog';

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
  onOpenSettings: () => void;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  setupAnswers: Record<string, unknown>;
  setupSchema: DiscoverSetupSchema;
  triggerLabel?: string;
};

export function InstallWizard({ app, hasAppSettings, hideTrigger = false, installLocked, installOptions, installPlan, installPreview, installStatusMessage, installing, onInstall, onOpenChange, onOpenSettings, open: controlledOpen, setupAnswers, setupSchema, triggerLabel = 'Customize' }: InstallWizardProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const installDisabled = installing || installLocked || !confirmed;
  const installDisabledReason = installing
    ? `${app.name} is already installing.`
    : installLocked
      ? installStatusMessage || 'Resolve the blocked install state before continuing.'
      : 'Confirm the install plan before starting.';

  useEffect(() => {
    if (open) {
      setConfirmed(false);
    }
  }, [app.id, open]);

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
      <DialogContent className="max-h-[88vh] overflow-y-auto border-sky-300/25 bg-[#0b1831] text-slate-50 shadow-2xl shadow-slate-950/40 sm:max-w-xl">
        <DialogHeader className="pr-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-100/65">Install plan</p>
          <DialogTitle className="text-2xl text-slate-50">Install {app.name}</DialogTitle>
          <DialogDescription className="text-sm leading-6 text-sky-100/70">Autark-OS checks the plan before it creates anything. Review the important parts without reading a Docker file.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          {installLocked && <InstallBlockedCard message={installStatusMessage} />}
          {requiresInstallCaution(app) && <InstallCaution app={app} />}
          <InstallPlanStep icon={PackageOpen} label="Create the app" text={installPlan?.friendly.willCreate[0] || `${app.name} will run as a managed Autark-OS app.`} />
          <InstallPlanStep icon={LockKeyhole} label="Set up access" text={installPlan?.friendly.willExpose[0] || 'A local link and private access will be configured when supported.'} />
          <InstallPlanStep icon={FolderOpen} label="Prepare app data" text={installPlan?.friendly.willConfigure[0] || 'App data stays in a dedicated location, separate from other apps.'} />
          <InstallPlanStep icon={Cloud} label="Protect it" text={installPlan?.friendly.willBackUp[0] || 'Backup protection will be enabled before the app is ready to use.'} />
        </div>

        <InstallConfigurationCallout answers={setupAnswers} hasAppSettings={hasAppSettings} onOpenSettings={openSettings} schema={setupSchema} />

        {installPreview?.warnings.length ? <InstallWarnings warnings={installPreview.warnings} /> : null}

        <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-sky-300/15 bg-slate-950/25 p-3 text-xs leading-5 text-sky-100/70">
          <Checkbox aria-label="Confirm install plan" checked={confirmed} className="mt-0.5 border-sky-300/35 data-checked:border-cyan-300 data-checked:bg-cyan-300 data-checked:text-slate-950" onCheckedChange={(checked) => setConfirmed(checked === true)} />
          <span>I understand Autark-OS will create and manage this app.</span>
        </label>

        <DialogFooter className="gap-2 border-sky-300/15 bg-slate-950/25">
          <ProjectDarkControlButton onClick={() => setOpen(false)} type="button">
            Cancel
          </ProjectDarkControlButton>
          <DisabledAction disabled={installDisabled} reason={installDisabledReason}>
            <ProjectPrimaryButton disabled={installDisabled} onClick={startInstall} type="button">
              <Check className="size-4" />
              {installing ? 'Installing...' : installLocked ? 'Install blocked' : 'Install app'}
            </ProjectPrimaryButton>
          </DisabledAction>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InstallConfigurationCallout({ answers, hasAppSettings, onOpenSettings, schema }: { answers: Record<string, unknown>; hasAppSettings: boolean; onOpenSettings: () => void; schema: DiscoverSetupSchema }) {
  const settings = appSpecificSetupInputs(schema, answers);

  return (
    <section className={hasAppSettings ? 'flex items-center justify-between gap-3 rounded-xl border border-violet-300/25 bg-violet-400/10 p-3' : 'rounded-xl border border-sky-300/15 bg-slate-950/25 p-3 text-xs leading-5 text-sky-100/65'}>
      {hasAppSettings ? <>
        <div>
          <p className="text-xs font-semibold text-violet-100">{settings.length === 1 ? 'One setup choice needs your input' : `${settings.length} setup choices need your input`}</p>
          <p className="mt-0.5 text-xs leading-5 text-violet-100/70">Everything else uses safe defaults.</p>
        </div>
        <ProjectDarkControlButton className="shrink-0 border-violet-300/25 bg-slate-950/25 text-violet-100 hover:border-violet-200/60 hover:text-white" onClick={onOpenSettings} size="sm" type="button">
          <Settings2 className="size-3.5" />
          Review
        </ProjectDarkControlButton>
      </> : 'No app-specific choices are needed. Autark-OS will use its safe defaults.'}
    </section>
  );
}

function InstallPlanStep({ icon: Icon, label, text }: { icon: LucideIcon; label: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-sky-300/15 bg-slate-950/25 p-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-cyan-300/25 bg-cyan-400/10 text-cyan-100"><Icon className="size-3.5" /></span>
      <div>
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="mt-1 text-xs leading-5 text-sky-100/65">{text}</p>
      </div>
    </div>
  );
}

function InstallWarnings({ warnings }: { warnings: DiscoverInstallPreview['warnings'] }) {
  return (
    <section className="rounded-xl border border-orange-400/40 bg-orange-500/10 p-4">
      <h4 className="font-semibold text-orange-100">Warnings and recovery notes</h4>
      <ul className="mt-3 grid gap-2 text-sm leading-6 text-orange-100">
        {warnings.map((warning) => <li key={`${warning.fieldId}-${warning.message}`}>{warning.message}</li>)}
      </ul>
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
