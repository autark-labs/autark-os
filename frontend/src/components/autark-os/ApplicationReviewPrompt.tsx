import { AlertTriangle, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ProjectWarningButton } from '@/components/primitives/ProjectButtons';
import { Surface } from '@/components/primitives/Surface';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ApplicationReviewPromptModel = {
  count: number;
  description?: string;
  reviewHref: string;
  title?: string;
};

export function ApplicationReviewPrompt({ className, model, onDismiss }: { className?: string; model: ApplicationReviewPromptModel; onDismiss?: () => void }) {
  const description = model.description || `Autark-OS found ${model.count} app${model.count === 1 ? '' : 's'} that need review before they can be managed or installed.`;
  return (
    <Surface className={cn('flex flex-col gap-4 border-orange-400/35 bg-orange-500/10 p-4 sm:flex-row sm:items-center sm:justify-between', className)} tone="panel">
      <div className="flex min-w-0 gap-3">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-orange-200" />
        <div className="min-w-0">
          <h2 className="text-sm font-black text-white">{model.title || 'Apps need review'}</h2>
          <p className="mt-1 text-sm leading-6 text-orange-100/80">{description}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <ProjectWarningButton asChild size="sm">
          <Link to={model.reviewHref}>Review app</Link>
        </ProjectWarningButton>
        {onDismiss && (
          <Button
            aria-label="Dismiss app review notice"
            className="size-7 border-orange-300/35 text-orange-100 hover:bg-orange-200/15 hover:text-white"
            onClick={onDismiss}
            size="icon-sm"
            title="Dismiss until this browser session ends"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        )}
      </div>
    </Surface>
  );
}
