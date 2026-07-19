import { Check, ShieldCheck, TriangleAlert } from 'lucide-react';
import { StatusBadge, type StatusBadgeTone } from '@/components/autark-os/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { MarketplaceApp } from '@/types/marketplace';

export function AppImage({ app, className, presentation = 'icon', size = 'default' }: { app: MarketplaceApp; className?: string; presentation?: 'icon' | 'artwork'; size?: 'default' | 'large' }) {
  if (presentation === 'artwork') {
    return (
      <span className={cn('relative grid h-24 w-full place-items-center overflow-hidden border-b border-sky-300/10 bg-gradient-to-br from-[#173455] to-[#102644]', className)}>
        <span className="absolute inset-0 bg-gradient-to-t from-slate-950/20 to-transparent" />
        {app.image ? (
          <img alt="" className="relative size-14 object-contain drop-shadow-lg" src={app.image} />
        ) : (
          <span className="relative grid size-14 place-items-center rounded-2xl border border-slate-400/40 bg-slate-800 text-lg font-bold text-cyan-100 shadow-lg shadow-slate-950/20">{app.name.slice(0, 1)}</span>
        )}
      </span>
    );
  }

  return (
    <span className={cn('grid shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-500 bg-slate-700 shadow-lg shadow-slate-950/15', size === 'large' ? 'size-22' : 'size-14', className)}>
      {app.image ? (
        <img alt="" className="h-full w-full object-contain p-2" src={app.image} />
      ) : (
        <span className="text-lg font-bold text-cyan-200">{app.name.slice(0, 1)}</span>
      )}
    </span>
  );
}

export function CatalogConfidenceBadge({ app }: { app: MarketplaceApp }) {
  const verified = catalogVerified(app);
  return (
    <StatusBadge icon={verified ? ShieldCheck : TriangleAlert} tone={verified ? 'success' : 'warning'}>
      {verified ? 'Verified' : 'Validation needed'}
    </StatusBadge>
  );
}

export function catalogVerified(app: MarketplaceApp) {
  return app.supportLevel === 'Ready'
    && app.smokeTests.length > 0
    && app.smokeTests.every((test) => ['Passed', 'Not applicable'].includes(test.status));
}

export function SupportBadge({ level }: { level: string }) {
  return (
    <StatusBadge tone={supportTone(level)}>{level}</StatusBadge>
  );
}

function supportTone(level: string): StatusBadgeTone {
  switch (level) {
    case 'Ready':
      return 'success';
    case 'Advanced':
      return 'warning';
    case 'Needs testing':
      return 'info';
    case 'Experimental':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function marketplaceStatusTone(tone: string): StatusBadgeTone {
  if (tone === 'success') return 'success';
  if (tone === 'warning' || tone === 'observed') return 'warning';
  if (tone === 'danger') return 'danger';
  if (tone === 'info') return 'info';
  return 'neutral';
}

export function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-400">{label}</span>
      <span className="inline-flex items-center gap-1 text-emerald-200">
        <Check className="size-3" />
        {value}
      </span>
    </div>
  );
}

export function FriendlyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-sky-400/25 bg-slate-800 p-4">
      <span className="text-xs text-slate-400">{label}</span>
      <p className="mt-1 font-bold text-slate-50">{value}</p>
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs text-slate-400">{label}</span>
      <strong className="text-sm text-slate-50">{value}</strong>
    </div>
  );
}

export function InfoCard({ title, items }: { title: string; items: string[] }) {
  return (
    <Card className="rounded-lg border-sky-400/25 bg-slate-800 py-0 text-slate-50">
      <CardContent className="p-4">
        <h4 className="font-bold text-slate-50">{title}</h4>
        <ul className="mt-3 grid gap-2 pl-5 text-sm text-slate-400">
          {items.map((item) => <li className="list-disc" key={item}>{item}</li>)}
        </ul>
      </CardContent>
    </Card>
  );
}

export function Config({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="font-bold text-slate-300">{label}</dt>
      <dd className="m-0 text-slate-400">{value}</dd>
    </>
  );
}
