import { CheckCircle2, ChevronDown, Clock3, Info, MoreHorizontal, SlidersHorizontal, Sparkles } from 'lucide-react';
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
import type { HostInventoryResource } from '@/types/host';
import type { MarketplaceApp } from '@/types/marketplace';
import { sortOptions } from './extensions/MarketplacePage.constants';
import { AppImage, CatalogConfidenceBadge, SupportBadge } from './MarketplacePage.shared';

type MarketplaceAppListProps = {
  apps: MarketplaceApp[];
  foundResourcesByAppId?: Map<string, HostInventoryResource>;
  installedAppIds: Set<string>;
  modeLabel?: string;
  selectedAppId: string;
  sortBy: string;
  onSelect: (appId: string) => void;
  onSortChange: (value: string) => void;
};

export function MarketplaceAppList({ apps, foundResourcesByAppId = new Map(), installedAppIds, modeLabel = 'All apps', selectedAppId, sortBy, onSelect, onSortChange }: MarketplaceAppListProps) {
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
        {apps.length ? apps.map((app) => <AppStoreCard app={app} foundResource={foundResourcesByAppId.get(app.id) ?? null} installed={installedAppIds.has(app.id)} isSelected={selectedAppId === app.id} key={app.id} onSelect={() => onSelect(app.id)} />) : (
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-8 text-center text-sm text-slate-400">No apps match this view.</div>
        )}
      </CardContent>
    </Card>
  );
}

function AppStoreCard({ app, foundResource, installed, isSelected, onSelect }: { app: MarketplaceApp; foundResource: HostInventoryResource | null; installed: boolean; isSelected: boolean; onSelect: () => void }) {
  const foundLabel = foundResource ? marketplaceFoundLabel(foundResource) : '';
  return (
    <div className={cn('group relative overflow-hidden rounded-2xl border border-slate-700/25 bg-slate-950/48 p-4 text-slate-100 shadow-po-card transition hover:-translate-y-0.5 hover:border-violet-300/45 hover:bg-slate-900/70', isSelected && 'border-violet-300/55 bg-violet-950/20 shadow-po-brand-glow')}>
      <div className="absolute inset-0 bg-po-card-hover-sheen opacity-0 transition group-hover:opacity-100" />
      <button className="relative z-10 grid w-full gap-4 text-left" onClick={onSelect} type="button">
        <span className="flex items-start gap-3">
          <AppImage app={app} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <strong className="truncate text-base text-white">{app.name}</strong>
              {installed && <Badge className="border-emerald-300/25 bg-emerald-500/10 text-emerald-100" variant="outline">Installed</Badge>}
              {!installed && foundResource && <Badge className="border-amber-300/25 bg-amber-500/10 text-amber-100" variant="outline">{foundLabel}</Badge>}
              <CatalogConfidenceBadge app={app} />
            </span>
            <span className="mt-1 block text-xs text-slate-400">{app.category} · {serviceKindLabel(app.usage.kind)}</span>
          </span>
        </span>

        <span>
          <span className="block text-lg font-black leading-tight text-white">{outcomeCopy(app)}</span>
          <span className="mt-2 line-clamp-2 block min-h-10 text-sm leading-5 text-slate-300">{app.plainLanguage || app.description}</span>
        </span>

        <span className="flex flex-wrap gap-2">
          <Badge className="border-violet-300/20 bg-violet-500/10 text-violet-100" variant="outline">
            <Clock3 className="mr-1 size-3" />
            {app.installTime}
          </Badge>
          <Badge className={cn('border text-xs', app.difficulty.toLowerCase().includes('easy') ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100' : 'border-amber-300/20 bg-amber-500/10 text-amber-100')} variant="outline">
            {app.difficulty}
          </Badge>
          <SupportBadge level={app.supportLevel} />
        </span>
      </button>

      <div className="relative z-10 mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3 text-xs text-slate-400">
          <span>{app.smokeTests.filter((test) => test.status === 'Passed').length}/{app.smokeTests.length} checks passed</span>
          <span>{app.source} template</span>
        </div>
        <Button className={cn('h-8 px-3 text-xs', installed ? 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15' : foundResource ? 'border-amber-300/25 bg-amber-500/10 text-amber-100 hover:bg-amber-500/15' : poButtonClass('primary'))} onClick={onSelect} type="button" variant={installed || foundResource ? 'outline' : 'default'}>
          {installed ? <CheckCircle2 className="size-3.5" /> : <Sparkles className="size-3.5" />}
          {installed ? 'Manage' : foundResource ? 'Resolve' : 'Install'}
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
              View details
              <Info className="ml-auto size-4 text-slate-500" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function marketplaceFoundLabel(resource: HostInventoryResource) {
  if (resource.ownershipState === 'foreign_project_os') return 'Owned by another Project OS';
  if (resource.ownershipState === 'legacy_project_os') return 'Recoverable';
  if (resource.ownershipState === 'unknown_conflict') return 'Blocked';
  return 'Found on server';
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

function serviceKindLabel(kind: string) {
  const labels: Record<string, string> = {
    'web-app': 'App',
    'companion-service': 'Connect service',
    'admin-service': 'Setup tool',
    'background-service': 'Background',
    infrastructure: 'Infrastructure',
  };
  return labels[kind] || kind.replaceAll('-', ' ');
}
