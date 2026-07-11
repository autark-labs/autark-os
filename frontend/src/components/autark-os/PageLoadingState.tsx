import { Loader2 } from 'lucide-react';
import { Surface } from '@/components/primitives/Surface';
import { cn } from '@/lib/utils';

export type PageLoadingStateModel = {
  description: string;
  title: string;
};

type PageLoadingStateProps = {
  className?: string;
  fullScreen?: boolean;
  model: PageLoadingStateModel;
};

/** A calm, keyboard-neutral loading surface for page-level data requests. */
export function PageLoadingState({ className, fullScreen = false, model }: PageLoadingStateProps) {
  const content = (
    <Surface
      aria-live="polite"
      className={cn(
        'grid min-h-[24rem] place-items-center p-8 text-center',
        className,
      )}
      role="status"
      tone="panel"
    >
      <div className="grid max-w-md justify-items-center gap-3">
        <span className="grid size-12 place-items-center rounded-lg border border-cyan-300/35 bg-cyan-400/10 text-cyan-100">
          <Loader2 aria-hidden="true" className="size-5 animate-spin" />
        </span>
        <div>
          <p className="font-black text-white">{model.title}</p>
          <p className="mt-1 text-sm leading-6 text-sky-100/80">{model.description}</p>
        </div>
      </div>
    </Surface>
  );

  if (!fullScreen) {
    return content;
  }

  return <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-slate-50">{content}</main>;
}
