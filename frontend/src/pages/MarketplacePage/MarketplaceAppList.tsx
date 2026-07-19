import { ChevronDown, ExternalLink, Loader2, Search, SlidersHorizontal } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { DiscoverAppView } from '@/types/discover';
import { sortOptions } from './extensions/MarketplacePage.constants';
import { AppImage, marketplaceStatusTone } from './MarketplacePage.shared';

type MarketplaceAppListProps = {
  apps: DiscoverAppView[];
  installingAppId?: string | null;
  selectedAppId: string;
  onSelect: (appId: string) => void;
};

type MarketplaceCatalogToolbarProps = {
  onSearchChange: (value: string) => void;
  onSortChange: (value: string) => void;
  searchValue: string;
  sortBy: string;
};

export function MarketplaceCatalogToolbar({ onSearchChange, onSortChange, searchValue, sortBy }: MarketplaceCatalogToolbarProps) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-sky-300/15 bg-slate-950/10 p-3">
      <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-sky-300/20 bg-slate-950/25 px-2.5 text-slate-300 focus-within:border-cyan-300/70">
        <Search className="size-3.5 shrink-0" />
        <span className="sr-only">Search Discover apps</span>
        <Input
          aria-label="Search Discover apps"
          className="h-auto min-w-0 flex-1 border-0 bg-transparent px-0 text-sm text-white shadow-none placeholder:text-slate-400 focus-visible:ring-0"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search apps"
          type="search"
          value={searchValue}
        />
      </label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <ProjectDarkControlButton className="h-9 shrink-0 px-2.5 text-xs" type="button">
            <SlidersHorizontal className="size-3.5" />
            <span className="hidden sm:inline">{sortBy}</span>
            <ChevronDown className="size-3.5" />
          </ProjectDarkControlButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 border-sky-300/20 bg-[#0b1831] text-slate-50 shadow-xl shadow-slate-950/20">
          <DropdownMenuLabel>Sort apps</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-sky-300/10" />
          <DropdownMenuRadioGroup value={sortBy} onValueChange={onSortChange}>
            {sortOptions.map((option) => (
              <DropdownMenuRadioItem className="focus:bg-slate-800 focus:text-white" key={option} value={option}>
                {option}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function MarketplaceAppList({ apps, installingAppId = null, selectedAppId, onSelect }: MarketplaceAppListProps) {
  return (
    <section aria-label="Discover app catalog" className="flex min-h-0 flex-1 flex-col p-3">
      {apps.length ? (
        <div className="grid min-h-0 grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] content-start gap-3 overflow-y-auto overscroll-contain pr-1">
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
        <div className="grid min-h-40 flex-1 place-items-center rounded-xl border border-dashed border-sky-300/25 bg-slate-950/20 p-6 text-center text-sm text-slate-300">
          No apps match this view.
        </div>
      )}
    </section>
  );
}

function DenseLauncherCard({ app, installing, onSelect, selected }: { app: DiscoverAppView; installing: boolean; onSelect: () => void; selected: boolean }) {
  const canOpen = Boolean(app.installedApp?.accessUrl);

  return (
    <article
      className={cn(
        'relative flex h-[218px] flex-col overflow-hidden rounded-xl border border-sky-300/20 bg-[#102644] text-slate-50 shadow-lg shadow-slate-950/20 transition duration-200',
        'hover:-translate-y-0.5 hover:border-cyan-300/50 hover:bg-[#173455] hover:shadow-xl hover:shadow-cyan-950/30',
        launcherCardAttentionClass(app),
        selected && 'border-cyan-300/80 ring-1 ring-cyan-300/45 shadow-lg shadow-cyan-950/30',
      )}
    >
      <button
        aria-pressed={selected}
        aria-label={`Select ${app.name}`}
        className="flex min-h-0 flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-inset"
        onClick={onSelect}
        type="button"
      >
        <AppImage app={app.app} className="h-32 border-sky-300/10" presentation="artwork" />
        <span className="flex min-h-0 flex-1 flex-col p-3">
          <span className="min-w-0">
            <strong className="line-clamp-2 break-words text-sm font-semibold leading-5 text-slate-50" title={app.name}>{app.name}</strong>
            <span className="mt-0.5 block truncate text-xs text-slate-400">{app.categoryLabel}</span>
          </span>
          <span className="mt-auto flex items-center gap-2 pt-2 text-xs text-slate-300">
            <AppStatusDot installing={installing} tone={marketplaceStatusTone(app.statusTone)} />
            <span>{installing ? 'Installing' : app.stateLabel}</span>
          </span>
        </span>
      </button>

      {canOpen && (
        <a
          aria-label={`Open ${app.name}`}
          className="absolute right-3 top-3 grid size-7 place-items-center rounded-lg border border-slate-950/35 bg-slate-950/60 text-slate-200 backdrop-blur-sm transition hover:border-cyan-300/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          href={app.installedApp?.accessUrl}
          rel="noreferrer"
          target="_blank"
        >
          <ExternalLink className="size-3.5" />
        </a>
      )}
    </article>
  );
}

function launcherCardAttentionClass(app: DiscoverAppView) {
  if (app.statusTone === 'danger') return 'border-red-300/35';
  if (app.statusTone === 'warning' || app.statusTone === 'observed') return 'border-amber-300/35';
  return '';
}

function AppStatusDot({ installing, tone }: { installing: boolean; tone: ReturnType<typeof marketplaceStatusTone> }) {
  if (installing) {
    return <Loader2 aria-label="Installing" className="mt-1 size-3.5 shrink-0 animate-spin text-cyan-200" />;
  }

  const toneClass = tone === 'success'
    ? 'bg-emerald-300'
    : tone === 'warning'
      ? 'bg-orange-300'
      : tone === 'danger'
        ? 'bg-red-300'
        : tone === 'info' || tone === 'teal'
          ? 'bg-cyan-300'
          : 'bg-slate-300';

  return <span aria-label="App status" className={cn('mt-1.5 size-2 shrink-0 rounded-full', toneClass)} />;
}
