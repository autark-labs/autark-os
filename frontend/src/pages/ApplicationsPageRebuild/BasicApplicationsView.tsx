import { useState } from 'react';
import { ExternalLink, LockIcon, MoreHorizontal, Search, Trash2, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { cn } from '@/lib/utils';
import { ApplicationIcon, ApplicationStatusBadge } from './ApplicationVisuals';
import type { ApplicationSurfaceItem } from './extensions/ApplicationsPage.types';

type BasicApplicationsViewProps = {
  items: ApplicationSurfaceItem[];
  onUninstall: (id: string) => void;
  onSelect: (id: string) => void;
  selectedId?: string;
};

export function BasicApplicationsView({ items, onSelect, onUninstall, selectedId }: BasicApplicationsViewProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  if (!items.length) {
    return <ApplicationsEmptyState />;
  }

  return (
    <section className="grid auto-rows-max items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Card
          className={cn(
            'relative h-fit cursor-pointer overflow-visible rounded-2xl border bg-sky-100 py-0 shadow-lg shadow-slate-950/20 ring-0 transition-all duration-200 hover:-translate-y-1 hover:bg-sky-50 hover:shadow-xl hover:shadow-slate-950/25',
            item.nextAction && 'border-orange-500 bg-orange-200 hover:bg-orange-100',
            item.runtimeState === 'paused' && 'border-slate-400 bg-slate-200 hover:bg-slate-100',
            !item.nextAction && item.runtimeState !== 'paused' && 'border-sky-300',
            selectedId === item.id && 'z-10 -translate-y-2 border-cyan-300 shadow-2xl shadow-cyan-300/50 ring-4 ring-cyan-300/35 hover:-translate-y-2 hover:shadow-cyan-300/60',
          )}
          key={item.id}
          onClick={() => onSelect(item.id)}
        >
          <CardHeader className="px-4 pt-5">
            <ApplicationStatusBadge item={item} overlay />
            <div className="flex min-w-0 flex-col items-center gap-3">
              <ApplicationIcon item={item} size="lg" />
              <div className="flex min-w-0 flex-col items-center gap-1 text-center">
                <CardTitle className="max-w-full truncate text-lg text-slate-950">{item.name}</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 py-1">
            <div className="items-center justify-center justify-items-center rounded-lg border border-sky-700 bg-slate-900 p-0 text-center">
              <div className="flex flex-col justify-center gap-1 p-1.5">
                <div className="flex flex-row gap-1.5">
                  <LockIcon size="16" className="text-xs text-cyan-200"/>
                  <p className="text-xs text-sky-50">{item.access}</p>
                </div>
                <div className="flex flex-row gap-1.5">
                  <Server size="16" className="text-xs text-cyan-200"/>
                  <p className="text-xs text-sky-50">{item.backup}</p>
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter
            className="gap-2 p-2"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {item.href ? (
              <Button asChild className="flex-1 bg-cyan-300 text-slate-950 shadow-md shadow-cyan-700/20 hover:bg-cyan-200" size="lg">
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
            <DropdownMenu
              onOpenChange={(open) => {
                setOpenMenuId(open ? item.id : null);
              }}
              open={openMenuId === item.id}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={`${item.name} options`}
                  className="border-sky-300 bg-white text-slate-950 hover:bg-sky-100"
                  size="icon-lg"
                  type="button"
                  variant="outline"
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="z-[100] w-40 border-sky-400/30 bg-slate-900 text-slate-50"
                onClick={(event) => event.stopPropagation()}
              >
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onSelect={() => {
                      setOpenMenuId(null);
                      onUninstall(item.id);
                    }}
                    variant="destructive"
                  >
                    <Trash2 data-icon="inline-start" />
                    Uninstall
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardFooter>
        </Card>
      ))}
    </section>
  );
}

function ApplicationsEmptyState() {
  return (
    <Empty className="min-h-96 rounded-2xl border border-sky-400/30 bg-slate-900 text-slate-50">
      <EmptyHeader>
        <EmptyMedia className="bg-cyan-300 text-slate-950" variant="icon">
          <Search />
        </EmptyMedia>
        <EmptyTitle>No matching apps or services</EmptyTitle>
        <EmptyDescription className="text-sky-100/70">Lorem ipsum dolor sit amet, consectetur adipiscing elit.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
