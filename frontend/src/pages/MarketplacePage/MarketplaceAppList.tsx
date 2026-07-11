import { CheckCircle2, ChevronDown, Clock3, Info, Loader2, MoreHorizontal, SlidersHorizontal, Sparkles, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProjectDarkControlButton } from '@/components/primitives/ProjectButtons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
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
import { cn } from '@/lib/utils';
import type { DiscoverAppView } from '@/types/discover';
import type { MarketplaceApp } from '@/types/marketplace';
import { sortOptions } from './extensions/MarketplacePage.constants';
import { marketplaceCardToneClass, marketplacePrimaryRoute } from './extensions/MarketplacePage.logic';
import { AppImage } from './MarketplacePage.shared';

type MarketplaceAppListProps = {
  apps: DiscoverAppView[];
  density?: 'basic' | 'full';
  installingAppId?: string | null;
  modeLabel?: string;
  selectedAppId: string;
  sortBy: string;
  onSelect: (appId: string) => void;
  onSortChange: (value: string) => void;
};

export function MarketplaceAppList({ apps, density = 'full', installingAppId = null, modeLabel = 'All apps', selectedAppId, sortBy, onSelect, onSortChange }: MarketplaceAppListProps) {
  const basic = density === 'basic';
  return (
    <Card className="rounded-lg border-sky-400/25 bg-slate-900 py-0 text-slate-50 shadow-xl shadow-slate-950/30">
      <CardHeader className="flex flex-row items-center justify-between gap-4 p-4 md:p-5">
        <div>
          <CardTitle className="text-lg font-bold text-slate-50">{modeLabel}</CardTitle>
          <p className="mt-1 text-sm text-slate-400">{apps.length} available</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
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
      </CardHeader>
      <CardContent className={cn('grid gap-4 p-4 pt-0 md:p-5 md:pt-0', basic ? 'sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-2' : 'md:grid-cols-2 2xl:grid-cols-3')}>
        {apps.length ? apps.map((app) => <AppStoreCard app={app} density={density} installing={installingAppId === app.id} isSelected={selectedAppId === app.id} key={app.id} onSelect={() => onSelect(app.id)} />) : (
          <div className="rounded-lg border border-sky-400/25 bg-slate-800 p-8 text-center text-sm text-slate-400 sm:col-span-2">No apps match this view.</div>
        )}
      </CardContent>
    </Card>
  );
}

