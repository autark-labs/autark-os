import { CheckCircle2, ChevronDown, Info, MoreHorizontal, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { poButtonClass } from '@/lib/projectOsStyleKit';
import { cn } from '@/lib/utils';
import type { DiscoverAppView } from '@/types/discover';
import type { MarketplaceApp } from '@/types/marketplace';
import { sortOptions } from './extensions/MarketplacePage.constants';
import { AppImage } from './MarketplacePage.shared';

type MarketplaceAppListProps = {
  apps: DiscoverAppView[];
  modeLabel?: string;
  selectedAppId: string;
  sortBy: string;
  onSelect: (appId: string) => void;
  onSortChange: (value: string) => void;
};

export function MarketplaceAppList({ apps, modeLabel = 'All apps', selectedAppId, sortBy, onSelect, onSortChange }: MarketplaceAppListProps) {
  return (
    <Card className="rounded-lg border-white/10 bg-slate-900/55 py-0 text-slate-100 shadow-po-panel">
      <CardHeader className="flex flex-row items-center justify-between gap-4 p-5">
        <div>
          <CardTitle className="text-lg font-bold text-white">{modeLabel}</CardTitle>
          <p className="mt-1 text-sm text-slate-400">{apps.length} available</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className={poButtonClass('quiet')} type="button" variant="outline">
              <SlidersHorizontal className="size-4" />
              {sortBy}
              <ChevronDown className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 border-slate-700 bg-slate-950 text-slate-100">
            <DropdownMenuLabel>Sort apps</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-slate-800" />
            <DropdownMenuRadioGroup value={sortBy} onValueChange={onSortChange}>
              {sortOptions.map((option) => (
                <DropdownMenuRadioItem className="focus:bg-slate-800 focus:text-white" key={option} value={option}>
                  {option}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="grid gap-4 p-5 pt-0 md:grid-cols-2 2xl:grid-cols-3">
        {apps.length ? apps.map((app) => <AppStoreCard app={app} isSelected={selectedAppId === app.id} key={app.id} onSelect={() => onSelect(app.id)} />) : (
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-8 text-center text-sm text-slate-400">No apps match this view.</div>
        )}
      </CardContent>
    </Card>
  );
}

function AppStoreCard({ app, isSelected, onSelect }: { app: DiscoverAppView; isSelected: boolean; onSelect: () => void }) {
  const actionVariant = app.primaryAction === 'review_setup' ? 'default' : 'outline';
  return (
    <div className={cn('group relative overflow-hidden rounded-2xl border border-slate-700/25 bg-slate-950/48 p-4 text-slate-100 shadow-po-card transition hover:-translate-y-0.5 hover:border-violet-300/45 hover:bg-slate-900/70', isSelected && 'border-violet-300/55 bg-violet-950/20 shadow-po-brand-glow')}>
      <div className="absolute inset-0 bg-po-card-hover-sheen opacity-0 transition group-hover:opacity-100" />
      <button className="relative z-10 grid w-full gap-4 text-left" onClick={onSelect} type="button">
        <span className="flex items-start gap-3">
          <AppImage app={app.app} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <strong className="truncate text-base text-white">{app.name}</strong>
              <Badge className={stateBadgeClass(app.state)} variant="outline">{app.stateLabel}</Badge>
            </span>
            <span className="mt-1 block text-xs text-slate-400">{app.categoryLabel} · {app.estimatedInstallTime} · {app.difficulty}</span>
          </span>
        </span>

        <span>
          <span className="block text-lg font-black leading-tight text-white">{outcomeCopy(app.app)}</span>
          <span className="mt-2 line-clamp-2 block min-h-10 text-sm leading-5 text-slate-300">{app.description}</span>
        </span>

        {app.primaryAction === 'resolve' && (
          <span className="line-clamp-2 rounded-lg border border-amber-300/20 bg-amber-500/10 p-3 text-sm leading-5 text-amber-100/85">
            {app.stateDescription}
          </span>
        )}
      </button>

      <div className="relative z-10 mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
        <div className="min-w-0 text-xs text-slate-400">{app.serviceKindLabel}</div>
        <Button className={cn('h-8 px-3 text-xs', app.primaryAction === 'review_setup' && poButtonClass('primary'), app.primaryAction === 'manage' && 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15', app.primaryAction === 'resolve' && 'border-amber-300/25 bg-amber-500/10 text-amber-100 hover:bg-amber-500/15')} disabled={app.primaryAction === 'unavailable'} onClick={onSelect} type="button" variant={actionVariant}>
          {app.primaryAction === 'manage' ? <CheckCircle2 className="size-3.5" /> : <Sparkles className="size-3.5" />}
          {app.primaryActionLabel}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label={`${app.name} actions`} className={poButtonClass('quietIcon')} size="icon" type="button" variant="outline">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 border-slate-700 bg-slate-950 text-slate-100">
            <DropdownMenuLabel>{app.name}</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-slate-800" />
            <DropdownMenuItem className="focus:bg-slate-800 focus:text-white" onSelect={onSelect}>
              View setup
              <Info className="ml-auto size-4 text-slate-500" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function stateBadgeClass(state: string) {
  if (state === 'installed') {
    return 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100';
  }
  if (state === 'found_on_server' || state === 'managed_elsewhere' || state === 'blocked') {
    return 'border-amber-300/25 bg-amber-500/10 text-amber-100';
  }
  if (state === 'coming_soon') {
    return 'border-slate-600 bg-slate-800/60 text-slate-300';
  }
  return 'border-sky-300/25 bg-sky-500/10 text-sky-100';
}

function outcomeCopy(app: MarketplaceApp) {
  const known: Record<string, string> = {
    adguard: 'Block ads across your home',
    'adguard-home': 'Block ads across your home',
    gitea: 'Host your own code',
    'home-assistant': 'Control your smart home',
    immich: 'Organize your memories',
    jellyfin: 'Stream anywhere',
    nextcloud: 'Store and share files',
    'obsidian-livesync': 'Sync your notes privately',
    vaultwarden: 'Protect your passwords',
  };
  return known[app.id] || app.shortValue || app.plainLanguage || app.description;
}
