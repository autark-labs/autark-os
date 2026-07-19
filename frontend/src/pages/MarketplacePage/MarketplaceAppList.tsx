import { ChevronDown, ExternalLink, Filter, Loader2, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
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
    <div className="flex shrink-0 items-center gap-2 border-b border-app-border-muted bg-app-surface/10 p-3">
      <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-app-border-muted bg-app-panel-muted px-2.5 text-app-text-secondary focus-within:border-app-border-strong">
        <Search className="size-3.5 shrink-0" />
        <span className="sr-only">Search Discover apps</span>
        <Input
          aria-label="Search Discover apps"
          className="h-auto min-w-0 flex-1 border-0 bg-transparent px-0 text-sm text-app-text shadow-none placeholder:text-app-text-muted focus-visible:ring-0"
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
        <DropdownMenuContent align="end" className="w-56 border-app-border-muted bg-app-panel text-app-text shadow-xl shadow-slate-950/20">
          <DropdownMenuLabel>Sort apps</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-app-border-muted" />
          <DropdownMenuRadioGroup value={sortBy} onValueChange={onSortChange}>
            {sortOptions.map((option) => (
              <DropdownMenuRadioItem className="focus:bg-app-panel-hover focus:text-app-text" key={option} value={option}>
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
        <DropdownMenuContent align="end" className="w-44 border-app-border-muted bg-app-panel text-app-text shadow-xl shadow-slate-950/20">
          <DropdownMenuLabel>App status</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-app-border-muted" />
          <DropdownMenuRadioGroup value={statusFilter} onValueChange={(value) => onStatusFilterChange(value as MarketplaceStatusFilter)}>
            {marketplaceStatusOptions.map((option) => (
              <DropdownMenuRadioItem className="focus:bg-app-panel-hover focus:text-app-text" key={option.value} value={option.value}>
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
        <div className="grid min-h-40 flex-1 place-items-center rounded-xl border border-dashed border-app-border-muted bg-app-panel-muted p-6 text-center text-sm text-app-text-secondary">
          No apps match this view.
        </div>
      )}
    </section>
  );
}

function StarterGuidance({ appName, onDismiss, onReview }: NonNullable<MarketplaceAppListProps['starterGuidance']>) {
  return (
    <section aria-label="Starter app recommendation" className="mb-3 flex shrink-0 items-center justify-between gap-3 rounded-xl border border-app-border-muted bg-app-panel-muted px-3 py-2.5">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-app-accent/12 text-app-accent">
          <Sparkles aria-hidden="true" className="size-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-app-text">Start with {appName}</p>
          <p className="mt-0.5 text-xs leading-4 text-app-text-secondary">A private password manager and a gentle first app to try on your server.</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button className="rounded-md px-2 py-1 text-xs font-medium text-app-accent transition hover:bg-app-accent/12 hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent" onClick={onReview} type="button">
          Review
        </button>
        <button aria-label="Hide starter recommendation" className="grid size-6 place-items-center rounded-md text-app-text-muted transition hover:bg-app-panel-hover hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent" onClick={onDismiss} type="button">
          <X aria-hidden="true" className="size-3.5" />
        </button>
      </div>
    </section>
  );
}

function RestoreStarterGuidance({ onRestore }: { onRestore: () => void }) {
  return (
    <div className="mb-2 flex shrink-0 justify-end">
      <button className="rounded-md px-2 py-1 text-xs text-app-text-muted transition hover:bg-app-panel-hover hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent" onClick={onRestore} type="button">
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
        'relative flex h-[218px] flex-col overflow-hidden rounded-xl border border-app-border-muted bg-app-panel text-app-text shadow-lg shadow-slate-950/20 transition duration-200',
        'hover:-translate-y-0.5 hover:border-app-border-strong hover:bg-app-panel-hover hover:shadow-xl hover:shadow-slate-950/30',
        launcherCardAttentionClass(app),
        selected && 'border-app-accent bg-app-panel-hover ring-1 ring-app-accent/45 shadow-lg shadow-app-accent/25',
      )}
    >
      <button
        aria-pressed={selected}
        aria-label={`Select ${app.name}`}
        className="flex min-h-0 flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-inset"
        onClick={onSelect}
        type="button"
      >
        <AppImage app={app.app} className="h-32" presentation="artwork" />
        <span className="flex min-h-0 flex-1 flex-col p-3">
          <span className="min-w-0">
            <strong className="line-clamp-2 break-words text-sm font-semibold leading-5 text-app-text" title={app.name}>{app.name}</strong>
            <span className="mt-0.5 block truncate text-xs text-app-text-muted">{app.categoryLabel}</span>
          </span>
          <span className="mt-auto flex items-center gap-2 pt-2 text-xs leading-4 text-app-text-secondary">
            <AppStatusDot installing={installing} tone={marketplaceStatusTone(app.statusTone)} />
            <span>{installing ? 'Installing' : app.stateLabel}</span>
          </span>
        </span>
      </button>

      {canOpen && (
        <a
          aria-label={`Open ${app.name}`}
          className="absolute right-3 top-3 grid size-7 place-items-center rounded-lg border border-app-border-muted bg-app-surface/70 text-app-text-secondary backdrop-blur-sm transition hover:border-app-border-strong hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent"
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
  if (app.statusTone === 'danger') return 'border-app-status-danger-border';
  if (app.statusTone === 'warning' || app.statusTone === 'observed') return 'border-app-status-warning-border';
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

  return <span aria-label="App status" className={cn('size-2 shrink-0 rounded-full', toneClass)} />;
}
