import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Surface } from '@/components/primitives/Surface';

export function PageHeader({ children, description, icon: Icon, metrics = [], title }: {
  children?: ReactNode;
  description: string;
  icon: LucideIcon;
  metrics?: { label: string; value: string | number | null }[];
  title: string;
}) {
  return (
    <Surface as="header" className="flex shrink-0 flex-wrap items-center gap-4 border-border/50 bg-app-header-surface p-5" tone="panel">
      <div className="flex min-w-0 flex-1 basis-72 items-center gap-3">
        <span className="shrink-0 rounded-xl border border-primary/30 bg-primary/10 p-3 text-primary"><Icon aria-hidden="true" className="size-5" /></span>
        <div className="min-w-0"><h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>
      </div>
      <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-4">
        {metrics.length > 0 && <dl className="flex flex-wrap items-center gap-5">
          {metrics.map(({ label, value }) => <div key={label} className="flex w-44 items-baseline gap-2"><dd className="text-base font-semibold tabular-nums text-foreground">{value ?? 'Unknown'}</dd><dt className="text-xs text-muted-foreground">{label}</dt></div>)}
        </dl>}
        <div className="flex max-w-full flex-wrap items-center justify-end gap-2">{children}</div>
      </div>
    </Surface>
  );
}
