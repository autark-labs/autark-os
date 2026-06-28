import { AlertTriangle, ArrowRight, ExternalLink, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { cn } from '@/lib/utils';
import type { ApplicationSurfaceItem } from './ApplicationsPage.types';

type BasicApplicationsViewProps = {
  items: ApplicationSurfaceItem[];
  onSelect: (id: string) => void;
  selectedId?: string;
};

export function BasicApplicationsView({ items, onSelect, selectedId }: BasicApplicationsViewProps) {
  if (!items.length) {
    return <ApplicationsEmptyState />;
  }

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Card
          className={cn(
            'relative cursor-pointer overflow-visible rounded-2xl border bg-white py-0 shadow-none ring-0 transition-colors hover:bg-neutral-50',
            item.nextAction && 'border-amber-300 bg-amber-50/70 hover:bg-amber-50',
            item.runtimeState === 'paused' && 'border-neutral-300 bg-neutral-50',
            !item.nextAction && item.runtimeState !== 'paused' && 'border-neutral-300',
            selectedId === item.id && 'border-neutral-950 shadow-md',
          )}
          key={item.id}
          onClick={() => onSelect(item.id)}
        >
          <CardHeader className="px-4 pt-5">
            <StatusBadge item={item} />
            <div className="flex min-w-0 flex-col items-center gap-3">
              <AppIcon item={item} />
              <div className="flex min-w-0 flex-col items-center gap-1 text-center">
                <CardTitle className="max-w-full truncate text-lg text-neutral-950">{item.name}</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 py-2">
            <div className="rounded-xl bg-blue-200 p-0 border-2xl border-2 border-black">
              <div className="flex flex-wrap justify-center gap-2">
                <p className="text-sm text-foreground">{item.access}</p> 
                <p className="text-xs text-neutral-950">●</p>
                <p className="text-sm text-foreground">{item.backup}</p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="gap-2 p-2">
            {item.href ? (
              <Button asChild className="flex-1 bg-neutral-950 text-white hover:bg-neutral-800" size="lg">
                <a href={item.href} onClick={(event) => event.stopPropagation()} rel="noreferrer" target="_blank">
                  <ExternalLink className="size-5" data-icon="inline-start" />
                  Open
                </a>
              </Button>
            ) : (
              <Button className="flex-1" disabled size="lg" type="button">
                <ExternalLink className="size-5" data-icon="inline-start" />
                No link
              </Button>
            )}
            <Button className="border-neutral-300 text-neutral-900" onClick={(event) => {
              event.stopPropagation();
              onSelect(item.id);
            }} size="lg" type="button" variant="outline">
              Details
              <ArrowRight data-icon="inline-end" />
            </Button>
          </CardFooter>
        </Card>
      ))}
    </section>
  );
}

function StatusBadge({ item }: { item: ApplicationSurfaceItem }) {
  if (item.status === 'Ready') {
    return <Badge className="absolute right-3 top-3 bg-emerald-600 text-white">Ready</Badge>;
  }
  if (item.status === 'Needs review') {
    return (
      <Badge className="absolute right-3 top-3 bg-amber-500 text-neutral-950">
        <AlertTriangle data-icon="inline-start" />
        Needs review
      </Badge>
    );
  }
  if (item.status === 'Paused') {
    return <Badge className="absolute right-3 top-3 bg-neutral-700 text-white">Paused</Badge>;
  }
  return <Badge className="absolute right-3 top-3 bg-neutral-200 text-neutral-950">{item.status}</Badge>;
}

function ApplicationsEmptyState() {
  return (
    <Empty className="min-h-96 rounded-2xl border border-neutral-300 bg-white">
      <EmptyHeader>
        <EmptyMedia className="bg-neutral-100 text-neutral-950" variant="icon">
          <Search />
        </EmptyMedia>
        <EmptyTitle>No matching apps or services</EmptyTitle>
        <EmptyDescription>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function AppIcon({ item }: { item: ApplicationSurfaceItem }) {
  return (
    <div className="grid size-24 shrink-0 place-items-center rounded-2xl border border-neutral-300 bg-white">
      {item.iconUrl ? (
        <img alt="" className="size-20 object-contain" src={item.iconUrl} />
      ) : (
        <span className="text-xl font-semibold text-neutral-700">{item.name.slice(0, 2).toUpperCase()}</span>
      )}
    </div>
  );
}
