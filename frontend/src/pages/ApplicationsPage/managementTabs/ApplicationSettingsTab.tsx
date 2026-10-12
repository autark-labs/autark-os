import axios from 'axios';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { useEffect, useId, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { AlertTriangle, Container, HelpCircle, KeyRound, Loader2, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SettingsChangeReview } from '@/components/autark-os/SettingsChangeReview';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { MetadataBadge } from '@/components/autark-os/MetadataBadge';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type {
  ApplicationActionHandlers,
  ApplicationSettingsAction,
  ApplicationSettingsFormValues,
  ApplicationSettingsImpact,
  ApplicationSurfaceItem,
} from '../extensions/ApplicationsPage.types';
import { applicationActionRestriction, operationBlocksManagement } from '../extensions/ApplicationsPage.operations';

type ApplicationSettingsTabProps = {
  actions: Pick<ApplicationActionHandlers, 'onDirtyChange' | 'onSaveSettings' | 'onSettingsPlanRequest'>;
  item: ApplicationSurfaceItem;
  loadingAction: ApplicationSettingsAction | null;
};

export function ApplicationSettingsTab({ actions, item, loadingAction }: ApplicationSettingsTabProps) {
  const { settings: projectSettings } = useProjectSettings();
  const settingsRestriction = applicationActionRestriction(item, 'settings');
  const editable = item.settings.canEdit && !settingsRestriction.disabled;
  const { autoRepairEnabled, backupEnabled, backupRetention, expectedLocalPort, desiredAccessMode } = item.settings;
  // Parent dirty-state updates and runtime polling replace the item object.
  // Reconcile changed persisted values through RHF without replacing dirty fields.
  const initialValues = useMemo(() => ({
    desiredAccessMode,
    autoRepairEnabled,
    backupEnabled,
    backupRetention,
    localPort: expectedLocalPort,
  }), [autoRepairEnabled, backupEnabled, backupRetention, expectedLocalPort, desiredAccessMode]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingImpact, setPendingImpact] = useState<ApplicationSettingsImpact | null>(null);
  const [pendingValues, setPendingValues] = useState<ApplicationSettingsFormValues | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const {
    control,
    formState: { isDirty, isSubmitting },
    handleSubmit,
    reset,
  } = useForm<ApplicationSettingsFormValues>({
    values: initialValues,
    resetOptions: { keepDirtyValues: true },
  });
  const values = useWatch({ control }) as ApplicationSettingsFormValues;
  const planning = loadingAction === 'planning';
  const saving = loadingAction === 'saving' || isSubmitting;
  const operationBusy = operationBlocksManagement(item.operation);
  const busy = planning || saving || operationBusy;
  const privateNetwork = privateNetworkStatus(item);

  const onDirtyChange = actions.onDirtyChange;
  useEffect(() => {
    onDirtyChange(item.id, isDirty);
  }, [onDirtyChange, isDirty, item.id]);

  useEffect(() => () => onDirtyChange(item.id, false), [onDirtyChange, item.id]);

  useEffect(() => {
    if (!isDirty) {
      return undefined;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const prepareSave = handleSubmit(async (nextValues) => {
    if (!editable || busy) {
      return;
    }

    setPlanError(null);
    try {
      const plan = await actions.onSettingsPlanRequest(item.id, nextValues);
      if (!plan) {
        setPlanError('Autark-OS could not build a settings plan for this app.');
        return;
      }

      setPendingValues(nextValues);
      setPendingImpact(plan);
      setConfirmOpen(true);
    } catch {
      setPlanError('Autark-OS could not build a settings plan for this app.');
    }
  });

  const confirmSave = async () => {
    if (!pendingValues) {
      return;
    }

    try {
      await actions.onSaveSettings(item.id, pendingValues, pendingImpact!.planId);
      reset(pendingValues, { keepDirtyValues: false });
      setPendingImpact(null);
      setPendingValues(null);
      setConfirmOpen(false);
    } catch (error) {
      const responseLost = axios.isAxiosError(error) && !error.response;
      setPlanError(responseLost
        ? 'The response was lost. Check Activity; retrying this review retrieves the accepted job.'
        : 'Autark-OS could not save these settings. Review the notification and try again.');
      if (!responseLost) setConfirmOpen(false);
    }
  };

  return (
    <TooltipProvider>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => void prepareSave(event)}>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
        {!editable && (
          <Alert className="border-sky-400/20 bg-slate-900 text-sky-50">
            <AlertTriangle />
            <AlertTitle>Settings unavailable</AlertTitle>
            <AlertDescription className="text-sky-100/70">
              {settingsRestriction.disabled
                ? settingsRestriction.reason
                : 'Autark-OS cannot change settings for this app in its current state.'}
            </AlertDescription>
          </Alert>
        )}

        {editable && item.backup !== 'Protected' && (
          <Alert className="border-orange-400/40 bg-orange-200 text-orange-950">
            <AlertTriangle />
            <AlertTitle>No verified restore point</AlertTitle>
            <AlertDescription className="text-orange-900">
              Save only changes you understand. Create a backup before changing container or access posture when the app can safely run one.
            </AlertDescription>
          </Alert>
        )}

        {planError && (
          <Alert className="border-orange-400/40 bg-orange-200 text-orange-950">
            <AlertTriangle />
            <AlertTitle>Could not check changes</AlertTitle>
            <AlertDescription className="text-orange-900">{planError}</AlertDescription>
          </Alert>
        )}

        <FieldSet className="rounded-xl border border-sky-400/20 bg-slate-800 p-3">
          <SettingsSectionHeader icon={Container} status={values.autoRepairEnabled ? 'Automatic repair on' : 'Manual repair'} title="Container" />

          <div className="grid gap-3 xl:grid-cols-2">
            <SwitchField
              control={control}
              disabled={!editable || busy}
              explanation="When enabled, Autark-OS may retry safe container repairs, such as restart-style recovery, when this app drifts."
              label="Safe automatic repair"
              name="autoRepairEnabled"
            />
            <NumberField
              control={control}
              disabled={!editable || busy}
              explanation="Changing this port updates the app address. If the port mapping changes, Autark-OS may rewrite Compose and restart the app."
              label="Local app port"
              min={1}
              name="localPort"
            />
          </div>
        </FieldSet>

        <FieldSet className="rounded-xl border border-sky-400/20 bg-slate-800 p-3">
          <SettingsSectionHeader icon={KeyRound} status={privateNetwork.status} title="Access" />

          <Controller control={control} name="desiredAccessMode" render={({ field }) => (
            <Field className="rounded-lg border border-sky-400/20 bg-slate-900 px-3 py-2">
              <FieldLabel htmlFor="app-access-mode">App reachability</FieldLabel>
              <Select value={field.value} onValueChange={field.onChange} disabled={!editable || busy}>
                <SelectTrigger id="app-access-mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">This server</SelectItem>
                  <SelectItem value="network">Home network / LAN</SelectItem>
                  <SelectItem value="private">Private only / Tailscale</SelectItem>
                  <SelectItem value="local-and-private">LAN + private</SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>Private only removes the LAN dashboard binding. LAN + private keeps both. Save reviews the restart and recovery consequences before applying.</FieldDescription>
              <p className="text-xs text-muted-foreground">{privateNetwork.description}</p>
            </Field>
          )} />
        </FieldSet>

        <FieldSet className="rounded-xl border border-sky-400/20 bg-slate-800 p-3">
          <SettingsSectionHeader icon={ShieldCheck} status={values.backupEnabled ? 'Routine participation on' : 'Routine participation off'} title="Backups" />

          <div className="grid gap-3 xl:grid-cols-3">
            <SwitchField
              control={control}
              disabled={!editable || busy}
              explanation="Scheduled backups temporarily stop this app while copying data, then resume it if it was running."
              label="Include in routine backups"
              name="backupEnabled"
            />
            <Field className="rounded-lg border border-sky-400/20 bg-slate-900 px-3 py-2">
              <p className="text-sm font-medium">Routine schedule</p>
              <p className="text-sm text-muted-foreground">{projectSettings ? `${titleCase(projectSettings.backupFrequency)} · ${projectSettings.automaticBackupsEnabled ? 'Automation on' : 'Automation off'}` : 'Schedule unavailable'}</p>
              <p className="text-xs text-muted-foreground">Shared by all apps. Change it in Settings → Backups. Manual backups remain available when this app is excluded.</p>
            </Field>
            <NumberField
              control={control}
              disabled={!editable || busy || !values.backupEnabled}
              explanation="How many restore points Autark-OS should keep before old ones can be cleaned up."
              label="Backup retention"
              min={1}
              name="backupRetention"
            />
          </div>
        </FieldSet>

        </div>
        <div className="flex shrink-0 items-center justify-between gap-4 border-t border-border px-6 py-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white">{isDirty ? 'Unsaved changes' : 'Settings are current'}</p>
            <p className="mt-1 text-xs leading-5 text-sky-100/60">
              {operationBusy
                ? 'Settings are paused while Autark-OS finishes the current app action.'
                : 'Save checks impact first. Autark-OS will warn before restarting containers.'}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              className="border-sky-400/40 bg-slate-900 text-sky-50 hover:bg-slate-700"
              disabled={!isDirty || busy}
              onClick={() => {
                reset(initialValues, { keepDirtyValues: false });
                setPendingImpact(null);
                setPendingValues(null);
                setPlanError(null);
              }}
              type="button"
              variant="outline"
            >
              <RotateCcw data-icon="inline-start" />
              Reset
            </Button>
            <Button
              className="bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-500/20 hover:bg-cyan-200"
              disabled={!editable || !isDirty || busy}
              type="submit"
            >
              {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
              {planning ? 'Checking changes' : saving ? 'Saving changes' : 'Save changes'}
            </Button>
          </div>
        </div>
      </form>

      <SettingsChangeReview open={confirmOpen} onOpenChange={setConfirmOpen} plan={pendingImpact} busy={busy} cancelDisabled={saving} error={planError} onConfirm={() => void confirmSave()} />
    </TooltipProvider>
  );
}

function SettingsSectionHeader({ icon: Icon, status, title }: { icon: LucideIcon; status: string; title: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="size-4 text-cyan-200" />
        <span className="truncate text-sm font-semibold text-white">{title}</span>
      </div>
      <MetadataBadge>{status}</MetadataBadge>
    </div>
  );
}

function SettingLabel({ explanation, inputId, label }: { explanation: string; inputId?: string; label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {inputId ? (
        <FieldLabel className="min-w-0 text-white" htmlFor={inputId}>
          {label}
        </FieldLabel>
      ) : (
        <span className="min-w-0 text-sm font-medium text-white">{label}</span>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button aria-label={`${label} explanation`} className="size-6 border-sky-400/30 bg-slate-800 text-sky-100 hover:bg-slate-700" size="icon-sm" type="button" variant="outline">
            <HelpCircle />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs border border-sky-400/30 bg-slate-950 text-sky-50 shadow-xl shadow-slate-950/50" side="top" sideOffset={8}>
          {explanation}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function SwitchField({
  control,
  disabled,
  explanation,
  label,
  name,
}: {
  control: ReturnType<typeof useForm<ApplicationSettingsFormValues>>['control'];
  disabled: boolean;
  explanation: string;
  label: string;
  name: 'autoRepairEnabled' | 'backupEnabled';
}) {
  const inputId = useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Field className="rounded-lg border border-sky-400/20 bg-slate-900 px-3 py-2" data-disabled={disabled} orientation="horizontal">
          <FieldContent>
            <SettingLabel explanation={explanation} inputId={inputId} label={label} />
            <FieldDescription className="text-sky-100/60">{field.value ? 'Enabled' : 'Disabled'}</FieldDescription>
          </FieldContent>
          <Switch checked={Boolean(field.value)} disabled={disabled} id={inputId} onCheckedChange={(checked) => field.onChange(checked)} />
        </Field>
      )}
    />
  );
}

function NumberField({
  control,
  disabled,
  explanation,
  label,
  min,
  name,
}: {
  control: ReturnType<typeof useForm<ApplicationSettingsFormValues>>['control'];
  disabled: boolean;
  explanation: string;
  label: string;
  min: number;
  name: 'backupRetention' | 'localPort';
}) {
  const inputId = useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Field className="rounded-lg border border-sky-400/20 bg-slate-900 px-3 py-2" data-disabled={disabled}>
          <SettingLabel explanation={explanation} inputId={inputId} label={label} />
          <Input
            className="border-sky-400/30 bg-slate-800 text-white"
            disabled={disabled}
            id={inputId}
            min={min}
            onChange={(event) => field.onChange(event.target.value === '' ? null : Number(event.target.value))}
            type="number"
            value={field.value ?? ''}
          />
        </Field>
      )}
    />
  );
}

function privateNetworkStatus(item: ApplicationSurfaceItem) {
  if (!item.settings.tailscaleEnabled) {
    return {
      description: 'This app is only available through its local link.',
      status: 'Local access',
    };
  }

  if (item.settings.privateLinkStatus === 'verified' && item.settings.privateAccessUrl) {
    return {
      description: 'This app is available across your Tailscale private network.',
      status: 'Private network on',
    };
  }

  return {
    description: 'Private network access is enabled, but the route needs attention.',
    status: 'Needs repair',
  };
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
