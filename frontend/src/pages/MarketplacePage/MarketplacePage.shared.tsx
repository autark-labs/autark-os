import { Check, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { MarketplaceApp } from '@/types/marketplace';

export function AppImage({ app, size = 'default' }: { app: MarketplaceApp; size?: 'default' | 'large' }) {
  return (
    <span className={cn('grid shrink-0 place-items-center overflow-hidden rounded-lg border border-sky-400/25 bg-slate-950 shadow-lg shadow-slate-950/20', size === 'large' ? 'size-22' : 'size-14')}>
      {app.image ? (
        <img alt="" className="h-full w-full object-cover" src={app.image} />
      ) : (
        <span className="text-lg font-bold text-cyan-200">{app.name.slice(0, 1)}</span>
      )}
    </span>
  );
}

export function CatalogConfidenceBadge({ app }: { app: MarketplaceApp }) {
  const verified = catalogVerified(app);
  return (
    <Badge className={cn('gap-1', verified ? 'border-emerald-300/35 bg-emerald-500/10 text-emerald-200' : 'border-orange-400/40 bg-orange-500/10 text-orange-200')} variant="outline">
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
      return 'border-emerald-300/35 bg-emerald-500/10 text-emerald-200';
    case 'Advanced':
      return 'border-orange-400/40 bg-orange-500/10 text-orange-200';
    case 'Needs testing':
      return 'border-cyan-300/35 bg-cyan-400/10 text-cyan-200';
    case 'Experimental':
      return 'border-red-400/35 bg-red-500/10 text-red-200';
    default:
      return 'border-sky-400/25 bg-slate-800 text-slate-300';
  }
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
