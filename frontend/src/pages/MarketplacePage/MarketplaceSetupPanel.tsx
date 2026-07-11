import { CheckCircle2, HelpCircle, Info, ShieldCheck, TriangleAlert } from 'lucide-react';
import { MetadataBadge } from '@/components/autark-os/MetadataBadge';
import { StatusBadge } from '@/components/autark-os/StatusBadge';
import { ProjectDarkControlButton } from '@/components/primitives/ProjectButtons';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { DiscoverInstallIssue, DiscoverInstallPreview, DiscoverSetupInput, DiscoverSetupSchema } from '@/types/discover';
import type { MarketplaceApp } from '@/types/marketplace';

type SetupAnswers = Record<string, unknown>;

const GROUPS: Array<{ id: DiscoverSetupInput['tier']; label: string; description: string }> = [
  { id: 'required', label: 'Required setup', description: 'Choices Autark-OS needs before it can install the app.' },
  { id: 'recommended', label: 'Recommended setup', description: 'Good defaults for access, storage, and protection.' },
  { id: 'app_specific', label: 'App-specific setup', description: 'Choices that matter for this app.' },
  { id: 'advanced', label: 'Advanced options', description: 'Use only when you need a specific local port or approved advanced setting.' },
];

export function defaultAnswersFromSchema(schema: DiscoverSetupSchema | null | undefined) {
  if (!schema) {
    return {};
  }
  return Object.fromEntries(schema.inputs.map((input) => [input.id, input.defaultValue ?? '']));
}

