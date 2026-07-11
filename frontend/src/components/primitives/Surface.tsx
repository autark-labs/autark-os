import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { semanticInteractiveSurfaceClass, semanticSurfaceVariants } from './SemanticVariants';

type SurfaceElement = 'article' | 'aside' | 'div' | 'header' | 'main' | 'nav' | 'section';
type SurfaceTone = 'panel' | 'muted' | 'inset' | 'warning' | 'danger' | 'success' | 'none';

export type SurfaceProps = HTMLAttributes<HTMLElement> & {
  as?: SurfaceElement;
  tone?: SurfaceTone;
};

export function Surface({ as: Component = 'section', className, tone = 'panel', ...props }: SurfaceProps) {
  return <Component className={cn(semanticSurfaceVariants({ tone }), className)} {...props} />;
}

export function ProjectPanel({ as = 'section', className, tone = 'panel', ...props }: SurfaceProps) {
  return <Surface as={as} className={cn('p-5', className)} tone={tone} {...props} />;
}

export function ProjectInset({
  className,
  interactive = false,
  tone = 'muted',
  ...props
}: SurfaceProps & {
  interactive?: boolean;
}) {
  return (
    <Surface
      className={cn(
        'p-3',
        interactive && semanticInteractiveSurfaceClass,
        className,
      )}
      tone={tone}
      {...props}
    />
  );
}
