import { ArrowRight, Loader2, Settings2, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { StatusBadge } from '@/components/autark-os/StatusBadge';
import { ProjectDarkControlButton, ProjectPrimaryButton, ProjectWarningButton } from '@/components/primitives/ProjectButtons';
import { cn } from '@/lib/utils';
import type { DiscoverAppView } from '@/types/discover';
import { MarketplaceAppDetailsCard } from './MarketplaceAppInformation';
import { marketplacePrimaryRoute } from './extensions/MarketplacePage.logic';
import { AppImage, marketplaceStatusTone } from './MarketplacePage.shared';

type MarketplaceAppRailProps = {
  appView: DiscoverAppView;
  hasAppSettings: boolean;
  installLocked: boolean;
  installStatusMessage: string;
  installing: boolean;
  onConfigureSettings: () => void;
  onReviewDetails: () => void;
};

export function MarketplaceAppRail({ appView, hasAppSettings, installLocked, installStatusMessage, installing, onConfigureSettings, onReviewDetails }: MarketplaceAppRailProps) {
  const actionRoute = marketplacePrimaryRoute(appView);
  const actionDisabled = appView.primaryAction.disabled;
  const actionReason = appView.primaryAction.reason || 'This app action is not available right now.';
  const actionLabel = railActionLabel(appView, installing);
  const attentionState = appView.statusTone === 'warning' || appView.statusTone === 'observed' || appView.statusTone === 'danger';

  return (
    <aside aria-label="Selected Discover app" className="hidden min-h-0 overflow-y-auto border-l border-sky-300/15 bg-slate-950/10 p-3 xl:block">
      <section className="overflow-hidden rounded-2xl border border-sky-300/20 bg-[#0b1831] text-slate-50 shadow-lg shadow-slate-950/20">
        <AppImage app={appView.app} presentation="artwork" className="h-32 border-sky-300/10" />
        <div className="p-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-400">{appView.categoryLabel}</p>
              <h3 className="mt-1 line-clamp-2 break-words text-lg font-semibold leading-6 text-white">{appView.name}</h3>
            </div>
            <StatusBadge className="shrink-0" tone={marketplaceStatusTone(appView.statusTone)}>{appView.stateLabel}</StatusBadge>
          </div>

          <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-200">{appView.description}</p>

          <RailPrimaryAction
            actionDisabled={actionDisabled}
            actionLabel={actionLabel}
            actionReason={actionReason}
            actionRoute={actionRoute}
            attentionState={attentionState}
            installing={installing}
            onReviewDetails={onReviewDetails}
          />

          <div className={cn('mt-2 grid gap-2', hasAppSettings && 'grid-cols-2')}>
            <ProjectDarkControlButton className="h-8 px-2 text-xs" onClick={onReviewDetails} type="button">
              Full details
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
            <p className="mt-3 rounded-lg border border-orange-400/35 bg-orange-500/10 px-3 py-2 text-xs leading-5 text-orange-100">
              {installStatusMessage || 'Another app is installing. You can still review this app while it finishes.'}
            </p>
          )}
        </div>
      </section>
    </aside>
  );
}

function RailPrimaryAction({
  actionDisabled,
  actionLabel,
  actionReason,
  actionRoute,
  attentionState,
  installing,
  onReviewDetails,
}: {
  actionDisabled: boolean;
  actionLabel: string;
  actionReason: string;
  actionRoute: string | null;
  attentionState: boolean;
  installing: boolean;
  onReviewDetails: () => void;
}) {
  const ButtonComponent = attentionState ? ProjectWarningButton : ProjectPrimaryButton;

  if (actionRoute && !actionDisabled) {
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
      <ButtonComponent className="w-full" disabled={actionDisabled} onClick={onReviewDetails} type="button">
        {installing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {actionLabel}
        {!installing && <ArrowRight className="size-4" />}
      </ButtonComponent>
    </DisabledAction>
  );
}

function railActionLabel(appView: DiscoverAppView, installing: boolean) {
  if (installing) {
    return 'View install progress';
  }
  if (appView.primaryAction.id === 'review_setup') {
    return 'Review install';
  }
  if (appView.primaryAction.id === 'manage') {
    return 'View in My Apps';
  }
  return appView.primaryAction.label;
}
