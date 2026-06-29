import { useEffect, useId, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { AlertTriangle, CheckCircle2, Container, KeyRound, Loader2, RotateCcw, Save } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type {
  ApplicationActionHandlers,
  ApplicationSettingsAction,
  ApplicationSettingsFormValues,
  ApplicationSettingsImpact,
  ApplicationSurfaceItem,
} from '../extensions/ApplicationsPage.types';

type ApplicationSettingsTabProps = {
  actions: Pick<ApplicationActionHandlers, 'onDirtyChange' | 'onSaveSettings' | 'onSettingsPlanRequest'>;
  item: ApplicationSurfaceItem;
  loadingAction: ApplicationSettingsAction | null;
};

export function ApplicationSettingsTab({ actions, item, loadingAction }: ApplicationSettingsTabProps) {
  const editable = item.kind === 'managed' && item.settings.canEdit;
  const initialValues = useMemo(() => settingsFormValues(item), [item.id, item.settings.autoRepairEnabled, item.settings.tailscaleEnabled]);
  const [impact, setImpact] = useState<ApplicationSettingsImpact | null>(null);
  const [planning, setPlanning] = useState(false);
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
  const saving = loadingAction === 'saving' || isSubmitting;

  useEffect(() => {
    reset(initialValues);
    setImpact(null);
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

  useEffect(() => {
    if (!editable || !isDirty) {
      setImpact(null);
      setPlanError(null);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setPlanning(true);
      setPlanError(null);
      try {
        const plan = await actions.onSettingsPlanRequest(item.id, {
          autoRepairEnabled: Boolean(values.autoRepairEnabled),
          tailscaleEnabled: Boolean(values.tailscaleEnabled),
        });
        if (!cancelled) {
          setImpact(plan);
        }
      } catch {
        if (!cancelled) {
          setImpact(null);
          setPlanError('Project OS could not check the impact of these settings yet.');
        }
      } finally {
        if (!cancelled) {
          setPlanning(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [actions, editable, isDirty, item.id, values.autoRepairEnabled, values.tailscaleEnabled]);

  const submit = handleSubmit(async (values) => {
    await actions.onSaveSettings(item.id, values);
    reset(values);
    setImpact(null);
  });

  return (
    <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
      <FieldSet className="rounded-xl border border-sky-400/20 bg-slate-800 p-3">
        <SettingsSectionHeader icon={Container} status={values.autoRepairEnabled ? 'Automatic fixes on' : 'Watching only'} title="Container posture" />

        <div className="grid gap-2 sm:grid-cols-2">
          <PostureFact label="Runtime" value={item.settings.containerStatus || item.status} />
          <PostureFact label="Detail" value={item.settings.containerDetail} />
        </div>

        <ControlledSwitch
          control={control}
          disabled={!editable || saving}
          label="Safe automatic repair"
          name="autoRepairEnabled"
          offCopy="Project OS will only report container problems for this app."
          onCopy="Project OS may restart the container or retry safe repairs when the app drifts."
        />
      </FieldSet>

      <FieldSet className="rounded-xl border border-sky-400/20 bg-slate-800 p-3">
        <SettingsSectionHeader icon={KeyRound} status={values.tailscaleEnabled ? 'Private access selected' : 'Local access'} title="Tailscale posture" />

        <div className="grid gap-2 sm:grid-cols-2">
          <PostureFact label="Desired access" value={accessModeLabel(item.settings.desiredAccessMode)} />
          <PostureFact label="Private link" value={privateLinkLabel(item)} />
        </div>

        <ControlledSwitch
          control={control}
          disabled={!editable || saving}
          label="Private access with Tailscale"
          name="tailscaleEnabled"
          offCopy="This app stays local to this server unless another route already exposes it."
          onCopy="Project OS will request a private Tailscale link for trusted devices."
        />

        {!editable && (
          <Alert className="border-sky-400/20 bg-slate-900 text-sky-50">
            <AlertTriangle />
            <AlertTitle>Read-only service</AlertTitle>
            <AlertDescription className="text-sky-100/70">
              Found and pinned services are read-only here. Review or recover the service before Project OS changes its container or access posture.
            </AlertDescription>
          </Alert>
        )}
      </FieldSet>

      <SettingsImpactAlert impact={impact} planning={planning} planError={planError} />

      <div className="flex flex-col gap-2 rounded-xl border border-sky-400/20 bg-slate-800 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">{isDirty ? 'Unsaved changes' : 'Settings are current'}</p>
          <p className="mt-1 text-xs leading-5 text-sky-100/60">
            Save applies both container and Tailscale posture together. Reset returns this form to the last saved state.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            className="border-sky-400/40 bg-slate-900 text-sky-50 hover:bg-slate-700"
            disabled={!isDirty || saving}
            onClick={() => {
              reset(initialValues);
              setImpact(null);
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
            disabled={!editable || !isDirty || saving || planning || impact?.saveAllowed === false}
            type="submit"
          >
            {saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
            {saving ? 'Saving changes' : 'Save changes'}
          </Button>
        </div>
      </div>
    </form>
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

function PostureFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-900 px-3 py-2">
      <p className="text-xs font-medium text-sky-100/60">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-white">{value || 'Not reported'}</p>
    </div>
  );
}

function ControlledSwitch({
  control,
  disabled,
  label,
  name,
  offCopy,
  onCopy,
}: {
  control: ReturnType<typeof useForm<ApplicationSettingsFormValues>>['control'];
  disabled: boolean;
  label: string;
  name: keyof ApplicationSettingsFormValues;
  offCopy: string;
  onCopy: string;
}) {
  const inputId = useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => {
        const toggleField = () => {
          if (!disabled) {
            field.onChange(!field.value);
          }
        };

        const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleField();
          }
        };

        return (
          <Field
            aria-checked={field.value}
            aria-disabled={disabled}
            className={cn(
              'rounded-lg border border-sky-400/20 bg-slate-900 px-3 py-2 transition-colors',
              disabled ? 'opacity-80' : 'cursor-pointer hover:border-cyan-300/50 hover:bg-slate-800',
            )}
            data-disabled={disabled}
            onClick={() => toggleField()}
            onKeyDown={(event) => handleKeyDown(event)}
            orientation="horizontal"
            role="switch"
            tabIndex={disabled ? -1 : 0}
          >
            <FieldContent>
              <FieldLabel className="cursor-inherit text-white" htmlFor={inputId}>{label}</FieldLabel>
              <FieldDescription className="text-sky-100/60">
                {field.value ? onCopy : offCopy}
              </FieldDescription>
            </FieldContent>
            <Switch
              checked={field.value}
              disabled={disabled}
              id={inputId}
              onCheckedChange={field.onChange}
              onClick={(event) => event.stopPropagation()}
              size="sm"
              tabIndex={-1}
            />
          </Field>
        );
      }}
    />
  );
}

function SettingsImpactAlert({ impact, planning, planError }: { impact: ApplicationSettingsImpact | null; planning: boolean; planError: string | null }) {
  if (planning) {
    return (
      <Alert className="border-sky-400/20 bg-slate-800 text-sky-50">
        <Loader2 className="animate-spin" />
        <AlertTitle>Checking impact</AlertTitle>
        <AlertDescription className="text-sky-100/70">Project OS is checking whether these changes need a restart.</AlertDescription>
      </Alert>
    );
  }

  if (planError) {
    return (
      <Alert className="border-orange-400/40 bg-orange-200 text-orange-950">
        <AlertTriangle />
        <AlertTitle>Impact unavailable</AlertTitle>
        <AlertDescription className="text-orange-900">{planError}</AlertDescription>
      </Alert>
    );
  }

  if (!impact) {
    return (
      <Alert className="border-emerald-300/40 bg-emerald-200 text-emerald-950">
        <CheckCircle2 />
        <AlertTitle>No unsaved posture changes</AlertTitle>
        <AlertDescription className="text-emerald-900">No restart expected until settings change.</AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className={impact.restartRequired ? 'border-orange-400 bg-orange-200 text-orange-950' : 'border-emerald-300 bg-emerald-200 text-emerald-950'}>
      {impact.restartRequired ? <AlertTriangle /> : <CheckCircle2 />}
      <AlertTitle>{impact.restartRequired ? 'Restart required' : 'No restart expected'}</AlertTitle>
      <AlertDescription className={impact.restartRequired ? 'text-orange-900' : 'text-emerald-900'}>
        <p>{impact.summary}</p>
        {impact.changes.length > 0 && (
          <ul className="mt-2 list-inside list-disc">
            {impact.changes.map((change) => <li key={change}>{change}</li>)}
          </ul>
        )}
        {impact.warnings.length > 0 && (
          <ul className="mt-2 list-inside list-disc">
            {impact.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  );
}

function settingsFormValues(item: ApplicationSurfaceItem): ApplicationSettingsFormValues {
  return {
    autoRepairEnabled: item.settings.autoRepairEnabled,
    tailscaleEnabled: item.settings.tailscaleEnabled,
  };
}

function accessModeLabel(mode: string) {
  if (mode === 'local-and-private') return 'Local and private';
  if (mode === 'private') return 'Private only';
  if (mode === 'public') return 'Public';
  if (mode === 'network') return 'Network';
  return 'Local';
}

function privateLinkLabel(item: ApplicationSurfaceItem) {
  if (item.settings.privateAccessUrl) {
    return item.settings.privateAccessUrl;
  }
  if (item.settings.privateLinkStatus === 'configured') {
    return 'Configured';
  }
  if (item.settings.privateAccessRequired) {
    return 'Required';
  }
  return item.settings.privateLinkStatus || 'Not configured';
}
