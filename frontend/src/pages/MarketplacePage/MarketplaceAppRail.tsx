import { ArrowRight, Loader2, Settings2, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { StatusBadge } from '@/components/autark-os/StatusBadge';
import { ProjectDarkControlButton, ProjectPrimaryButton, ProjectWarningButton } from '@/components/primitives/ProjectButtons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { DiscoverAppView } from '@/types/discover';
import { MarketplaceAppDetailsCard } from './MarketplaceAppInformation';
import { marketplacePrimaryRoute } from './extensions/MarketplacePage.logic';
import { AppImage, marketplaceStatusTone, SupportBadge } from './MarketplacePage.shared';
import { DuplicateInstallWarningDialog } from './DuplicateInstallWarningDialog';
import { applicationDeepLinkForObservedService, applicationRouteWithManagementPanel } from '../ApplicationsPage/extensions/ApplicationsPage.deepLinks';

type MarketplaceAppRailProps = {
  appView: DiscoverAppView;
  detailsOpen: boolean;
  hasAppSettings: boolean;
  installLocked: boolean;
  installStatusMessage: string;
  installing: boolean;
  onConfigureSettings: () => void;
  onDetailsOpenChange: (open: boolean) => void;
  onInstallSecondCopy: () => void;
  onReviewInstall: () => void;
};

export function MarketplaceAppRail({ appView, detailsOpen, hasAppSettings, installLocked, installStatusMessage, installing, onConfigureSettings, onDetailsOpenChange, onInstallSecondCopy, onReviewInstall }: MarketplaceAppRailProps) {
  const detailsPanelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const detailsPanel = detailsPanelRef.current;
    if (!detailsPanel) {
      return;
    }
    if (detailsOpen) {
      detailsPanel.removeAttribute('inert');
      return;
    }
    detailsPanel.setAttribute('inert', '');
  }, [detailsOpen]);

  useEffect(() => {
    if (!detailsOpen) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || detailsPanelRef.current?.contains(target)) {
        return;
      }
      if (target instanceof HTMLElement && target.closest('[data-discover-details-toggle], [data-slot="dialog-content"], [data-slot="dialog-overlay"]')) {
        return;
      }

      onDetailsOpenChange(false);
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [detailsOpen, onDetailsOpenChange]);

  return (
    <aside aria-label="Selected Discover app" className="relative z-30 hidden min-h-0 border-l border-app-border-muted bg-app-surface/10 p-3 xl:block">
      <div className="relative z-30 h-full" onPointerDown={(event) => event.stopPropagation()}>
        <div aria-hidden={!detailsOpen} className="pointer-events-none absolute inset-y-0 right-0 z-20 w-[59.5rem] overflow-hidden">
          <MarketplaceAppDetailsPopover
            appView={appView}
            onClose={() => onDetailsOpenChange(false)}
            onInstallSecondCopy={onInstallSecondCopy}
            open={detailsOpen}
            onPanelRef={(panel) => {
              detailsPanelRef.current = panel;
            }}
          />
        </div>

        <section
          className={cn(
            'relative z-30 h-full overflow-y-auto rounded-2xl border border-app-border-muted bg-app-panel text-app-text shadow-lg shadow-slate-950/20 transition-[border-radius,box-shadow] duration-200 ease-out',
            detailsOpen && 'rounded-l-none shadow-2xl shadow-cyan-950/50',
          )}
        >
          <AppImage app={appView.app} presentation="artwork" className="h-32" />
          <div className="p-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-app-text-muted">{appView.categoryLabel}</p>
                <h3 className="mt-1 line-clamp-2 break-words text-lg font-semibold leading-6 text-app-text">{appView.name}</h3>
              </div>
              <StatusBadge className="shrink-0" tone={marketplaceStatusTone(appView.statusTone)}>{appView.stateLabel}</StatusBadge>
            </div>

            <p className="mt-3 line-clamp-2 text-sm leading-6 text-app-text-secondary">{appView.description}</p>

            <RailPrimaryAction
              appView={appView}
              installLocked={installLocked}
              installing={installing}
              onReviewInstall={onReviewInstall}
            />

            <div className={cn('mt-2 grid gap-2', hasAppSettings && 'grid-cols-2')}>
              <ProjectDarkControlButton className="h-8 px-2 text-xs" data-discover-details-toggle onClick={() => onDetailsOpenChange(!detailsOpen)} type="button">
                {detailsOpen ? <X className="size-3.5" /> : <Settings2 className="size-3.5" />}
                {detailsOpen ? 'Close details' : 'App details'}
              </ProjectDarkControlButton>
              {hasAppSettings ? (
                <ProjectDarkControlButton className="h-8 px-2 text-xs" onClick={onConfigureSettings} type="button">
                  <Settings2 className="size-3.5" />
                  App settings
                </ProjectDarkControlButton>
              ) : null}
            </div>

            <MarketplaceAppDetailsCard app={appView.app} className="mt-3" compact />

            {installLocked && (
              <p className="mt-3 rounded-lg border border-app-status-warning-border bg-app-status-warning-surface px-3 py-2 text-xs leading-5 text-app-status-warning-text">
                {installStatusMessage || 'Another app is installing. You can still review this app while it finishes.'}
              </p>
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}

function MarketplaceAppDetailsPopover({ appView, onClose, onInstallSecondCopy, onPanelRef, open }: { appView: DiscoverAppView; onClose: () => void; onInstallSecondCopy: () => void; onPanelRef: (panel: HTMLElement | null) => void; open: boolean }) {
  const [tab, setTab] = useState('overview');
  const [duplicateWarningOpen, setDuplicateWarningOpen] = useState(false);
  const reviewExistingHref = appView.observedService
    ? applicationDeepLinkForObservedService(appView.observedService, { panel: 'manage' })
    : applicationRouteWithManagementPanel(appView.reviewExistingHref) ?? null;

  useEffect(() => {
    setTab('overview');
  }, [appView.id]);

  return (
    <section
      aria-hidden={!open}
      aria-label="Discover app details"
      className={cn(
        'pointer-events-auto absolute right-[calc(17.5rem-1px)] top-0 h-full w-[42rem] max-w-[calc(100vw-24rem)] overflow-hidden rounded-l-2xl border border-r-0 bg-app-panel text-app-text transition-transform duration-300 ease-out motion-reduce:transition-none',
        open
          ? 'translate-x-0 border-app-border-strong shadow-2xl shadow-slate-950/40'
          : 'pointer-events-none translate-x-[calc(100%+19rem)] border-transparent shadow-none',
      )}
      ref={onPanelRef}
    >
      <div className="flex items-start justify-between gap-3 border-b border-app-border-muted px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-app-text">App details</p>
          <p className="mt-1 text-xs leading-5 text-app-text-muted">Everything you need to evaluate {appView.name} before installing it.</p>
        </div>
        <ProjectDarkControlButton aria-label="Close app details" onClick={onClose} size="icon" type="button">
          <X className="size-4" />
        </ProjectDarkControlButton>
      </div>

      <Tabs className="min-h-0" onValueChange={setTab} value={tab}>
        <TabsList className="w-full justify-start overflow-x-auto rounded-none border-b border-app-border-muted bg-app-panel px-3 py-2" variant="line">
          <TabsTrigger className="shrink-0 px-3 py-2 text-app-text-muted data-active:text-app-text" value="overview">Overview</TabsTrigger>
          <TabsTrigger className="shrink-0 px-3 py-2 text-app-text-muted data-active:text-app-text" value="details">Details</TabsTrigger>
        </TabsList>

        <div className="p-4">
          <TabsContent className="mt-0 grid gap-4" value="overview">
            <div className="flex min-w-0 items-start gap-3">
              <AppImage app={appView.app} size="large" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={marketplaceStatusTone(appView.statusTone)}>{appView.stateLabel}</StatusBadge>
                  <SupportBadge level={appView.app.supportLevel} />
                </div>
                <p className="mt-2 text-sm leading-6 text-app-text-secondary">{appView.app.plainLanguage}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <AppFactList items={appView.app.highlights} title="Key features" />
              <AppFactList items={appView.app.bestFor} title="Best for" />
            </div>
            {appView.installCopyWarningRequired && (
              <ProjectDarkControlButton className="w-fit" onClick={() => setDuplicateWarningOpen(true)} type="button">
                Install second copy
              </ProjectDarkControlButton>
            )}
          </TabsContent>

          <TabsContent className="mt-0" value="details">
            <MarketplaceAppDetailsCard app={appView.app} />
          </TabsContent>
        </div>
      </Tabs>

      <DuplicateInstallWarningDialog appName={appView.name} onInstallCopy={onInstallSecondCopy} onOpenChange={setDuplicateWarningOpen} open={duplicateWarningOpen} reviewHref={reviewExistingHref} />
    </section>
  );
}

function AppFactList({ items, title }: { items: string[]; title: string }) {
  return (
    <section className="rounded-xl border border-app-border-muted bg-app-panel-muted p-4">
      <h4 className="font-semibold text-app-text">{title}</h4>
      <ul className="mt-2 grid gap-1.5 text-sm leading-5 text-app-text-secondary">
        {items.map((item) => <li className="flex gap-2" key={item}><span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-app-accent" />{item}</li>)}
      </ul>
    </section>
  );
}

function RailPrimaryAction({ appView, installLocked, installing, onReviewInstall }: { appView: DiscoverAppView; installLocked: boolean; installing: boolean; onReviewInstall: () => void }) {
  const actionRoute = marketplacePrimaryRoute(appView);
  const actionDisabled = appView.primaryAction.disabled || installLocked || installing;
  const actionReason = appView.primaryAction.reason || (installing ? `${appView.name} is already installing.` : installLocked ? 'Another app is installing right now.' : 'This app action is not available right now.');
  const actionLabel = railActionLabel(appView, installing, installLocked);
  const attentionState = appView.statusTone === 'warning' || appView.statusTone === 'observed' || appView.statusTone === 'danger';
  const ButtonComponent = attentionState ? ProjectWarningButton : ProjectPrimaryButton;

  if (actionRoute && !appView.primaryAction.disabled) {
    return (
      <ButtonComponent asChild className="mt-4 w-full">
        <Link to={actionRoute}>
          {actionLabel}
          <ArrowRight className="size-4" />
        </Link>
      </ButtonComponent>
    );
  }

  return (
    <DisabledAction className="mt-4 w-full" disabled={actionDisabled} reason={actionReason}>
      <ButtonComponent className="w-full" disabled={actionDisabled} onClick={onReviewInstall} type="button">
        {installing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {actionLabel}
        {!installing && <ArrowRight className="size-4" />}
      </ButtonComponent>
    </DisabledAction>
  );
}

function railActionLabel(appView: DiscoverAppView, installing: boolean, installLocked: boolean) {
  if (installing) return 'Installing...';
  if (installLocked) return 'Install blocked';
  if (appView.primaryAction.id === 'review_setup') return 'Review install';
  if (appView.primaryAction.id === 'manage') return 'View in My Apps';
  return appView.primaryAction.label;
}
