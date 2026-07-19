import { useEffect, useMemo, useState } from 'react';
import { Check, Settings2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProjectDarkControlButton, ProjectPrimaryButton } from '@/components/primitives/ProjectButtons';
import { cn } from '@/lib/utils';
import type { DiscoverInstallIssue, DiscoverSetupInput, DiscoverSetupSchema } from '@/types/discover';

type MarketplaceAppSettingsDialogProps = {
  appName: string;
  answers: Record<string, unknown>;
  issues?: DiscoverInstallIssue[];
  onAnswersChange: (answers: Record<string, unknown>) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  schema: DiscoverSetupSchema;
};

export function appSpecificSetupInputs(schema: DiscoverSetupSchema, answers: Record<string, unknown>) {
  return schema.inputs.filter((input) => {
    const needsAppDecision = input.tier === 'app_specific' || (input.tier === 'required' && isEmptyDefault(input.defaultValue));
    return needsAppDecision && shouldShowInput(input, answers);
  });
}

export function hasAppSpecificSetup(schema: DiscoverSetupSchema, answers: Record<string, unknown>) {
  return appSpecificSetupInputs(schema, answers).length > 0;
}

export function MarketplaceAppSettingsDialog({
  appName,
  answers,
  issues = [],
  onAnswersChange,
  onOpenChange,
  open,
  schema,
}: MarketplaceAppSettingsDialogProps) {
  const [draftAnswers, setDraftAnswers] = useState<Record<string, unknown>>(answers);
  const inputs = useMemo(() => appSpecificSetupInputs(schema, draftAnswers), [draftAnswers, schema]);

  useEffect(() => {
    if (open) {
      setDraftAnswers(answers);
    }
  }, [answers, open, schema.appId]);

  function updateAnswer(inputId: string, value: unknown) {
    setDraftAnswers((current) => ({ ...current, [inputId]: value }));
  }

  function saveSettings() {
    onAnswersChange(draftAnswers);
    onOpenChange(false);
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="border-slate-600 bg-slate-800 text-slate-50 shadow-xl shadow-slate-950/25 sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 text-cyan-200">
            <Settings2 className="size-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">App settings</span>
          </div>
          <DialogTitle className="text-xl text-white">Configure {appName}</DialogTitle>
          <DialogDescription className="leading-6 text-slate-300">
            Autark-OS manages the app name, access, storage, and backups safely. These are the few choices unique to this app.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {inputs.map((input) => (
            <AppSettingField
              input={input}
              key={input.id}
              onChange={(value) => updateAnswer(input.id, value)}
              problem={issues.find((issue) => issue.fieldId === input.id)}
              value={draftAnswers[input.id]}
            />
          ))}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <ProjectDarkControlButton onClick={() => onOpenChange(false)} type="button">Cancel</ProjectDarkControlButton>
          <ProjectPrimaryButton onClick={saveSettings} type="button">
            <Check className="size-4" />
            Save settings
          </ProjectPrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AppSettingField({
  input,
  onChange,
  problem,
  value,
}: {
  input: DiscoverSetupInput;
  onChange: (value: unknown) => void;
  problem?: DiscoverInstallIssue;
  value: unknown;
}) {
  const selectedOption = input.options.find((option) => option.value === value);
  const inputId = `discover-app-setting-${input.id}`;

  return (
    <div className="grid gap-2 rounded-xl border border-slate-600 bg-slate-700/45 p-3">
      <label className="text-sm font-semibold text-white" htmlFor={inputId}>{input.label}</label>
      {input.type === 'choice' ? (
        <Select value={String(value ?? '')} onValueChange={onChange}>
          <SelectTrigger className={cn('h-10 border-slate-500 bg-slate-800 text-slate-50', problem && 'border-orange-400/60')} id={inputId}>
            <SelectValue placeholder="Choose an option" />
          </SelectTrigger>
          <SelectContent className="border-slate-600 bg-slate-800 text-slate-50">
            {input.options.map((option) => (
              <SelectItem className="focus:bg-slate-700 focus:text-white" key={option.value} value={option.value}>
                {option.label}{option.recommended ? ' (Recommended)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          className={cn('h-10 border-slate-500 bg-slate-800 text-slate-50 placeholder:text-slate-400', problem && 'border-orange-400/60')}
          id={inputId}
          inputMode={input.type === 'number-or-auto' ? 'numeric' : undefined}
          onChange={(event) => onChange(input.type === 'number-or-auto' ? normalizeNumberOrAuto(event.target.value) : event.target.value)}
          type="text"
          value={String(value ?? '')}
        />
      )}
      <p className={cn('text-xs leading-5 text-slate-300', problem && 'text-orange-200')}>
        {problem?.message || selectedOption?.description || input.help}
      </p>
    </div>
  );
}

function isEmptyDefault(value: unknown) {
  return value === null || value === undefined || value === '';
}

function shouldShowInput(input: DiscoverSetupInput, answers: Record<string, unknown>) {
  if (!input.showWhen || Object.keys(input.showWhen).length === 0) {
    return true;
  }
  return Object.entries(input.showWhen).every(([fieldId, expected]) => answers[fieldId] === expected);
}

function normalizeNumberOrAuto(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'auto') {
    return 'auto';
  }
  return Number(trimmed);
}
