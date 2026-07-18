import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Surface } from '@/components/primitives/Surface';
import { cn } from '@/lib/utils';

export type PageLoadErrorModel = {
  actionLabel?: string;
  message: string;
  title: string;
};

type PageLoadErrorProps = {
  className?: string;
  fullScreen?: boolean;
  model: PageLoadErrorModel;
  onDismiss?: () => void;
  onRetry?: () => void;
};

/** A user-safe page error with one clearly focused retry action. */
export function PageLoadError({ className, fullScreen = false, model, onDismiss, onRetry }: PageLoadErrorProps) {
  const content = (
    <Surface
      className={cn('border-red-400/35 bg-red-500/10 p-4 text-red-100', className)}
      role="alert"
      tone="danger"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <div className="min-w-0">
            <p className="font-bold text-current">{model.title}</p>
            <p className="mt-1 text-sm leading-6 text-current/80">{model.message}</p>
          </div>
        </div>
        {(onRetry || onDismiss) && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {onRetry && (
              <Button autoFocus className="border-red-300/30 bg-slate-900 text-red-100 hover:bg-red-500/20" onClick={onRetry} size="sm" type="button" variant="outline">
                <RefreshCw data-icon="inline-start" />
                {model.actionLabel || 'Try again'}
              </Button>
            )}
            {onDismiss && (
              <Button aria-label={`Dismiss ${model.title}`} className="border-red-300/20 bg-transparent text-red-100 hover:bg-red-500/15" onClick={onDismiss} size="sm" type="button" variant="outline">
                <X aria-hidden="true" className="size-4" />
                Dismiss
              </Button>
            )}
          </div>
        )}
      </div>
    </Surface>
  );

  if (!fullScreen) {
    return content;
  }

  return <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-slate-50">{content}</main>;
}
