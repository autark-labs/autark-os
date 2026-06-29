import { useState } from 'react';
import { ExternalLink, MoreHorizontal, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
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
import { CompactOperationStatus } from './components/AppOperationStatus';
import { AttentionIndicator, ManagementBadge, ReadinessBadge } from './components/AppStateBadges';
import { ApplicationIcon } from './extensions/ApplicationVisuals';
import type { ApplicationSurfaceItem } from './extensions/ApplicationsPage.types';

type BasicApplicationsViewProps = {
  items: ApplicationSurfaceItem[];
  managementOpen: boolean;
  onUninstall: (id: string) => void;
  onSelect: (id: string) => void;
  selectedId?: string;
};

export function BasicApplicationsView({ items, managementOpen, onSelect, onUninstall, selectedId }: BasicApplicationsViewProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  if (!items.length) {
    return <ApplicationsEmptyState />;
  }

  return (
    <section className="grid min-h-[44rem] grid-cols-[repeat(auto-fill,12rem)] items-start justify-start gap-3">
      {items.map((item) => (
        <Card
          aria-hidden={managementOpen}
          className={cn(
            'relative h-60 w-48 overflow-visible rounded-2xl border bg-sky-100 py-0 shadow-lg shadow-slate-950/20 ring-0 transition-all duration-200',
            !managementOpen && 'cursor-pointer hover:-translate-y-1 hover:bg-sky-50 hover:shadow-xl hover:shadow-slate-950/25',
            managementOpen && 'pointer-events-none cursor-default',
            item.attentionState !== 'none' && cn('border-orange-500 bg-orange-200', !managementOpen && 'hover:bg-orange-100'),
            item.readinessState === 'paused' && cn('border-slate-400 bg-slate-200', !managementOpen && 'hover:bg-slate-100'),
            item.attentionState === 'none' && item.readinessState !== 'paused' && 'border-sky-300',
            managementOpen && selectedId && selectedId !== item.id && 'scale-[0.98] opacity-35 blur-[1px]',
            selectedId === item.id && cn(
              'z-10 -translate-y-2 border-cyan-300 shadow-2xl shadow-cyan-300/50 ring-4 ring-cyan-300/35',
              !managementOpen && 'hover:-translate-y-2 hover:shadow-cyan-300/60',
            ),
          )}
          key={item.id}
          onClick={() => {
            if (!managementOpen) {
              onSelect(item.id);
            }
          }}
          size="sm"
        >
          <CardHeader className="px-3 pt-4">
            <ReadinessBadge item={item} overlay />
            <div className="flex min-w-0 flex-col items-center gap-2">
              <ApplicationIcon item={item} size="lg" />
              <div className="flex min-w-0 flex-col items-center gap-1 text-center">
                <CardTitle className="max-w-full truncate text-lg text-slate-950">{item.name}</CardTitle>
                <div className="flex max-w-full flex-wrap justify-center gap-1">
                  <ManagementBadge item={item} />
                  <AttentionIndicator item={item} />
                </div>
              </div>
            </div>
          </CardHeader>

          <CompactOperationStatus item={item} className="mx-3" />

          {/* Metadata section parked while the Basic card treatment is redesigned.
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
          */}

          <CardFooter
            className="mt-auto gap-2 p-2"
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