export function MarketplaceSetupPanel({
  app,
  answers,
  onAnswersChange,
  preview,
  schema,
}: {
  app: MarketplaceApp;
  answers: SetupAnswers;
  onAnswersChange: (answers: SetupAnswers) => void;
  preview: DiscoverInstallPreview | null;
  schema: DiscoverSetupSchema;
}) {
  function updateAnswer(fieldId: string, value: unknown) {
    onAnswersChange({ ...answers, [fieldId]: value });
  }

  return (
    <section className="grid gap-4 rounded-lg border border-sky-400/25 bg-slate-800 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <MetadataBadge tone="info">Guided setup</MetadataBadge>
          <h4 className="mt-3 font-bold text-slate-50">Choose how {app.name} should start</h4>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            These choices come from Autark-OS and are checked on the server before install.
          </p>
        </div>
        <StatusBadge tone={preview?.valid ?? true ? 'success' : 'warning'}>
          {preview?.valid ?? true ? 'Ready to review' : 'Needs a choice'}
        </StatusBadge>
      </div>

      <div className="grid gap-4">
        {GROUPS.map((group) => {
          const inputs = schema.inputs.filter((input) => input.tier === group.id && shouldShowInput(input, answers));
          if (inputs.length === 0) {
            return null;
          }
          if (group.id === 'advanced') {
            return (
              <Collapsible className="grid gap-3 rounded-lg border border-sky-400/25 bg-slate-900 p-3" key={group.id}>
                <CollapsibleTrigger className="flex w-full cursor-pointer items-start justify-between gap-3 text-left">
                  <span>
                    <span className="block text-sm font-bold text-slate-50">{group.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-400">{group.description}</span>
                  </span>
                  <MetadataBadge>Optional</MetadataBadge>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-3 grid gap-3">
                    {inputs.map((input) => (
                      <SetupField
                        input={input}
                        key={input.id}
                        problem={preview?.blockingIssues.find((blocker) => blocker.fieldId === input.id)}
                        value={answers[input.id]}
                        onChange={(value) => updateAnswer(input.id, value)}
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          }
          return (
            <div className="grid gap-3 rounded-lg border border-sky-400/25 bg-slate-900 p-3" key={group.id}>
              <div>
                <h5 className="text-sm font-bold text-slate-50">{group.label}</h5>
                <p className="mt-1 text-xs leading-5 text-slate-400">{group.description}</p>
              </div>
              <div className="grid gap-3">
                {inputs.map((input) => (
                  <SetupField
                    input={input}
                    key={input.id}
                    problem={preview?.blockingIssues.find((blocker) => blocker.fieldId === input.id)}
                    value={answers[input.id]}
                    onChange={(value) => updateAnswer(input.id, value)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {preview && preview.blockingIssues.length > 0 && (
        <div className="rounded-lg border border-orange-400/40 bg-orange-500/10 p-3 text-sm text-orange-200">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-orange-200" />
            <div>
              <p className="font-semibold text-current">Finish setup before installing</p>
              <ul className="mt-1 grid gap-1 leading-6">
                {preview.blockingIssues.map((blocker) => <li key={blocker.fieldId}>{blocker.message}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function InstallPlanPreview({ preview }: { preview: DiscoverInstallPreview | null }) {
  const sections = preview?.sections ?? [];
  const icons = {
    create: CheckCircle2,
    connect: Info,
    protect: ShieldCheck,
    check: CheckCircle2,
    afterInstall: Info,
  } as const;

  return (
    <section className="grid gap-4 rounded-lg border border-sky-400/25 bg-slate-800 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-bold text-slate-50">Install preview</h4>
          <p className="mt-1 text-sm leading-6 text-slate-400">Plain-language summary from the backend before Autark-OS changes this server.</p>
        </div>
        <StatusBadge tone={preview?.valid ?? true ? 'success' : 'warning'}>
          {preview?.valid ?? true ? 'Ready' : 'Needs setup'}
        </StatusBadge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {sections.map((section) => {
          const Icon = icons[section.id as keyof typeof icons] ?? Info;
          return (
            <div className="rounded-lg border border-sky-400/25 bg-slate-900 p-3" key={section.id}>
              <div className="flex items-center gap-2">
                <Icon className="size-4 text-cyan-200" />
                <h5 className="text-sm font-bold text-slate-50">{section.title}</h5>
              </div>
              <ul className="mt-2 grid gap-2 text-sm leading-6 text-slate-300">
                {section.items.map((item) => (
                  <li className={cn(item.tone === 'warning' && 'text-orange-200', item.tone === 'success' && 'text-emerald-200')} key={item.label}>
                    {item.label}
                    {item.description && <span className="mt-0.5 block text-xs leading-5 text-slate-400">{item.description}</span>}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {preview && preview.warnings.length > 0 && (
        <div className="rounded-lg border border-orange-400/40 bg-orange-500/10 p-3 text-sm leading-6 text-orange-200">
          {preview.warnings.map((warning) => <p key={warning.fieldId}>{warning.message}</p>)}
        </div>
      )}
    </section>
  );
}

export function SetupSummaryList({
  answers,
  schema,
}: {
  answers: SetupAnswers;
  schema: DiscoverSetupSchema;
}) {
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {schema.inputs.filter((input) => shouldShowInput(input, answers)).map((input) => (
        <div className="rounded-lg border border-sky-400/25 bg-slate-800 p-3" key={input.id}>
          <dt className="text-xs font-semibold uppercase tracking-normal text-slate-400">{input.label}</dt>
          <dd className="mt-1 text-sm font-medium text-slate-50">{displayValue(input, answers[input.id])}</dd>
        </div>
      ))}
    </dl>
  );
}

function SetupField({
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
  const selectedOption = input.options?.find((option) => option.value === value);
  const inputId = `marketplace-setup-${input.id}`;
  return (
    <div className="grid gap-2 text-sm">
      <span className="flex items-center justify-between gap-3">
        <label className="font-semibold text-slate-300" htmlFor={inputId}>{input.label}</label>
        {input.help && (
          <Popover>
            <PopoverTrigger asChild>
              <ProjectDarkControlButton aria-label={`${input.label} help`} size="icon" type="button">
                <HelpCircle className="size-4" />
              </ProjectDarkControlButton>
            </PopoverTrigger>
            <PopoverContent className="border-sky-400/30 bg-slate-900 text-slate-100 shadow-xl shadow-slate-950/30">
              <p className="text-sm leading-6">{input.help}</p>
            </PopoverContent>
          </Popover>
        )}
      </span>

      {input.type === 'choice' && (
        <>
          <Select value={String(value ?? '')} onValueChange={onChange}>
            <SelectTrigger className={cn('h-10 w-full border-sky-400/25 bg-slate-900 text-slate-50', problem && 'border-orange-400/40')} id={inputId}>
              <SelectValue placeholder="Choose an option" />
            </SelectTrigger>
            <SelectContent className="border-sky-400/30 bg-slate-900 text-slate-50 shadow-xl shadow-slate-950/30">
              {input.options?.map((option) => (
                <SelectItem className="focus:bg-slate-700 focus:text-white" key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedOption?.description && <span className="text-xs leading-5 text-slate-400">{selectedOption.description}</span>}
        </>
      )}

      {input.type !== 'choice' && (
        <Input
          className={cn('border-sky-400/25 bg-slate-900 text-slate-50 placeholder:text-slate-400', problem && 'border-orange-400/40')}
          id={inputId}
          inputMode={input.type === 'number-or-auto' ? 'numeric' : undefined}
          onChange={(event) => onChange(input.type === 'number-or-auto' ? normalizePortValue(event.target.value) : event.target.value)}
          placeholder={input.type === 'number-or-auto' ? 'Auto' : undefined}
          type="text"
          value={String(value ?? '')}
        />
      )}

      {problem && (
        <>
          <Separator className="bg-orange-400/40" />
          <span className="text-xs leading-5 text-orange-200">{problem.message}</span>
        </>
      )}
    </div>
  );
}

function shouldShowInput(input: DiscoverSetupInput, answers: SetupAnswers) {
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

function displayValue(input: DiscoverSetupInput, value: unknown) {
  const option = input.options.find((candidate) => candidate.value === value);
  if (option) {
    return option.label;
  }
  if (value == null || value === '') {
    return 'Not selected';
  }
  return String(value);
}
