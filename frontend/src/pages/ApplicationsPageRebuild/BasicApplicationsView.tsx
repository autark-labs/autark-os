import { AlertTriangle, ArrowRight, ExternalLink, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
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
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <Card
          className={cn(
            'cursor-pointer overflow-visible rounded-2xl border bg-white shadow-none ring-0 transition-colors hover:bg-neutral-50',
            item.nextAction && 'border-amber-300 bg-amber-50/70 hover:bg-amber-50',
            item.runtimeState === 'paused' && 'border-neutral-300 bg-neutral-50',
            !item.nextAction && item.runtimeState !== 'paused' && 'border-neutral-300',
            selectedId === item.id && 'border-neutral-950 outline outline-2 outline-offset-2 outline-neutral-950',
          )}
          key={item.id}
          onClick={() => onSelect(item.id)}
        >
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <AppIcon item={item} />
                <div className="flex min-w-0 flex-col gap-1">
                  <CardTitle className="truncate text-xl text-neutral-950">{item.name}</CardTitle>
                  <StatusBadge item={item} />
                  {/* <CardDescription className="text-neutral-600">{labelForKind(item.kind)}</CardDescription> */}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex min-h-28 flex-col justify-between gap-4 rounded-xl bg-neutral-100 p-4">
              <p className="line-clamp-3 text-sm leading-6 text-neutral-700">{item.description}</p>
              <div className="flex flex-wrap gap-between">
                <Badge className="bg-white text-neutral-950">{item.access}</Badge>
                <Badge className="bg-white text-neutral-950">{item.backup}</Badge>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex-wrap justify-between gap-3 border-neutral-300 bg-white">
            {item.href ? (
              <Button asChild className="bg-neutral-950 text-white hover:bg-neutral-800">
                <a href={item.href} onClick={(event) => event.stopPropagation()} rel="noreferrer" target="_blank">
                  <ExternalLink data-icon="inline-start" />
                  Open
                </a>
              </Button>
            ) : (
              <Button disabled type="button">
                <ExternalLink data-icon="inline-start" />
                No link
              </Button>
            )}
            <Button className="border-neutral-300 text-neutral-900" onClick={(event) => {
              event.stopPropagation();
              onSelect(item.id);
            }} type="button" variant="outline">
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
    return <Badge className="bg-emerald-600 text-white">Ready</Badge>;
  }
  if (item.status === 'Needs review') {
    return (
      <Badge className="bg-amber-500 text-neutral-950">
        <AlertTriangle data-icon="inline-start" />
        Needs review
      </Badge>
    );
  }
  if (item.status === 'Paused') {
    return <Badge className="bg-neutral-700 text-white">Paused</Badge>;
  }
  return <Badge className="bg-neutral-200 text-neutral-950">{item.status}</Badge>;
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
    <div className="grid size-12 shrink-0 place-items-center rounded-xl border border-neutral-300 bg-white">
      {item.iconUrl ? (
        <img alt="" className="size-9 object-contain" src={item.iconUrl} />
      ) : (
        <span className="text-sm font-semibold text-neutral-700">{item.name.slice(0, 2).toUpperCase()}</span>
      )}
    </div>
  );
}

function labelForKind(kind: ApplicationSurfaceItem['kind']) {
  if (kind === 'managed') {
    return 'Managed by Project OS';
  }
  if (kind === 'pinned') {
    return 'Pinned shortcut';
  }
  return 'Found on this machine';
}
