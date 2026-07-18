import { ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { StatusBadge } from '@/components/autark-os/StatusBadge';
import { ProjectPrimaryButton, ProjectWarningButton } from '@/components/primitives/ProjectButtons';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { DiscoverAppView } from '@/types/discover';
import { marketplaceCardToneClass, marketplacePrimaryRoute } from './extensions/MarketplacePage.logic';
import { AppImage, marketplaceStatusTone } from './MarketplacePage.shared';

type MarketplaceAppRailProps = {
  appView: DiscoverAppView;
  installLocked: boolean;
  installStatusMessage: string;
  installing: boolean;
  onReviewDetails: () => void;
};

export function MarketplaceAppRail({ appView, installLocked, installStatusMessage, installing, onReviewDetails }: MarketplaceAppRailProps) {
  const actionRoute = marketplacePrimaryRoute(appView);
  const actionDisabled = appView.primaryAction.disabled;
  const actionReason = appView.primaryAction.reason || 'This app action is not available right now.';
  const actionLabel = railActionLabel(appView, installing);
  const attentionState = appView.statusTone === 'warning' || appView.statusTone === 'observed' || appView.statusTone === 'danger';

  return (
    <aside aria-label="Selected Discover app" className="hidden xl:block xl:sticky xl:top-5 xl:self-start">
      <Card className={cn('overflow-hidden rounded-2xl border py-0 text-slate-50 shadow-xl shadow-slate-950/30', marketplaceCardToneClass(appView))}>
        <CardHeader className="gap-3 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Selected app</p>
          <div className="flex min-w-0 items-start gap-3">
            <AppImage app={appView.app} />
            <div className="min-w-0">
              <h3 className="line-clamp-2 break-words text-lg font-semibold leading-6 text-white">{appView.name}</h3>
              <p className="mt-1 text-xs text-slate-400">{appView.categoryLabel} · {appView.estimatedInstallTime}</p>
            </div>
          </div>
          <StatusBadge className="w-fit" tone={marketplaceStatusTone(appView.statusTone)}>{appView.stateLabel}</StatusBadge>
        </CardHeader>
        <CardContent className="border-t border-sky-400/20 p-4">
          <p className="text-sm leading-6 text-slate-200">{appView.stateDescription}</p>
          <p className="mt-4 rounded-lg bg-slate-950/30 p-3 text-sm leading-6 text-slate-300">{appView.description}</p>

          <RailPrimaryAction
            actionDisabled={actionDisabled}
            actionLabel={actionLabel}
            actionReason={actionReason}
            actionRoute={actionRoute}
            attentionState={attentionState}
            installing={installing}
            onReviewDetails={onReviewDetails}
          />

          {installLocked && (
            <p className="mt-3 rounded-lg border border-orange-400/35 bg-orange-500/10 px-3 py-2 text-xs leading-5 text-orange-100">
              {installStatusMessage || 'Another app is installing. You can still review this app while it finishes.'}
            </p>
          )}
        </CardContent>
      </Card>
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
