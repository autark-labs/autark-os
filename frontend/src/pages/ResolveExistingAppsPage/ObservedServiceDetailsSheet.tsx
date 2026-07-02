import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Loader2, Pin, PinOff, RotateCcw, Search, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ObservedServicesAPIClient } from '@/api/ObservedServicesAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { DisabledAction } from '@/components/project-os/DisabledAction';
import { showActionErrorNotification } from '@/lib/actionNotifications';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  catalogAppIsManaged,
  setApplicationStateFromActionResultCache,
  useApplicationStateRepository,
} from '@/repositories/applicationStateRepository';
import type { ObservedServiceActionResult, ObservedServiceAdoptionPlan, ObservedServiceView } from '@/types/observedService';

type ObservedServiceDetailsSheetProps = {
  onActionComplete: (result: ObservedServiceActionResult) => void;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => Promise<void>;
  open: boolean;
  service: ObservedServiceView | null;
};

export function ObservedServiceDetailsSheet({ onActionComplete, onOpenChange, onRefresh, open, service }: ObservedServiceDetailsSheetProps) {
  const queryClient = useQueryClient();
  const appState = useApplicationStateRepository();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [matchValue, setMatchValue] = useState('');
  const [plan, setPlan] = useState<ObservedServiceAdoptionPlan | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setMatchValue(service?.catalogAppId || '');
    setPlan(null);
    setConfirmation('');
    setLocalError(null);
  }, [service?.id, service?.catalogAppId]);

  const actions = useMemo(() => new Map((service?.availableActions || []).map((action) => [action.id, action])), [service?.availableActions]);

  if (!service) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="border-slate-700 bg-slate-950 text-slate-100 sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Service not found</SheetTitle>
            <SheetDescription>Project OS could not find that observed service in the current inventory.</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    );
  }

  const currentService = service;

  const canPin = Boolean(actions.get('pin')) && !service.pinned;
  const canUnpin = Boolean(actions.get('unpin')) && service.pinned;
  const canChangeMatch = Boolean(actions.get('change_match'));
  const adoptionAction = actions.get('adoption_plan');
  const canAdopt = Boolean(adoptionAction) && !adoptionAction?.disabled && service.adoptable;
  const installCopyAction = actions.get('install_copy');
  const installCopyHref = installCopyAction?.href || (service.catalogAppId ? `/discover?app=${encodeURIComponent(service.catalogAppId)}` : null);
  const canInstallCopy = Boolean(installCopyHref) && !catalogAppIsManaged(appState.applicationState, service.catalogAppId);
  const blockedReasons = planList(plan?.blockedReasons);
  const planDisabledReason = typeof plan?.disabledReason === 'string' ? plan.disabledReason : '';
  const planAvailable = plan?.available !== false && !planDisabledReason;
  const confirmationText = typeof plan?.confirmationText === 'string' ? plan.confirmationText : '';
  const adoptDisabled = busyAction !== null || !planAvailable || blockedReasons.length > 0 || (confirmationText.length > 0 && confirmation !== confirmationText);

  async function runMutation(actionId: string, mutation: () => Promise<ObservedServiceActionResult>, options: { refresh?: boolean } = {}) {
    setBusyAction(actionId);
    setLocalError(null);
    try {
      const result = await mutation();
      const stateUpdated = setApplicationStateFromActionResultCache(queryClient, result);
      onActionComplete(result);
      if (!stateUpdated && options.refresh !== false) {
        await onRefresh();
      }
    } catch (error) {
      const message = apiErrorMessage(error, 'Service action could not be completed.');
      setLocalError(message);
      showActionErrorNotification(error, 'Service action failed');
    } finally {
      setBusyAction(null);
    }
  }

  async function loadPlan() {
    setBusyAction('adoption_plan');
    setLocalError(null);
    try {
      setPlan(await ObservedServicesAPIClient.adoptionPlan(currentService.id));
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Adoption plan could not be loaded.');
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto border-slate-700 bg-slate-950 text-slate-100 sm:max-w-xl">
        <SheetHeader className="border-b border-slate-800 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3 pr-10">
            <div className="min-w-0">
              <SheetTitle className="truncate text-xl font-black text-white">{service.displayName}</SheetTitle>
              <SheetDescription className="mt-2 leading-6 text-slate-400">{service.userStatusDescription || 'Project OS observes this service but does not manage it.'}</SheetDescription>
            </div>
            <Badge className={stateBadgeClass(service)} variant="outline">{service.userStatusLabel || (service.pinned ? 'Pinned' : 'Found')}</Badge>
          </div>
        </SheetHeader>

        <div className="grid gap-5 px-4">
          {localError && (
            <Alert className="border-red-300/25 bg-red-500/10 text-red-100">
              <ShieldAlert className="size-4" />
              <AlertTitle>Action needs attention</AlertTitle>
              <AlertDescription>{localError}</AlertDescription>
            </Alert>
          )}

          <section className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900/45 p-4">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <Detail label="Runtime" value={service.runtimeState || 'Unknown'} />
              <Detail label="Access" value={service.accessScope || 'Unknown'} />
              <Detail label="Source" value={service.source || 'Unknown'} />
              <Detail label="Catalog match" value={service.catalogAppId || 'Unmatched'} />
            </div>
          </section>

          <section className="grid gap-3">
            <h3 className="text-sm font-black uppercase tracking-normal text-slate-400">Actions</h3>
            <div className="flex flex-wrap gap-2">
              {service.url && (
                <Button asChild className="bg-sky-500 text-slate-950 hover:bg-sky-400" size="sm">
                  <a href={service.url} rel="noreferrer" target="_blank">
                    <ExternalLink className="size-4" />
                    Open
                  </a>
                </Button>
              )}
              {canPin && (
                <DisabledAction disabled={busyAction !== null} reason="Wait for the current service action to finish before pinning.">
                  <Button disabled={busyAction !== null} onClick={() => runMutation('pin', () => ObservedServicesAPIClient.pin(service.id), { refresh: false })} size="sm" type="button">
                    {busyAction === 'pin' ? <Loader2 className="size-4 animate-spin" /> : <Pin className="size-4" />}
                    Pin to My Apps
                  </Button>
                </DisabledAction>
              )}
              {canUnpin && (
                <DisabledAction disabled={busyAction !== null} reason="Wait for the current service action to finish before unpinning.">
                  <Button className="border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-900" disabled={busyAction !== null} onClick={() => runMutation('unpin', () => ObservedServicesAPIClient.unpin(service.id), { refresh: false })} size="sm" type="button" variant="outline">
                    {busyAction === 'unpin' ? <Loader2 className="size-4 animate-spin" /> : <PinOff className="size-4" />}
                    Unpin from My Apps
                  </Button>
                </DisabledAction>
              )}
              {canInstallCopy && (
                <Button asChild className="border-amber-300/25 bg-amber-500/10 text-amber-100 hover:bg-amber-500/15" size="sm" variant="outline">
                  <Link to={installCopyHref || '/discover'}>
                    <ShieldAlert className="size-4" />
                    Install separate copy
                  </Link>
                </Button>
              )}
            </div>
          </section>

          {canChangeMatch && (
            <section className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900/45 p-4">
              <div>
                <h3 className="font-bold text-white">Change app match</h3>
                <p className="mt-1 text-sm leading-6 text-slate-400">Use a catalog app id when this service should affect Marketplace warnings for a specific app.</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="observed-service-match">Catalog app id</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input id="observed-service-match" onChange={(event) => setMatchValue(event.target.value)} placeholder="vaultwarden" value={matchValue} />
                  <DisabledAction disabled={busyAction !== null} reason="Wait for the current service action to finish before saving this match.">
                    <Button disabled={busyAction !== null} onClick={() => runMutation('match', () => ObservedServicesAPIClient.match(service.id, matchValue.trim() || null))} type="button" variant="outline">
                      {busyAction === 'match' ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                      Save match
                    </Button>
                  </DisabledAction>
                </div>
              </div>
            </section>
          )}

          {adoptionAction && (
            <section className="grid gap-3 rounded-lg border border-amber-300/20 bg-amber-500/8 p-4">
              <div>
                <h3 className="font-bold text-white">Adoption plan</h3>
                <p className="mt-1 text-sm leading-6 text-amber-100/75">{adoptionAction.disabled ? adoptionAction.reason || 'This service cannot be adopted safely yet.' : 'Review the plan before Project OS takes control of this service.'}</p>
              </div>
              {canAdopt && !plan && (
                <DisabledAction disabled={busyAction !== null} reason="Wait for the current service action to finish before loading an adoption plan.">
                  <Button className="w-fit bg-amber-500 text-slate-950 hover:bg-amber-400" disabled={busyAction !== null} onClick={loadPlan} type="button">
                    {busyAction === 'adoption_plan' ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                    Review adoption plan
                  </Button>
                </DisabledAction>
              )}
              {plan && (
                <div className="grid gap-3 text-sm">
                  <p className="leading-6 text-amber-50/85">{typeof plan.summary === 'string' ? plan.summary : 'Project OS prepared an adoption plan for this service.'}</p>
                  <PlanList title="Containers" items={planList(plan.containers)} />
                  <PlanList title="Steps" items={planList(plan.steps)} />
                  <PlanList title="Warnings" items={planList(plan.warnings)} />
                  <PlanList title="Labels to apply" items={planList(plan.labelsToApply ?? plan.labels)} />
                  <PlanList title="Blocked" items={[...blockedReasons, ...(planDisabledReason ? [planDisabledReason] : [])]} />
                  {typeof plan.dataPreservation === 'string' && (
                    <p className="rounded-lg border border-slate-800 bg-slate-950/45 p-3 text-slate-300">{plan.dataPreservation}</p>
                  )}
                  {confirmationText && (
                    <div className="grid gap-2">
                      <Label htmlFor="adoption-confirmation">Type {confirmationText}</Label>
                      <Input id="adoption-confirmation" onChange={(event) => setConfirmation(event.target.value)} value={confirmation} />
                    </div>
                  )}
                  {planAvailable && (
                    <DisabledAction disabled={adoptDisabled} reason={busyAction !== null ? 'Wait for the current service action to finish before adopting.' : blockedReasons.length > 0 ? 'Resolve the blocked adoption items before adopting this service.' : confirmationText ? 'Type the confirmation text exactly before adopting this service.' : 'This adoption plan is not available yet.'}>
                      <Button className="w-fit bg-amber-500 text-slate-950 hover:bg-amber-400" disabled={adoptDisabled} onClick={() => runMutation('adopt', () => ObservedServicesAPIClient.adopt(service.id, confirmation), { refresh: false })} type="button">
                        {busyAction === 'adopt' ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                        Adopt service
                      </Button>
                    </DisabledAction>
                  )}
                </div>
              )}
            </section>
          )}

          <Separator className="bg-slate-800" />
          <section className="grid gap-2 text-sm text-slate-400">
            <h3 className="font-bold text-white">Technical details</h3>
            {Object.entries(service.metadata || {}).length ? Object.entries(service.metadata).map(([key, value]) => <Detail key={key} label={key} value={value || 'Unknown'} />) : <p>No extra details reported.</p>}
          </section>
        </div>

        <SheetFooter className="border-t border-slate-800">
          <Button className="border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-900" onClick={() => onOpenChange(false)} type="button" variant="outline">Close</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold uppercase tracking-normal text-slate-500">{label}</dt>
      <dd className="m-0 mt-1 truncate text-slate-200" title={value}>{value}</dd>
    </div>
  );
}

function PlanList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) {
    return null;
  }
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-3">
      <p className="text-xs font-bold uppercase tracking-normal text-slate-500">{title}</p>
      <ul className="mt-2 grid gap-1 text-slate-300">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function planList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function stateBadgeClass(service: ObservedServiceView) {
  return cn(
    service.userStatus === 'pinned_external' && 'border-sky-300/25 bg-sky-500/10 text-sky-100',
    (service.userStatus === 'recoverable' || service.userStatus === 'failed_install') && 'border-amber-300/25 bg-amber-500/10 text-amber-100',
    (service.userStatus === 'managed_elsewhere' || service.userStatus === 'blocked') && 'border-red-300/25 bg-red-500/10 text-red-100',
    !['pinned_external', 'recoverable', 'failed_install', 'managed_elsewhere', 'blocked'].includes(service.userStatus) && 'border-slate-600 bg-slate-800/60 text-slate-300',
  );
}
