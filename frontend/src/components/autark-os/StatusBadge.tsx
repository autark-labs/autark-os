import { CheckCircle2, CircleAlert, CircleHelp, Info, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { semanticSolidStatusVariants, semanticStatusVariants, type SemanticStatusTone } from '@/components/primitives/SemanticVariants';
import { cn } from '@/lib/utils';

export type StatusBadgeTone = SemanticStatusTone;
export type StatusBadgeAppearance = 'soft' | 'solid';

export function StatusBadge({ appearance = 'soft', children, className, icon: Icon, iconClassName, tone = 'neutral' }: { appearance?: StatusBadgeAppearance; children: ReactNode; className?: string; icon?: LucideIcon; iconClassName?: string; tone?: StatusBadgeTone }) {
  const StatusIcon = Icon ?? statusIcon(tone);
  return (
    <Badge className={cn('min-h-7 rounded-full px-2.5 py-1 text-xs font-semibold', semanticStatusVariants({ tone }), appearance === 'solid' && semanticSolidStatusVariants({ tone }), className)} variant="outline">
      <StatusIcon aria-hidden="true" className={iconClassName} data-icon="inline-start" />
      {children}
    </Badge>
  );
}

function statusIcon(tone: StatusBadgeTone) {
  if (tone === 'success') return CheckCircle2;
  if (tone === 'warning') return TriangleAlert;
  if (tone === 'danger') return CircleAlert;
  if (tone === 'info' || tone === 'teal') return Info;
  return CircleHelp;
}
