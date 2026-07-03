import { useEffect, useId, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { AlertTriangle, CheckCircle2, Container, HelpCircle, KeyRound, Loader2, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type {
  ApplicationActionHandlers,
  ApplicationSettingsAction,
  ApplicationSettingsFormValues,
  ApplicationSettingsImpact,
  ApplicationSurfaceItem,
} from '../extensions/ApplicationsPage.types';
import { operationBlocksManagement } from '../extensions/ApplicationsPage.operations.js';

type ApplicationSettingsTabProps = {
  actions: Pick<ApplicationActionHandlers, 'onDirtyChange' | 'onSaveSettings' | 'onSettingsPlanRequest' | 'onSetPrivateNetworkAccess'>;
  item: ApplicationSurfaceItem;
  loadingAction: ApplicationSettingsAction | null;
};

const backupFrequencies = ['daily', 'weekly', 'monthly'] as const;
const protocols = ['http', 'https'] as const;

export function ApplicationSettingsTab({ actions, item, loadingAction }: ApplicationSettingsTabProps) {
  const editable = item.managementState === 'managed' && item.settings.canEdit;
  const initialValues = useMemo(
    () => settingsFormValues(item),
    [
      item.id,
      item.settings.autoRepairEnabled,
      item.settings.backupEnabled,
      item.settings.backupFrequency,
      item.settings.backupRetention,
      item.settings.expectedLocalPort,
      item.settings.expectedProtocol,
    ],
  );
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
    defaultValues: initialValues,
  });
  const values = useWatch({ control }) as ApplicationSettingsFormValues;
  const planning = loadingAction === 'planning';
  const saving = loadingAction === 'saving' || isSubmitting;
  const accessChanging = loadingAction === 'private_access';
  const operationBusy = operationBlocksManagement(item.operationState);
  const busy = planning || saving || accessChanging || operationBusy;
  const privateNetwork = privateNetworkStatus(item, accessChanging);

  useEffect(() => {
    reset(initialValues);
    setPendingImpact(null);
    setPendingValues(null);
    setPlanError(null);
  }, [initialValues, reset]);

  useEffect(() => {
    actions.onDirtyChange(item.id, isDirty);
    return () => actions.onDirtyChange(item.id, false);
  }, [actions, isDirty, item.id]);

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
      await actions.onSaveSettings(item.id, pendingValues);
      reset(pendingValues);
      setPendingImpact(null);
      setPendingValues(null);
      setConfirmOpen(false);
    } catch {
      setPlanError('Autark-OS could not save these settings. Review the notification and try again.');
      setConfirmOpen(false);
    }
  };

  return (
    <TooltipProvider>
      <form className="grid gap-4" onSubmit={(event) => void prepareSave(event)}>
        {!editable && (
          <Alert className="border-sky-400/20 bg-slate-900 text-sky-50">
            <AlertTriangle />
            <AlertTitle>Read-only service</AlertTitle>
            <AlertDescription className="text-sky-100/70">
              Autark-OS can show settings for found and pinned services, but it cannot change them until the service is managed here.
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
            <SelectField
              control={control}
              disabled={!editable || busy}
              explanation="This tells Autark-OS whether the local app endpoint should be checked as HTTP or HTTPS."
              label="Local protocol"
              name="expectedProtocol"
              options={protocols}
            />
          </div>
        </FieldSet>

        <FieldSet className="rounded-xl border border-sky-400/20 bg-slate-800 p-3">
          <SettingsSectionHeader icon={KeyRound} status={privateNetwork.status} title="Access" />

          <Field className="rounded-lg border border-sky-400/20 bg-slate-900 px-3 py-2" data-disabled={!editable || busy} orientation="horizontal">
            <FieldContent>
              <SettingLabel
                explanation="When this is on, Autark-OS serves the app across your Tailscale private network with a stable HTTPS link. Turning it off removes that private network route and keeps local access unchanged."
                inputId="private-network-access"
                label="Private network"
              />
              <FieldDescription className="text-sky-100/60">{privateNetwork.description}</FieldDescription>
              {item.settings.privateAccessUrl && (
                <p className="truncate font-mono text-xs text-sky-50/80">{item.settings.privateAccessUrl}</p>
              )}
            </FieldContent>
            <div className="flex shrink-0 items-center gap-2">
              {accessChanging && <Loader2 className="size-4 animate-spin text-cyan-200" />}
              <Switch
                checked={item.settings.tailscaleEnabled}
                disabled={!editable || busy}
                id="private-network-access"
                onCheckedChange={(checked) => void actions.onSetPrivateNetworkAccess(item.id, checked)}
              />
            </div>
          </Field>
        </FieldSet>

        <FieldSet className="rounded-xl border border-sky-400/20 bg-slate-800 p-3">
          <SettingsSectionHeader icon={ShieldCheck} status={values.backupEnabled ? 'Backups on' : 'Backups off'} title="Backups" />

          <div className="grid gap-3 xl:grid-cols-3">
            <SwitchField
              control={control}
              disabled={!editable || busy}
              explanation="When enabled, this app is included in Autark-OS backup policy."
              label="Include in backups"
              name="backupEnabled"
            />
            <SelectField
              control={control}
              disabled={!editable || busy || !values.backupEnabled}
              explanation="How often Autark-OS should create routine restore points for this app."
              label="Backup frequency"
              name="backupFrequency"
              options={backupFrequencies}
            />
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

        <div className="flex flex-col gap-2 rounded-xl border border-sky-400/20 bg-slate-800 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white">{isDirty ? 'Unsaved changes' : 'Settings are current'}</p>
            <p className="mt-1 text-xs leading-5 text-sky-100/60">
              {operationBusy
                ? 'Settings are paused while Autark-OS finishes the current app action.'
                : accessChanging
                  ? 'Settings are paused while Autark-OS updates private network access.'
                  : 'Save checks impact first. Autark-OS will warn before restarting containers.'}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              className="border-sky-400/40 bg-slate-900 text-sky-50 hover:bg-slate-700"
              disabled={!isDirty || busy}
              onClick={() => {
                reset(initialValues);
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

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingImpact?.headline || 'Save app settings?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingImpact?.summary || 'Autark-OS will apply the selected settings.'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {pendingImpact && (
            <div className="grid gap-3 text-sm">
              <SettingsImpactAlert impact={pendingImpact} />
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy || pendingImpact?.saveAllowed === false} onClick={(event) => {
              event.preventDefault();
              void confirmSave();
            }}>
              {saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <CheckCircle2 data-icon="inline-start" />}
              Save settings
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
      <Badge className="bg-slate-900 text-sky-50">{status}</Badge>
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

function SelectField({
  control,
  disabled,
  explanation,
  label,
  name,
  options,
}: {
  control: ReturnType<typeof useForm<ApplicationSettingsFormValues>>['control'];
  disabled: boolean;
  explanation: string;
  label: string;
  name: 'backupFrequency' | 'expectedProtocol';
  options: readonly string[];
}) {
  const inputId = useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Field className="rounded-lg border border-sky-400/20 bg-slate-900 px-3 py-2" data-disabled={disabled}>
          <SettingLabel explanation={explanation} inputId={inputId} label={label} />
          <Select disabled={disabled} onValueChange={field.onChange} value={String(field.value)}>
            <SelectTrigger className="w-full border-sky-400/30 bg-slate-800 text-white" id={inputId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {titleCase(option)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      )}
    />
  );
}

function SettingsImpactAlert({ impact }: { impact: ApplicationSettingsImpact }) {
  const tone = impact.saveAllowed === false || impact.restartRequired || impact.redeployRequired
    ? 'border-orange-400 bg-orange-200 text-orange-950'
    : 'border-emerald-300 bg-emerald-200 text-emerald-950';
  const textTone = impact.saveAllowed === false || impact.restartRequired || impact.redeployRequired ? 'text-orange-900' : 'text-emerald-900';

  return (
    <Alert className={tone}>
      {impact.saveAllowed === false || impact.restartRequired || impact.redeployRequired ? <AlertTriangle /> : <CheckCircle2 />}
      <AlertTitle>{impact.headline || (impact.restartRequired || impact.redeployRequired ? 'Restart required' : 'Safe to save')}</AlertTitle>
      <AlertDescription className={textTone}>
        {impact.changes.length > 0 && (
          <ul className="list-inside list-disc">
            {impact.changes.map((change) => <li key={change}>{change}</li>)}
          </ul>
        )}
        {impact.warnings.length > 0 && (
          <ul className="mt-2 list-inside list-disc">
            {impact.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        )}
        {impact.blockedReasons.length > 0 && (
          <ul className="mt-2 list-inside list-disc">
            {impact.blockedReasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  );
}

function settingsFormValues(item: ApplicationSurfaceItem): ApplicationSettingsFormValues {
  return {
    autoRepairEnabled: item.settings.autoRepairEnabled,
    backupEnabled: item.settings.backupEnabled,
    backupFrequency: normalizeBackupFrequency(item.settings.backupFrequency),
    backupRetention: item.settings.backupRetention,
    expectedProtocol: item.settings.expectedProtocol === 'https' ? 'https' : 'http',
    localPort: item.settings.expectedLocalPort,
  };
}

function privateNetworkStatus(item: ApplicationSurfaceItem, accessChanging: boolean) {
  if (accessChanging) {
    return {
      description: 'Autark-OS is updating the private network route.',
      status: 'Updating',
    };
  }

  if (!item.settings.tailscaleEnabled) {
    return {
      description: 'This app is only available through its local link.',
      status: 'Local access',
    };
  }

  if (item.settings.privateLinkStatus === 'configured' && item.settings.privateAccessUrl) {
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

function normalizeBackupFrequency(frequency: string): ApplicationSettingsFormValues['backupFrequency'] {
  if (frequency === 'weekly' || frequency === 'monthly') {
    return frequency;
  }
  return 'daily';
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
