import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function PageShell({
  children,
  className,
  contentClassName,
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <main className={cn('min-h-full bg-slate-800 text-slate-50 rounded-2xl', className)}>
      <div className={cn('mx-auto flex w-full max-w-[96rem] flex-col gap-5 p-4 md:p-5 2xl:px-6', contentClassName)}>
        {children}
      </div>
    </main>
  );
}

