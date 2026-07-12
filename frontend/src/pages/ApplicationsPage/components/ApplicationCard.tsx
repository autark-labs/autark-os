import { ExternalLink } from 'lucide-react';
import { useEffect, useRef } from 'react';
import {
  Card,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AttentionIndicator, ManagementBadge, ReadinessBadge } from './AppStateBadges';
import { ApplicationOpenButton } from './ApplicationButtons';
import { ApplicationIcon } from '../extensions/ApplicationVisuals';
import type { ApplicationSurfaceItem } from '../extensions/ApplicationsPage.types';

export function ApplicationCard({
  item,
  managementOpen,
  obscured,
  onSelect,
  selected,
}: {
  item: ApplicationSurfaceItem;
  managementOpen: boolean;
  obscured: boolean;
  onSelect: (id: string) => void;
  selected: boolean;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) {
      return;
    }
    if (managementOpen) {
      card.setAttribute('inert', '');
      return;
    }
    card.removeAttribute('inert');
  }, [managementOpen]);

  return (
    <Card
      aria-hidden={managementOpen}
      className={cn(
        'relative h-60 w-48 overflow-visible rounded-2xl border bg-sky-200/90 py-0 shadow-lg shadow-slate-950/20 ring-0 transition-all duration-200',
        !managementOpen && 'cursor-pointer hover:-translate-y-1 hover:bg-sky-200 hover:shadow-xl hover:shadow-slate-950/25',
        managementOpen && 'pointer-events-none cursor-default',
        item.attentionState !== 'none' && cn('border-orange-500 bg-orange-200', !managementOpen && 'hover:bg-orange-100'),
        item.readinessState === 'paused' && cn('border-slate-400 bg-slate-200', !managementOpen && 'hover:bg-slate-100'),
        item.attentionState === 'none' && item.readinessState !== 'paused' && 'border-sky-300',
        managementOpen && obscured && 'scale-[0.98] opacity-35 blur-[1px]',
        selected && cn(
          'z-10 -translate-y-2 border-cyan-300 shadow-2xl shadow-cyan-300/50 ring-4 ring-cyan-300/35',
          !managementOpen && 'hover:-translate-y-2 hover:shadow-cyan-300/60',
        ),
      )}
      ref={cardRef}
      size="sm"
    >
      <button
        aria-label={`Manage ${item.name}`}
        className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        disabled={managementOpen}
        onClick={() => onSelect(item.id)}
        type="button"
      >
        <span className="sr-only">Manage {item.name}</span>
      </button>
      <CardHeader className="pointer-events-none relative z-10 px-3 pt-4">
        <ReadinessBadge item={item} overlay />
        <div className="flex min-w-0 flex-col items-center gap-2">
          <ApplicationIcon item={item} size="lg" />
          <div className="flex min-w-0 flex-col items-center gap-1 text-center">
            <CardTitle
              className="absolute top-30 line-clamp-1 min-h-5 max-w-40 rounded-md border border-sky-300 bg-slate-300 px-2 text-center text-lg leading-tight text-slate-950"
              title={item.name}
            >
              {item.name}
            </CardTitle>
            <div className="flex max-w-full flex-wrap justify-center gap-1">
              <ManagementBadge item={item} />
              <AttentionIndicator item={item} className="absolute right-3 top-11" />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardFooter
        className="relative z-10 mt-auto gap-2 p-2"
      >
        {item.href ? (
          <ApplicationOpenButton asChild className="flex-1 shadow-md" size="lg">
            <a href={item.href} rel="noreferrer" target="_blank">
              <ExternalLink className="size-5" data-icon="inline-start" />
              Open
            </a>
          </ApplicationOpenButton>
        ) : (
          <Button className="flex-1" disabled size="lg" type="button">
            <ExternalLink className="size-5" data-icon="inline-start" />
            No link
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
