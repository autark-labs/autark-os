import { useId, type ReactNode } from 'react';
import { ChevronDown, CircleAlert, Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { semanticStatusVariants } from '@/components/primitives/SemanticVariants';
import { cn } from '@/lib/utils';

/** Current context, not an event: closing the disclosure never dismisses the condition. */
export function ContextChip({ label, title, children, tone = 'warning', busy = false, className, open, onOpenChange }: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  label: string;
  title: string;
  children: ReactNode;
  tone?: 'warning' | 'danger' | 'muted';
  busy?: boolean;
  className?: string;
}) {
  const titleId = useId();
  const Icon = busy ? Loader2 : tone === 'muted' ? Info : CircleAlert;
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button aria-label={label} className={cn(
          'h-8 min-w-0 max-w-full gap-2 rounded-lg px-2.5 text-xs hover:bg-app-panel-hover',
          semanticStatusVariants({ tone }),
          className,
        )} type="button" variant="default">
          <Icon aria-hidden="true" className={cn('size-3.5 shrink-0', busy && 'animate-spin')} />
          <span className="truncate">{label}</span>
          <ChevronDown aria-hidden="true" className="size-3 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-labelledby={titleId} className="max-h-[min(21.25rem,var(--radix-popover-content-available-height))] w-[18.75rem] max-w-[calc(100vw-1.5rem)] gap-3 overflow-y-auto overscroll-contain p-3 text-sm" collisionPadding={12}>
        <h2 className="text-xs font-semibold text-muted-foreground" id={titleId}>{title}</h2>
        {children}
      </PopoverContent>
    </Popover>
  );
}
