import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function PageShell({
  children,
  className,
  contained = false,
  contentClassName,
}: {
  children: ReactNode;
  className?: string;
  contained?: boolean;
  contentClassName?: string;
}) {
  return (
    <main className={cn(
      contained ? 'h-full min-h-0 overflow-hidden rounded-2xl bg-slate-800 text-slate-50' : 'min-h-full rounded-2xl bg-slate-800 text-slate-50',
      className,
    )}>
      <div className={cn(
        'mx-auto flex w-full flex-col max-w-10xl overflow-hidden',
        contained ? 'h-full min-h-0 gap-4 overflow-y-auto overscroll-contain' : 'gap-5',
        contentClassName,
      )}>
        {children}
      </div>
    </main>
  );
}
