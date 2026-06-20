import { useState } from 'react';
import { CheckCircle2, Copy, Eye, EyeOff, Link2, QrCode, Sparkles, TriangleAlert } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AppSetupField, AppSetupGuide, AppSetupIntegration } from '@/types/app';

export function ApplicationsSetupGuide({ guide }: { guide: AppSetupGuide }) {
  const fields = [...guide.generatedValues, ...guide.copyableFields, ...guide.qrFields];
  const hasContent = fields.length > 0 || guide.integrations.length > 0 || guide.userSteps.length > 0 || guide.automationCapabilities.length > 0;

  if (!hasContent) {
    return null;
  }

  return (
    <section className="grid gap-4 rounded-lg border border-violet-300/20 bg-violet-500/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/25 bg-violet-400/10 px-2.5 py-1 text-xs font-semibold text-violet-200">
            <Sparkles className="size-3.5" />
            {setupKindLabel(guide.kind)}
          </div>
          <h4 className="mt-3 font-bold text-white">Setup details Project OS can help with</h4>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-300">{automationText(guide.automation)}</p>
        </div>
        <Badge className="border-slate-700/40 bg-slate-950/50 text-slate-300" variant="outline">{automationLabel(guide.automation)}</Badge>
      </div>

      {fields.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {fields.map((field) => <SetupFieldCard field={field} key={`${field.label}-${field.value}`} />)}
        </div>
      )}

      {guide.integrations.length > 0 && (
        <div className="grid gap-2 rounded-lg border border-slate-700/30 bg-slate-950/35 p-3">
          <h5 className="text-sm font-bold text-white">Connection opportunities</h5>
          <div className="grid gap-2">
            {guide.integrations.map((integration) => <IntegrationRow integration={integration} key={integration.id} />)}
          </div>
        </div>
      )}

      {guide.automationCapabilities.length > 0 && (
        <div className="rounded-lg border border-slate-700/30 bg-slate-950/35 p-3">
          <h5 className="text-sm font-bold text-white">What Project OS can prepare</h5>
          <ul className="mt-2 grid gap-1 text-sm leading-6 text-slate-300">
            {guide.automationCapabilities.map((capability) => <li key={capability}>{capability}</li>)}
          </ul>
        </div>
      )}

      {guide.userSteps.length > 0 && (
        <div className="rounded-lg border border-slate-700/30 bg-slate-950/35 p-3">
          <h5 className="text-sm font-bold text-white">What you still need to do</h5>
          <ol className="mt-3 grid gap-2 text-sm text-slate-300">
            {guide.userSteps.map((step, index) => (
              <li className="grid grid-cols-[24px_1fr] gap-2" key={step}>
                <span className="grid size-6 place-items-center rounded-full bg-slate-800 text-xs font-bold text-slate-300">{index + 1}</span>
                <span className="leading-6">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function SetupFieldCard({ field }: { field: AppSetupField }) {
  const [visible, setVisible] = useState(!field.sensitive);
  const [copied, setCopied] = useState(false);
  const displayValue = field.sensitive && !visible ? '••••••••••••' : field.value;

  async function copy() {
    await navigator.clipboard.writeText(field.value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="grid gap-3 rounded-lg border border-slate-700/30 bg-slate-900/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase text-slate-500">{field.label}</span>
        <div className="flex items-center gap-1">
          {field.sensitive && (
            <Button className="size-8 border-slate-700/50 bg-slate-950/50 text-slate-300 hover:bg-slate-800" onClick={() => setVisible((current) => !current)} size="icon" type="button" variant="outline">
              {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
          )}
          <Button className="size-8 border-slate-700/50 bg-slate-950/50 text-slate-300 hover:bg-slate-800" onClick={copy} size="icon" type="button" variant="outline">
            <Copy className="size-4" />
          </Button>
        </div>
      </div>
      <div className="min-w-0 rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2 font-mono text-xs text-slate-200">
        <span className="break-all">{displayValue || 'Not configured'}</span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <span className={cn('text-xs', copied ? 'text-emerald-300' : 'text-slate-500')}>{copied ? 'Copied' : field.recoverable ? 'Saved by Project OS' : 'Copy for setup'}</span>
        {field.qr && field.value && (
          <div className="rounded-md bg-white p-2">
            <QRCodeSVG value={field.value} size={80} level="M" />
          </div>
        )}
      </div>
    </div>
  );
}

function IntegrationRow({ integration }: { integration: AppSetupIntegration }) {
  const ready = integration.status === 'ready' || integration.status === 'available';
  return (
    <div className="rounded-lg border border-slate-700/30 bg-slate-900/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={cn('grid size-9 shrink-0 place-items-center rounded-lg', ready ? 'bg-emerald-500/10 text-emerald-200' : 'bg-amber-500/10 text-amber-200')}>
            {ready ? <CheckCircle2 className="size-4" /> : <TriangleAlert className="size-4" />}
          </div>
          <div>
            <h6 className="font-semibold text-white">{integration.name}</h6>
            <p className="mt-1 text-sm leading-6 text-slate-300">{integration.description}</p>
          </div>
        </div>
        <Badge className={cn('border', ready ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200' : 'border-amber-300/25 bg-amber-400/10 text-amber-200')} variant="outline">
          {integrationStatusLabel(integration.status)}
        </Badge>
      </div>
      {integration.plannedActions.length > 0 && (
        <div className="mt-3 grid gap-1 text-sm text-slate-400">
          {integration.plannedActions.map((action) => (
            <p className="flex gap-2" key={action}>
              <Link2 className="mt-0.5 size-3.5 shrink-0 text-slate-500" />
              <span>{action}</span>
            </p>
          ))}
        </div>
      )}
      {integration.requiresApproval && <p className="mt-3 text-xs text-slate-500">Project OS will ask before making this connection automatically.</p>}
    </div>
  );
}

function setupKindLabel(kind: string) {
  const labels: Record<string, string> = {
    basic: 'Basic setup',
    companion: 'Device setup',
    dashboard: 'Dashboard setup',
    integration: 'Integration setup',
    'media-stack': 'Media stack setup',
    infrastructure: 'Infrastructure setup',
  };
  return labels[kind] || kind.replaceAll('-', ' ');
}

function automationLabel(automation: string) {
  const labels: Record<string, string> = {
    manual: 'Manual steps',
    guided: 'Guided',
    ready: 'Prepared',
    planned: 'Planned automation',
  };
  return labels[automation] || automation.replaceAll('-', ' ');
}

function automationText(automation: string) {
  if (automation === 'ready') {
    return 'Project OS has prepared the reusable values and setup details it can manage for this app.';
  }
  if (automation === 'guided') {
    return 'Project OS has prepared the important details and will guide the remaining setup steps.';
  }
  if (automation === 'planned') {
    return 'Project OS can describe the connection now. Automatic wiring will require a future approval step.';
  }
  return 'Project OS shows the important setup details here so they are easy to recover later.';
}

function integrationStatusLabel(status: string) {
  const labels: Record<string, string> = {
    ready: 'Ready to connect',
    missing: 'Install target first',
    available: 'Available',
  };
  return labels[status] || status.replaceAll('-', ' ');
}
