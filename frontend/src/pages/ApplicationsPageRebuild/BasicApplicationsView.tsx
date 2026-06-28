import { ArrowRight, ExternalLink, Play, Search } from 'lucide-react';
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
          className={[
            'rounded-2xl border-neutral-300 bg-white shadow-none transition-colors hover:bg-neutral-50',
            selectedId === item.id ? 'border-neutral-950 outline outline-2 outline-offset-2 outline-neutral-950' : '',
          ].join(' ')}
          key={item.id}
        >
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <CardTitle className="truncate text-xl text-neutral-950">{item.name}</CardTitle>
                <CardDescription className="text-neutral-600">{labelForKind(item.kind)}</CardDescription>
              </div>
              <StatusBadge item={item} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex min-h-28 flex-col justify-between gap-4 rounded-xl bg-neutral-100 p-4">
              <p className="line-clamp-3 text-sm leading-6 text-neutral-700">{item.description}</p>
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-white text-neutral-950">{item.access}</Badge>
                <Badge className="bg-white text-neutral-950">{item.backup}</Badge>
              </div>
            </div>
          </CardContent>
          <CardFooter className="justify-between gap-3 rounded-none border-neutral-300 bg-neutral-50">
            <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => onSelect(item.id)} type="button">
              {item.nextStep === 'Open' ? <ExternalLink data-icon="inline-start" /> : <Play data-icon="inline-start" />}
              {item.nextStep}
            </Button>
            <Button className="border-neutral-300 text-neutral-900" onClick={() => onSelect(item.id)} type="button" variant="outline">
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
    return <Badge className="bg-amber-500 text-neutral-950">Needs review</Badge>;
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
        <EmptyDescription>Change the search text to continue shaping this layout.</EmptyDescription>
      </EmptyHeader>
    </Empty>
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
