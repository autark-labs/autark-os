import { Check, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { MarketplaceApp } from '@/types/marketplace';

export function AppImage({ app, size = 'default' }: { app: MarketplaceApp; size?: 'default' | 'large' }) {
  return (
    <span className={cn('grid shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-slate-950 shadow-po-card', size === 'large' ? 'size-22' : 'size-14')}>
      {app.image ? (
        <img alt="" className="h-full w-full object-cover" src={app.image} />
      ) : (
        <span className="text-lg font-bold text-violet-100">{app.name.slice(0, 1)}</span>
      )}
    </span>
  );
}

export function CatalogConfidenceBadge({ app }: { app: MarketplaceApp }) {
  const verified = catalogVerified(app);
  return (
    <Badge className={cn('gap-1', verified ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200' : 'border-amber-400/30 bg-amber-500/10 text-amber-200')} variant="outline">
      {verified ? <ShieldCheck className="size-3" /> : <TriangleAlert className="size-3" />}
      {verified ? 'Verified' : 'Validation needed'}
    </Badge>
  );
}

export function catalogVerified(app: MarketplaceApp) {
  return app.supportLevel === 'Ready'
    && app.smokeTests.length > 0
    && app.smokeTests.every((test) => ['Passed', 'Not applicable'].includes(test.status));
}

export function SupportBadge({ level }: { level: string }) {
  const tone = supportTone(level);
  return (
    <Badge className={cn('gap-1 border px-2.5 py-1', tone)} variant="outline">
      {level}
    </Badge>
  );
}

function supportTone(level: string) {
  switch (level) {
    case 'Ready':
      return 'border-emerald-300/30 bg-emerald-500/10 text-emerald-200';
    case 'Advanced':
      return 'border-amber-300/30 bg-amber-500/10 text-amber-200';
    case 'Needs testing':
      return 'border-sky-300/30 bg-sky-500/10 text-sky-200';
    case 'Experimental':
      return 'border-red-300/30 bg-red-500/10 text-red-200';
    default:
      return 'border-slate-700/40 bg-slate-900/70 text-slate-300';
  }
}

export function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-400">{label}</span>
      <span className="inline-flex items-center gap-1 text-emerald-300">
        <Check className="size-3" />
        {value}
      </span>
    </div>
  );
}

export function FriendlyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-700/30 bg-slate-950/30 p-4">
      <span className="text-xs text-slate-500">{label}</span>
      <p className="mt-1 font-bold text-white">{value}</p>
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs text-slate-500">{label}</span>
      <strong className="text-sm text-white">{value}</strong>
    </div>
  );
}

export function InfoCard({ title, items }: { title: string; items: string[] }) {
  return (
    <Card className="rounded-lg border-slate-700/30 bg-slate-950/30 py-0 text-slate-100">
      <CardContent className="p-4">
        <h4 className="font-bold text-white">{title}</h4>
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
      <dt className="font-bold text-slate-200">{label}</dt>
      <dd className="m-0 text-slate-400">{value}</dd>
    </>
  );
}