function AppStoreCard({ app, density, installing, isSelected, onSelect }: { app: DiscoverAppView; density: 'basic' | 'full'; installing: boolean; isSelected: boolean; onSelect: () => void }) {
  if (density === 'basic') {
    return <BasicAppStoreCard app={app} installing={installing} isSelected={isSelected} onSelect={onSelect} />;
  }
  const primaryActionId = app.primaryAction.id;
  const actionVariant = primaryActionId === 'review_setup' ? 'default' : 'outline';
  const actionLabel = marketplaceActionLabel(app);
  const primaryDisabled = !installing && app.primaryAction.disabled;
  const primaryDisabledReason = app.primaryAction.reason || 'This app action is not available right now.';
  const primaryRoute = marketplacePrimaryRoute(app);
  const primaryActionContent = (
    <>
      {installing ? <Loader2 className="size-3.5 animate-spin" /> : primaryActionId === 'manage' ? <CheckCircle2 className="size-3.5" /> : <Sparkles className="size-3.5" />}
      {installing ? 'Installing' : actionLabel}
    </>
  );
  return (
    <div className={cn('group relative grid min-h-[258px] overflow-hidden rounded-xl border p-4 text-slate-50 shadow-lg shadow-slate-950/20 transition hover:-translate-y-0.5 hover:border-cyan-300/35', marketplaceCardToneClass(app), isSelected && 'border-cyan-300/35 outline outline-1 outline-cyan-300/40 shadow-lg shadow-cyan-950/30')}>
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
      <button className="relative z-10 grid w-full gap-4 text-left" onClick={onSelect} type="button">
        <span className="flex items-start gap-3">
          <AppImage app={app.app} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <strong className="line-clamp-2 min-w-0 break-words text-base text-slate-50" title={app.name}>{app.name}</strong>
              <Badge className={stateBadgeClass(app.statusTone)} variant="outline">{app.stateLabel}</Badge>
              {installing && <Badge className="gap-1 border-cyan-300/35 bg-cyan-400/10 text-cyan-200" variant="outline"><Loader2 className="size-3 animate-spin" />Installing</Badge>}
            </span>
            <span className="mt-1 block text-xs text-slate-400">{app.categoryLabel} · {app.estimatedInstallTime} · {app.difficulty}</span>
          </span>
        </span>

        <span>
          <span className="block text-lg font-black leading-tight text-slate-50">{outcomeCopy(app.app)}</span>
          <span className="mt-2 line-clamp-2 block min-h-10 text-sm leading-5 text-slate-300">{app.description}</span>
        </span>
      </button>

      <div className="relative z-10 mt-auto flex items-center justify-between gap-3 border-t border-sky-400/25 pt-3">
        <div className="min-w-0 text-xs text-slate-400">{app.serviceKindLabel}</div>
        <DisabledAction disabled={primaryDisabled} reason={primaryDisabledReason}>
          {primaryRoute && !primaryDisabled ? (
            <Button asChild className={cn('h-8 px-3 text-xs', primaryActionId === 'manage' && 'border-cyan-300/35 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/15', primaryActionId === 'review_existing' && 'border-orange-400/40 bg-orange-500/10 text-orange-200 hover:bg-orange-500/15')} variant={actionVariant}>
              <Link to={primaryRoute}>{primaryActionContent}</Link>
            </Button>
          ) : (
            <Button className={cn('h-8 px-3 text-xs', primaryActionId === 'review_setup' && 'border-cyan-300/35 bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-950/30 hover:bg-cyan-200', primaryActionId === 'manage' && 'border-cyan-300/35 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/15', primaryActionId === 'review_existing' && 'border-orange-400/40 bg-orange-500/10 text-orange-200 hover:bg-orange-500/15')} disabled={primaryDisabled} onClick={onSelect} type="button" variant={actionVariant}>
              {primaryActionContent}
            </Button>
          )}
        </DisabledAction>
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
            <ProjectDarkControlButton aria-label={`${app.name} actions`} size="icon" type="button">
              <MoreHorizontal className="size-4" />
            </ProjectDarkControlButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 border-sky-400/30 bg-slate-900 text-slate-50 shadow-xl shadow-slate-950/30">
            <DropdownMenuLabel>{app.name}</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-sky-400/20" />
            <DropdownMenuItem className="focus:bg-slate-700 focus:text-white" onSelect={onSelect}>
              View setup
              <Info className="ml-auto size-4 text-slate-400" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function BasicAppStoreCard({ app, installing, isSelected, onSelect }: { app: DiscoverAppView; installing: boolean; isSelected: boolean; onSelect: () => void }) {
  const actionLabel = marketplaceActionLabel(app);
  const primaryRoute = marketplacePrimaryRoute(app);
  const cardClassName = cn(
    'group grid min-h-[190px] w-full content-between rounded-xl border border-sky-400/25 bg-slate-900 p-4 text-left text-slate-50 shadow-lg shadow-slate-950/20 transition',
    'hover:-translate-y-0.5 hover:border-cyan-300/35 hover:bg-slate-700 hover:shadow-lg hover:shadow-cyan-950/30',
    isSelected && 'border-cyan-300/35 outline outline-1 outline-cyan-300/40 shadow-lg shadow-cyan-950/30',
  );
  const ctaClassName = 'mt-4 grid h-10 place-items-center rounded-lg bg-cyan-300 px-4 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-950/30 transition group-hover:bg-cyan-200';
  const content = (
    <>
      <span className="grid gap-4">
        <span className="flex items-start gap-3">
          <span className="grid size-16 shrink-0 place-items-center rounded-xl border border-sky-400/25 bg-slate-800 shadow-sm shadow-slate-950/20">
            <AppImage app={app.app} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 min-h-10 break-words text-base font-bold text-slate-50" title={app.name}>{app.name}</span>
            <span className="mt-1 block truncate text-xs font-medium text-slate-400">{app.categoryLabel}</span>
            <Badge className={cn('mt-2 rounded-full px-2 py-0.5 text-[0.7rem]', stateBadgeClass(app.statusTone))} variant="outline">
              {app.stateLabel}
            </Badge>
            {installing && (
              <Badge className="mt-2 gap-1 rounded-full border-cyan-300/35 bg-cyan-400/10 px-2 py-0.5 text-[0.7rem] text-cyan-200" variant="outline">
                <Loader2 className="size-3 animate-spin" />
                Installing
              </Badge>
            )}
          </span>
        </span>

        <span className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="size-3.5 text-cyan-200" />
            {app.estimatedInstallTime}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Zap className="size-3.5 text-cyan-200" />
            {app.difficulty}
          </span>
        </span>
      </span>

      <span className={ctaClassName}>
        <span className="inline-flex items-center gap-2">
          {installing && <Loader2 className="size-3.5 animate-spin" />}
          {installing ? 'Installing' : actionLabel}
        </span>
      </span>
    </>
  );

  if (primaryRoute) {
    return (
      <Link className={cardClassName} to={primaryRoute}>
        {content}
      </Link>
    );
  }

  return (
    <button
      className={cardClassName}
      onClick={onSelect}
      type="button"
    >
      {content}
    </button>
  );
}

function marketplaceActionLabel(app: DiscoverAppView) {
  return app.primaryAction.id === 'review_setup' ? 'Install' : app.primaryAction.label;
}

function stateBadgeClass(tone: string) {
  if (tone === 'success') {
    return 'border-emerald-300/35 bg-emerald-500/10 text-emerald-200';
  }
  if (tone === 'warning') {
    return 'border-orange-400/40 bg-orange-500/10 text-orange-200';
  }
  if (tone === 'observed') {
    return 'border-orange-400/40 bg-orange-500/10 text-orange-200';
  }
  if (tone === 'danger') {
    return 'border-red-400/35 bg-red-500/10 text-red-200';
  }
  if (tone === 'neutral') {
    return 'border-sky-400/25 bg-slate-800 text-slate-300';
  }
  return 'border-cyan-300/35 bg-cyan-400/10 text-cyan-200';
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
