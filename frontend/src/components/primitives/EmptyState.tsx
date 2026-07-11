import type { ReactNode } from 'react';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { ProjectInset } from '@/components/primitives/Surface';
import { semanticPrimaryActionClass } from './SemanticVariants';
import { cn } from '@/lib/utils';

export function ProjectEmptyState({
  className,
  description,
  icon,
  mediaClassName,
  title,
}: {
  className?: string;
  description: string;
  icon: ReactNode;
  mediaClassName?: string;
  title: string;
}) {
  return (
    <Empty className={cn('min-h-96 rounded-2xl border border-app-border-muted bg-app-panel text-app-text', className)}>
      <EmptyHeader>
        <EmptyMedia className={cn(semanticPrimaryActionClass, mediaClassName)} variant="icon">
          {icon}
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription className="text-app-text-secondary/80">{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function ProjectInlineEmptyState({
  className,
  compact = false,
  description,
  title,
}: {
  className?: string;
  compact?: boolean;
  description: string;
  title: string;
}) {
  return (
    <ProjectInset className={cn('text-center', compact ? 'p-4' : 'p-8', className)}>
      <p className="font-bold text-app-text">{title}</p>
      <p className="mt-1 text-sm text-app-text-muted">{description}</p>
    </ProjectInset>
  );
}
