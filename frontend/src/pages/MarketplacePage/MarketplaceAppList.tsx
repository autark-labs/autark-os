import { CheckCircle2, ChevronDown, Loader2, SlidersHorizontal } from 'lucide-react';
import { StatusBadge } from '@/components/autark-os/StatusBadge';
import { ProjectDarkControlButton } from '@/components/primitives/ProjectButtons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { DiscoverAppView } from '@/types/discover';
import { sortOptions } from './extensions/MarketplacePage.constants';
import { marketplaceCardToneClass } from './extensions/MarketplacePage.logic';
import { AppImage, marketplaceStatusTone } from './MarketplacePage.shared';

type MarketplaceAppListProps = {
  apps: DiscoverAppView[];
  installingAppId?: string | null;
  modeLabel?: string;
  selectedAppId: string;
  sortBy: string;
  onSelect: (appId: string) => void;
  onSortChange: (value: string) => void;
};

export function MarketplaceAppList({ apps, installingAppId = null, modeLabel = 'All apps', selectedAppId, sortBy, onSelect, onSortChange }: MarketplaceAppListProps) {
  return (
    <section aria-label="Discover app catalog" className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-50">{modeLabel}</h3>
          <p className="mt-1 text-sm text-slate-400">{apps.length} shown</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ProjectDarkControlButton type="button">
              <SlidersHorizontal className="size-4" />
              {sortBy}
              <ChevronDown className="size-4" />
            </ProjectDarkControlButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 border-sky-400/30 bg-slate-900 text-slate-50 shadow-xl shadow-slate-950/30">
            <DropdownMenuLabel>Sort apps</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-sky-400/20" />
            <DropdownMenuRadioGroup value={sortBy} onValueChange={onSortChange}>
              {sortOptions.map((option) => (
                <DropdownMenuRadioItem className="focus:bg-slate-700 focus:text-white" key={option} value={option}>
                  {option}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {apps.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
          {apps.map((app) => (
            <DenseLauncherCard
              app={app}
              installing={installingAppId === app.id}
              key={app.id}
              onSelect={() => onSelect(app.id)}
              selected={selectedAppId === app.id}
            />
          ))}
        </div>
      ) : (
        <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-sky-400/25 bg-slate-900 p-6 text-center text-sm text-slate-400">
          No apps match this view.
        </div>
      )}
    </section>
  );
}

function DenseLauncherCard({ app, installing, onSelect, selected }: { app: DiscoverAppView; installing: boolean; onSelect: () => void; selected: boolean }) {
  return (
    <button
      aria-pressed={selected}
      aria-label={`Select ${app.name}`}
      className={cn(
        'grid min-h-36 content-between rounded-xl border p-3 text-left text-slate-50 shadow-sm transition',
        'hover:-translate-y-0.5 hover:border-cyan-300/50 hover:shadow-lg hover:shadow-cyan-950/30',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
        marketplaceCardToneClass(app),
        selected && 'border-cyan-300/80 ring-1 ring-cyan-300/55 shadow-lg shadow-cyan-950/30',
      )}
      onClick={onSelect}
      type="button"
    >
      <span className="flex min-w-0 items-start gap-2.5">
        <AppImage app={app.app} />
        <span className="min-w-0 flex-1">
          <strong className="line-clamp-2 break-words text-sm font-semibold leading-5 text-slate-50" title={app.name}>{app.name}</strong>
          <span className="mt-1 block truncate text-xs text-slate-400">{app.categoryLabel}</span>
        </span>
      </span>

      <span className="mt-3 flex flex-wrap items-center gap-1.5">
        <StatusBadge className="min-h-6 px-2 py-0.5 text-[0.7rem]" tone={marketplaceStatusTone(app.statusTone)}>
          {app.stateLabel}
        </StatusBadge>
        {installing && <StatusBadge className="min-h-6 px-2 py-0.5 text-[0.7rem]" icon={Loader2} iconClassName="animate-spin" tone="info">Installing</StatusBadge>}
        {app.state === 'installed_managed' && !installing && <CheckCircle2 aria-label="Managed by this Autark-OS instance" className="ml-auto size-4 text-emerald-200" />}
      </span>
    </button>
  );
}
