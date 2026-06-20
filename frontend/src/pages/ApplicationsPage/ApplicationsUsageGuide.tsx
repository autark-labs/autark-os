import { useState } from 'react';
import { Copy, Eye, EyeOff, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AppUsageGuide, AppUsageValue } from '@/types/app';

export function ApplicationsUsageGuide({ guide }: { guide: AppUsageGuide }) {
  return (
    <section className="grid gap-4 rounded-lg border border-emerald-300/20 bg-emerald-500/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-200">
            <QrCode className="size-3.5" />
            {serviceKindLabel(guide.kind)}
          </div>
          <h4 className="mt-3 font-bold text-white">{guide.headline}</h4>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-300">{guide.summary}</p>
        </div>
        <span className="rounded-full border border-slate-700/40 px-3 py-1 text-xs font-semibold text-slate-300">{guide.openUrlLabel}</span>
      </div>

      {guide.values.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {guide.values.map((value) => <UsageValueCard key={value.label} value={value} />)}
        </div>
      )}

      {guide.setupSteps.length > 0 && (
        <div className="rounded-lg border border-slate-700/30 bg-slate-950/35 p-3">
          <h5 className="text-sm font-bold text-white">How to use it</h5>
          <ol className="mt-3 grid gap-2 text-sm text-slate-300">
            {guide.setupSteps.map((step, index) => (
              <li className="grid grid-cols-[24px_1fr] gap-2" key={step}>
                <span className="grid size-6 place-items-center rounded-full bg-slate-800 text-xs font-bold text-slate-300">{index + 1}</span>
                <span className="leading-6">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {guide.notes.length > 0 && (
        <div className="grid gap-1 text-xs leading-5 text-slate-400">
          {guide.notes.map((note) => <p key={note}>{note}</p>)}
        </div>
      )}
    </section>
  );
}

function UsageValueCard({ value }: { value: AppUsageValue }) {
  const [visible, setVisible] = useState(!value.sensitive);
  const [copied, setCopied] = useState(false);
  const displayValue = value.sensitive && !visible ? '••••••••••••' : value.value;

  async function copy() {
    await navigator.clipboard.writeText(value.value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="grid gap-3 rounded-lg border border-slate-700/30 bg-slate-900/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase text-slate-500">{value.label}</span>
        <div className="flex items-center gap-1">
          {value.sensitive && (
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
        <span className={cn('text-xs', copied ? 'text-emerald-300' : 'text-slate-500')}>{copied ? 'Copied' : 'Copy for setup'}</span>
        {value.qr && value.value && (
          <div className="rounded-md bg-white p-2">
            <QRCodeSVG value={value.value} size={80} level="M" />
          </div>
        )}
      </div>
    </div>
  );
}

function serviceKindLabel(kind: string) {
  const labels: Record<string, string> = {
    'web-app': 'Application',
    'companion-service': 'Companion service',
    'admin-service': 'Setup service',
    'background-service': 'Background service',
    infrastructure: 'Infrastructure',
  };
  return labels[kind] || kind.replaceAll('-', ' ');
}
