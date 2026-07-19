import { ChevronDown, ExternalLink, Filter, Loader2, MoreVertical, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { AppCardName } from '@/components/autark-os/AppCardName';
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
import { marketplaceStatusOptions, sortOptions, type MarketplaceStatusFilter } from './extensions/MarketplacePage.constants';
import { AppImage, marketplaceStatusTone } from './MarketplacePage.shared';

type MarketplaceAppListProps = {
  apps: DiscoverAppView[];
  installingAppId?: string | null;
  onRestoreStarterGuidance?: () => void;
  selectedAppId: string;
  starterGuidance?: {
    appName: string;
    onDismiss: () => void;
    onReview: () => void;
  } | null;
  onSelect: (appId: string) => void;
};

type MarketplaceCatalogToolbarProps = {
  onSearchChange: (value: string) => void;
  onSortChange: (value: string) => void;
  onStatusFilterChange: (value: MarketplaceStatusFilter) => void;
  searchValue: string;
  sortBy: string;
  statusFilter: MarketplaceStatusFilter;
};

export function MarketplaceCatalogToolbar({ onSearchChange, onSortChange, onStatusFilterChange, searchValue, sortBy, statusFilter }: MarketplaceCatalogToolbarProps) {
  const statusLabel = marketplaceStatusOptions.find((option) => option.value === statusFilter)?.label ?? 'All statuses';

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-sky-300/15 bg-slate-950/20 p-3">
      <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-sky-300/15 bg-slate-900 px-2.5 text-sky-100/70 focus-within:border-cyan-300/30">
        <Search className="size-3.5 shrink-0" />
        <span className="sr-only">Search Discover apps</span>
        <Input
          aria-label="Search Discover apps"
          className="h-auto min-w-0 flex-1 border-0 bg-transparent px-0 text-sm text-slate-50 shadow-none placeholder:text-sky-100/45 focus-visible:ring-0"
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
        <DropdownMenuContent align="end" className="w-56 border-sky-300/20 bg-slate-900 text-slate-50 shadow-xl shadow-slate-950/20">
          <DropdownMenuLabel>Sort apps</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-sky-300/15" />
          <DropdownMenuRadioGroup value={sortBy} onValueChange={onSortChange}>
            {sortOptions.map((option) => (
              <DropdownMenuRadioItem className="focus:bg-slate-800 focus:text-white" key={option} value={option}>
                {option}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <ProjectDarkControlButton aria-label="Filter app status" className="h-9 shrink-0 px-2.5 text-xs" type="button">
            <Filter className="size-3.5" />
            <span className="hidden md:inline">{statusLabel}</span>
            <ChevronDown className="size-3.5" />
          </ProjectDarkControlButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44 border-sky-300/20 bg-slate-900 text-slate-50 shadow-xl shadow-slate-950/20">
          <DropdownMenuLabel>App status</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-sky-300/15" />
          <DropdownMenuRadioGroup value={statusFilter} onValueChange={(value) => onStatusFilterChange(value as MarketplaceStatusFilter)}>
            {marketplaceStatusOptions.map((option) => (
              <DropdownMenuRadioItem className="focus:bg-slate-800 focus:text-white" key={option.value} value={option.value}>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function MarketplaceAppList({ apps, installingAppId = null, onRestoreStarterGuidance, selectedAppId, starterGuidance = null, onSelect }: MarketplaceAppListProps) {
  return (
    <section aria-label="Discover app catalog" className="flex min-h-0 flex-1 flex-col p-3">
      {starterGuidance ? <StarterGuidance {...starterGuidance} /> : onRestoreStarterGuidance ? <RestoreStarterGuidance onRestore={onRestoreStarterGuidance} /> : null}
      {apps.length ? (
        <div className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] content-start gap-3 overflow-y-auto overscroll-contain pr-1">
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
        <div className="grid min-h-40 flex-1 place-items-center rounded-xl border border-dashed border-sky-300/20 bg-slate-800/60 p-6 text-center text-sm text-sky-100/70">
          No apps match this view.
        </div>
      )}
    </section>
  );
}

function StarterGuidance({ appName, onDismiss, onReview }: NonNullable<MarketplaceAppListProps['starterGuidance']>) {
  return (
    <section aria-label="Starter app recommendation" className="mb-3 flex shrink-0 items-center justify-between gap-3 rounded-xl border border-sky-300/15 bg-slate-800/60 px-3 py-2.5">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-cyan-300/12 text-cyan-200">
          <Sparkles aria-hidden="true" className="size-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white">Start with {appName}</p>
          <p className="mt-0.5 text-xs leading-4 text-sky-100/70">A private password manager and a gentle first app to try on your server.</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button className="rounded-md px-2 py-1 text-xs font-medium text-cyan-200 transition hover:bg-cyan-300/12 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" onClick={onReview} type="button">
          Review
        </button>
        <button aria-label="Hide starter recommendation" className="grid size-6 place-items-center rounded-md text-sky-100/60 transition hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" onClick={onDismiss} type="button">
          <X aria-hidden="true" className="size-3.5" />
        </button>
      </div>
    </section>
  );
}

function RestoreStarterGuidance({ onRestore }: { onRestore: () => void }) {
  return (
    <div className="mb-2 flex shrink-0 justify-end">
      <button className="rounded-md px-2 py-1 text-xs text-sky-100/60 transition hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" onClick={onRestore} type="button">
        Show starter tip
      </button>
    </div>
  );
}

function DenseLauncherCard({ app, installing, onSelect, selected }: { app: DiscoverAppView; installing: boolean; onSelect: () => void; selected: boolean }) {
  const canOpen = Boolean(app.installedApp?.accessUrl);

  return (
    <article
      className={cn(
        'group/app-card relative h-56 overflow-hidden rounded-xl border border-sky-200/20 bg-app-card-harbor text-slate-50 shadow-lg shadow-slate-950/20 transition duration-200',
        'hover:-translate-y-0.5 hover:border-cyan-200/50 hover:bg-app-card-harbor-hover hover:shadow-xl hover:shadow-cyan-950/30',
        launcherCardAttentionClass(app),
        selected && 'border-cyan-100/85 bg-app-card-harbor-hover ring-1 ring-cyan-100/55 shadow-xl shadow-cyan-200/20',
      )}
    >
      <button
        aria-pressed={selected}
        aria-label={`Select ${app.name}`}
        className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-200/80"
        onClick={onSelect}
        type="button"
      />
      <div className="pointer-events-none relative z-10 flex h-full flex-col">
        <AppImage
          app={app.app}
          className="h-36 shrink-0 border-b border-sky-200/20"
          overlay={(
            <>
              <span className="absolute left-2 top-2 z-20 max-w-28 truncate rounded-full border border-slate-950/35 bg-slate-950/55 px-1.5 py-0.5 text-[0.65rem] font-medium text-slate-100 backdrop-blur-sm">{app.serviceKindLabel}</span>
              <div className="pointer-events-auto absolute right-1.5 top-1.5 z-20 flex items-center gap-0.5">
                {canOpen && (
                  <a
                    aria-label={`Open ${app.name}`}
                    className="inline-flex size-5.5 items-center justify-center rounded-md text-slate-200 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80"
                    href={app.installedApp?.accessUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                )}
                <button aria-label={`Review ${app.name}`} className="inline-flex size-5.5 items-center justify-center rounded-md text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80" onClick={onSelect} type="button">
                  <MoreVertical className="size-3.5" />
                </button>
              </div>
            </>
          )}
          presentation="launcher"
        />
        <div className="flex min-h-0 flex-1 flex-col px-3 pb-2 pt-2">
          <AppCardName className="text-sm font-semibold text-white" name={app.name} />
          <p className="m-0 truncate text-xs text-slate-200/70">{app.categoryLabel}</p>
          <div className="mt-auto flex items-center gap-2 border-t border-sky-200/10 pt-2 text-[0.7rem] font-medium text-slate-200/80">
            <AppStatusDot installing={installing} tone={marketplaceStatusTone(app.statusTone)} />
            <span>{installing ? 'Installing' : app.stateLabel}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function launcherCardAttentionClass(app: DiscoverAppView) {
  if (app.statusTone === 'danger') return 'border-red-300/45';
  if (app.statusTone === 'warning' || app.statusTone === 'observed') return 'border-amber-300/45';
  return '';
}

function AppStatusDot({ installing, tone }: { installing: boolean; tone: ReturnType<typeof marketplaceStatusTone> }) {
  if (installing) {
    return <Loader2 aria-label="Installing" className="size-3.5 shrink-0 animate-spin text-app-accent" />;
  }

  const toneClass = tone === 'success'
    ? 'bg-app-success'
    : tone === 'warning'
      ? 'bg-app-warning'
      : tone === 'danger'
        ? 'bg-app-danger'
        : tone === 'info' || tone === 'teal'
          ? 'bg-app-info'
          : 'bg-app-text-muted';

  return <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', toneClass)} />;
}
