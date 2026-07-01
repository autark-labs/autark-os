import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type SurfaceElement = 'article' | 'aside' | 'div' | 'header' | 'main' | 'nav' | 'section';
type SurfaceTone = 'panel' | 'muted' | 'inset' | 'warning' | 'danger' | 'success' | 'none';

const surfaceToneClass: Record<SurfaceTone, string> = {
  panel: 'rounded-2xl border border-sky-400/30 bg-slate-900 text-slate-50 shadow-xl shadow-slate-950/30',
  muted: 'rounded-xl border border-sky-400/25 bg-slate-800 text-slate-50',
  inset: 'rounded-lg bg-slate-800',
  warning: 'rounded-xl border border-orange-400 bg-orange-200 text-orange-950 shadow-lg shadow-orange-500/20',
  danger: 'rounded-xl border border-red-400/25 bg-red-500/10 text-red-100',
  success: 'rounded-lg border border-emerald-300 bg-emerald-200 text-emerald-950',
  none: '',
};

export type SurfaceProps = HTMLAttributes<HTMLElement> & {
  as?: SurfaceElement;
  tone?: SurfaceTone;
};

export function Surface({ as: Component = 'section', className, tone = 'panel', ...props }: SurfaceProps) {
  return <Component className={cn(surfaceToneClass[tone], className)} {...props} />;
}
