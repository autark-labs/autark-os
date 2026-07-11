import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ProjectWarningButton } from '@/components/primitives/ProjectButtons';
import { Surface } from '@/components/primitives/Surface';
import { cn } from '@/lib/utils';

export type FoundAppsPromptModel = {
  count: number;
  description?: string;
  reviewHref: string;
  title?: string;
};

export function FoundAppsPrompt({ className, model }: { className?: string; model: FoundAppsPromptModel }) {
  const description = model.description || `Autark-OS found ${model.count} service${model.count === 1 ? '' : 's'} that this installation does not manage.`;
  return (
    <Surface className={cn('flex flex-col gap-4 border-orange-400/35 bg-orange-500/10 p-4 sm:flex-row sm:items-center sm:justify-between', className)} tone="panel">
      <div className="flex min-w-0 gap-3">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-orange-200" />
        <div className="min-w-0">
          <h2 className="text-sm font-black text-white">{model.title || 'Found on this server'}</h2>
          <p className="mt-1 text-sm leading-6 text-orange-100/80">{description}</p>
        </div>
      </div>
      <ProjectWarningButton asChild className="shrink-0" size="sm">
        <Link to={model.reviewHref}>Review existing apps</Link>
      </ProjectWarningButton>
    </Surface>
  );
}
