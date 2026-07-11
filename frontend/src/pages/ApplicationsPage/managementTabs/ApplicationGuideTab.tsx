import { ExternalLink, KeyRound, ListChecks, QrCode, Sparkles } from 'lucide-react';
import { CopyField } from '@/components/autark-os/CopyField';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ApplicationSurfaceItem } from '../extensions/ApplicationsPage.types';

export function ApplicationGuideTab({ item }: { item: ApplicationSurfaceItem }) {
  const { setupGuide, usageGuide } = item.runtime;
  const copyableFields = setupGuide?.copyableFields ?? [];
  const generatedValues = setupGuide?.generatedValues ?? [];
  const qrFields = setupGuide?.qrFields ?? [];
  const usageValues = usageGuide?.values ?? [];
  const setupSteps = setupGuide?.userSteps?.length ? setupGuide.userSteps : usageGuide?.setupSteps ?? [];
  const notes = usageGuide?.notes ?? [];

  if (!setupGuide && !usageGuide && !item.href) {
    return (
      <section className="rounded-xl border border-sky-400/20 bg-slate-800 p-3">
        <p className="text-sm font-semibold text-white">No guide available</p>
        <p className="mt-1 text-sm leading-6 text-sky-100/70">
          Autark-OS does not have app-specific setup details for this service yet.
        </p>
      </section>
    );
  }

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 rounded-xl border border-sky-400/20 bg-slate-800 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">{usageGuide?.headline || item.name}</p>
            <p className="mt-1 text-sm leading-6 text-sky-100/70">
              {usageGuide?.summary || item.description}
            </p>
          </div>
          <Badge className="w-fit bg-slate-900 text-sky-50">{setupGuide?.automation || usageGuide?.kind || item.managementState}</Badge>
        </div>

        {item.href && (
          <Button asChild className="w-fit bg-cyan-300 text-slate-950 hover:bg-cyan-200">
            <a href={item.href} rel="noreferrer" target="_blank">
              <ExternalLink data-icon="inline-start" />
              {usageGuide?.openUrlLabel || usageGuide?.primaryAction || 'Open app'}
            </a>
          </Button>
        )}
      </section>

      {(copyableFields.length > 0 || generatedValues.length > 0 || usageValues.length > 0) && (
        <section className="grid gap-2 rounded-xl border border-sky-400/20 bg-slate-800 p-3">
          <SectionTitle icon={KeyRound} title="Values" />
          <div className="grid gap-2 sm:grid-cols-2">
            {copyableFields.map((field) => <CopyField key={`copy-${field.label}`} model={field} />)}
            {generatedValues.map((field) => <CopyField key={`generated-${field.label}`} model={field} />)}
            {usageValues.map((value) => <CopyField key={`usage-${value.label}`} model={value} />)}
          </div>
        </section>
      )}

      {qrFields.length > 0 && (
        <section className="grid gap-2 rounded-xl border border-sky-400/20 bg-slate-800 p-3">
          <SectionTitle icon={QrCode} title="QR values" />
          <div className="grid gap-2 sm:grid-cols-2">
          {qrFields.map((field) => <CopyField key={`qr-${field.label}`} model={field} />)}
          </div>
        </section>
      )}

      {setupSteps.length > 0 && (
        <section className="grid gap-2 rounded-xl border border-sky-400/20 bg-slate-800 p-3">
          <SectionTitle icon={ListChecks} title="Setup" />
          {setupSteps.map((step, index) => <StepRow index={index + 1} key={`${index}-${step}`} text={step} />)}
        </section>
      )}

      {notes.length > 0 && (
        <section className="grid gap-2 rounded-xl border border-sky-400/20 bg-slate-800 p-3">
          <SectionTitle icon={Sparkles} title="Notes" />
          {notes.map((note) => (
            <p className="rounded-lg bg-slate-900 px-3 py-2 text-sm leading-6 text-sky-50" key={note}>{note}</p>
          ))}
        </section>
      )}
    </div>
  );
}

function StepRow({ index, text }: { index: number; text: string }) {
  return (
    <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm text-sky-50">
      <span className="grid size-6 place-items-center rounded-full bg-slate-800 text-xs font-semibold text-sky-100">{index}</span>
      <span className="leading-6">{text}</span>
    </div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: typeof KeyRound; title: string }) {
  return (
    <span className="flex items-center gap-2 text-sm font-semibold text-white">
      <Icon data-icon="inline-start" />
      {title}
    </span>
  );
}
