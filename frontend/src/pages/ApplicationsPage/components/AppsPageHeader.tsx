import { AppWindow, Link2, TriangleAlert } from 'lucide-react';
import { Surface } from '@/components/primitives/Surface';
import { cn } from '@/lib/utils';

type AppsPageHeaderProps = {
  attentionCount: number;
  linkedCount: number;
  managedCount: number;
};

const metrics = [
  { key: 'managed', label: 'Managed apps', icon: AppWindow },
  { key: 'linked', label: 'Linked services', icon: Link2 },
  { key: 'attention', label: 'Needs review', icon: TriangleAlert },
] as const;

export function AppsPageHeader({ attentionCount, linkedCount, managedCount }: AppsPageHeaderProps) {
  const values = { attention: attentionCount, linked: linkedCount, managed: managedCount };

  return (
    <Surface as="header" className="overflow-hidden border-sky-300/15 bg-[#07142b]/90 shadow-xl shadow-slate-950/20" tone="panel">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0 space-y-1">
          <h1 className="m-0 text-3xl font-semibold tracking-tight text-white sm:text-[2.1rem]" title="My Apps">My Apps</h1>
          <p className="m-0 text-sm text-sky-100/70">Open, manage, and monitor all apps on your server.</p>
        </div>
        <div className="grid shrink-0 grid-cols-3 gap-2 sm:min-w-[24rem]">
          {metrics.map(({ icon: Icon, key, label }) => (
            <div
              className={cn(
                'flex min-w-0 items-center gap-2 rounded-xl border border-sky-300/15 bg-slate-950/25 px-2.5 py-2',
                key === 'attention' && attentionCount > 0 && 'border-amber-300/30 bg-amber-400/5',
              )}
              key={key}
            >
              <span className={cn(
                'grid size-8 shrink-0 place-items-center rounded-lg border border-cyan-300/15 bg-cyan-400/10 text-cyan-200',
                key === 'linked' && 'border-emerald-300/15 bg-emerald-400/10 text-emerald-200',
                key === 'attention' && 'border-amber-300/15 bg-amber-400/10 text-amber-200',
              )}>
                <Icon aria-hidden="true" className="size-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-semibold leading-none text-white">{values[key]}</span>
                <span className="mt-1 block truncate text-[0.68rem] text-slate-400">{label}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </Surface>
  );
}
