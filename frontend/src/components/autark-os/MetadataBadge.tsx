import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { semanticSolidStatusVariants, semanticStatusVariants, type SemanticStatusTone } from '@/components/primitives/SemanticVariants';
import { cn } from '@/lib/utils';

export type MetadataBadgeTone = Extract<SemanticStatusTone, 'info' | 'muted' | 'neutral'>;
export type MetadataBadgeAppearance = 'soft' | 'solid';

export function MetadataBadge({ appearance = 'soft', children, className, tone = 'muted' }: { appearance?: MetadataBadgeAppearance; children: ReactNode; className?: string; tone?: MetadataBadgeTone }) {
  return (
    <Badge className={cn('rounded-full px-2.5 py-1 text-xs font-medium', semanticStatusVariants({ tone }), appearance === 'solid' && semanticSolidStatusVariants({ tone }), className)} variant="outline">
      {children}
    </Badge>
  );
}
