import { useEffect, useState } from 'react';
import { Download, Loader2, Pin, PinOff, RotateCcw, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiErrorMessage } from '@/api/httpClient';
import { DisabledAction } from '@/components/project-os/DisabledAction';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ObservedServiceAdoptionPlan } from '@/types/observedService';
import type { ApplicationActionHandlers, ApplicationSurfaceItem } from '../extensions/ApplicationsPage.types';

type ObservedServiceManagementSectionProps = {
  actions: Pick<
    ApplicationActionHandlers,
    | 'onAdoptObservedService'
    | 'onLoadObservedServiceAdoptionPlan'
    | 'onPinObservedService'
    | 'onUnpinObservedService'
  >;
  item: ApplicationSurfaceItem;
};

type ObservedServiceAction = 'adopt' | 'adoption_plan' | 'clear_match' | 'match' | 'pin' | 'unpin';

export function ObservedServiceManagementSection({ actions, item }: ObservedServiceManagementSectionProps) {
  const [busyAction, setBusyAction] = useState<ObservedServiceAction | null>(null);
  const [plan, setPlan] = useState<ObservedServiceAdoptionPlan | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const serviceId = item.sourceId || item.id;
  const pinAction = item.availableActions.find((action) => action.id === 'pin');
  const unpinAction = item.availableActions.find((action) => action.id === 'unpin');
  const adoptionAction = item.availableActions.find((action) => action.id === 'adoption_plan');
  const installCopyAction = item.availableActions.find((action) => action.id === 'install_copy');
  const isFound = item.managementState === 'found';
  const isLinked = item.managementState === 'linked';

  useEffect(() => {
    setPlan(null);
    setConfirmation('');
    setLocalError(null);
  }, [item.id]);

  if (!isFound && !isLinked) {
    return null;
  }

  const canPin = isFound && Boolean(pinAction) && !pinAction?.disabled;
  const canUnpin = isLinked && Boolean(unpinAction) && !unpinAction?.disabled;
  const canLoadAdoptionPlan = Boolean(adoptionAction) && !adoptionAction?.disabled;
  const blockedReasons = planList(plan?.blockedReasons);
  const planDisabledReason = typeof plan?.disabledReason === 'string' ? plan.disabledReason : '';
  const planAvailable = plan?.available !== false && !planDisabledReason && blockedReasons.length === 0;
  const confirmationText = typeof plan?.confirmationText === 'string' ? plan.confirmationText : '';
  const adoptDisabled = busyAction !== null || !planAvailable || (confirmationText.length > 0 && confirmation !== confirmationText);
  const serviceCopy = observedServiceCopy(item);

  async function runObservedServiceAction(nextAction: 'pin' | 'unpin') {
    setBusyAction(nextAction);
    setLocalError(null);
    try {
      if (nextAction === 'pin') {
        await actions.onPinObservedService(serviceId);
      } else {
        await actions.onUnpinObservedService(serviceId);
      }
    } catch (error) {
      setLocalError(apiErrorMessage(error, 'Service action could not be completed.'));
    } finally {
      setBusyAction(null);
    }
  }

  async function loadPlan() {
    setBusyAction('adoption_plan');
    setLocalError(null);
    try {
      setPlan(await actions.onLoadObservedServiceAdoptionPlan(serviceId));
    } catch (error) {
      setLocalError(apiErrorMessage(error, 'Recovery plan could not be loaded.'));
    } finally {
      setBusyAction(null);
    }
  }

  async function adoptService() {
    setBusyAction('adopt');
    setLocalError(null);
    try {
      await actions.onAdoptObservedService(serviceId, confirmation);
    } catch (error) {
      setLocalError(apiErrorMessage(error, 'Service could not be adopted.'));
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="grid gap-3 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-100">{serviceCopy.title}</p>
          <p className="mt-1 text-xs leading-5 text-amber-100/75">{serviceCopy.description}</p>
        </div>
        <Badge className="shrink-0 border-amber-300/30 bg-slate-900 text-amber-100" variant="outline">
          {item.userStatusLabel || (isLinked ? 'Linked' : 'Not managed')}
        </Badge>
      </div>

      {localError && (
        <Alert className="border-red-300/25 bg-red-500/10 text-red-100">
          <ShieldAlert data-icon="inline-start" />
          <AlertTitle>Action needs attention</AlertTitle>
          <AlertDescription>{localError}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {isFound && (
          <DisabledAction disabled={!canPin || busyAction !== null} reason={observedActionReason(busyAction, pinAction, 'pin')}>
            <Button
              className="border-amber-300/30 bg-slate-900 text-amber-100 hover:bg-slate-800"
              disabled={!canPin || busyAction !== null}
              onClick={() => void runObservedServiceAction('pin')}
              type="button"
              variant="outline"
            >
              {busyAction === 'pin' ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Pin data-icon="inline-start" />}
              Pin to My Apps
            </Button>
          </DisabledAction>
        )}

        {isLinked && (
          <DisabledAction disabled={!canUnpin || busyAction !== null} reason={observedActionReason(busyAction, unpinAction, 'unpin')}>
            <Button
              className="border-amber-300/30 bg-slate-900 text-amber-100 hover:bg-slate-800"
              disabled={!canUnpin || busyAction !== null}
              onClick={() => void runObservedServiceAction('unpin')}
              type="button"
              variant="outline"
            >
              {busyAction === 'unpin' ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <PinOff data-icon="inline-start" />}
              Unpin
            </Button>
          </DisabledAction>
        )}

        {installCopyAction?.href && (
          <Button asChild className="border-amber-300/30 bg-slate-900 text-amber-100 hover:bg-slate-800" variant="outline">
            <Link to={installCopyAction.href}>
              <Download data-icon="inline-start" />
              Install copy
            </Link>
          </Button>
        )}
      </div>

      {adoptionAction && (
        <section className="grid gap-3 rounded-lg border border-orange-300/25 bg-orange-500/10 p-3">
          <div>
            <p className="text-sm font-semibold text-orange-100">Recovery plan</p>
            <p className="mt-1 text-xs leading-5 text-orange-100/75">
              {adoptionAction.disabled
                ? adoptionAction.reason || 'Project OS cannot recover this service safely yet.'
                : 'Review what Project OS will change before taking control of this service.'}
            </p>
            <p className="mt-1 text-xs leading-5 text-orange-100/75">
              Backup protection starts after recovery. Project OS will preserve data by default, then you can create a restore point once the app is managed.
            </p>
          </div>

          {canLoadAdoptionPlan && !plan && (
            <DisabledAction disabled={busyAction !== null} reason="Wait for the current service action to finish before loading a recovery plan.">
              <Button className="w-fit bg-orange-500 text-white hover:bg-orange-400" disabled={busyAction !== null} onClick={() => void loadPlan()} type="button">
                {busyAction === 'adoption_plan' ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RotateCcw data-icon="inline-start" />}
                Review recovery plan
              </Button>
            </DisabledAction>
          )}

          {plan && (
            <div className="grid gap-3 text-sm">
              <p className="rounded-lg border border-orange-300/20 bg-slate-950 p-3 leading-6 text-orange-50/90">
                {typeof plan.summary === 'string' ? plan.summary : 'Project OS prepared a recovery plan for this service.'}
              </p>
              <PlanList title="What Project OS will do" items={planList(plan.steps)} />
              <PlanList title="Containers" items={planList(plan.containers)} />
              <PlanList title="Data safety" items={plan.dataPreservation ? [String(plan.dataPreservation)] : planList(plan.dataPaths)} />
              <PlanList title="Warnings" items={planList(plan.warnings)} />
              <PlanList title="Blocked" items={[...blockedReasons, ...(planDisabledReason ? [planDisabledReason] : [])]} />

              {confirmationText && (
                <div className="grid gap-2">
                  <Label className="text-xs text-orange-100/80" htmlFor={`adoption-confirmation-${item.id}`}>
                    Type {confirmationText}
                  </Label>
                  <Input
                    className="border-orange-300/25 bg-slate-950 text-slate-50"
                    disabled={busyAction !== null}
                    id={`adoption-confirmation-${item.id}`}
                    onChange={(event) => setConfirmation(event.target.value)}
                    value={confirmation}
                  />
                </div>
              )}

              {planAvailable && (
                <DisabledAction disabled={adoptDisabled} reason={adoptDisabledReason(busyAction, blockedReasons, confirmationText)}>
                  <Button className="w-fit bg-orange-500 text-white hover:bg-orange-400" disabled={adoptDisabled} onClick={() => void adoptService()} type="button">
                    {busyAction === 'adopt' ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RotateCcw data-icon="inline-start" />}
                    Adopt service
                  </Button>
                </DisabledAction>
              )}
            </div>
          )}
        </section>
      )}
    </section>
  );
}

function PlanList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-950 p-3">
      <p className="text-xs font-semibold text-slate-400">{title}</p>
      <ul className="mt-2 grid gap-1 text-slate-200">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function planList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function observedServiceCopy(item: ApplicationSurfaceItem) {
  if (item.userStatus === 'recoverable') {
    return {
      title: 'Recoverable service',
      description: item.userStatusDescription || 'Project OS found a service that may be recoverable into this installation.',
    };
  }
  if (item.userStatus === 'managed_elsewhere') {
    return {
      title: 'Owned elsewhere',
      description: item.userStatusDescription || 'This service appears to be owned by another Project OS installation.',
    };
  }
  if (item.userStatus === 'blocked' || item.attentionState === 'blocked' || item.attentionState === 'conflict') {
    return {
      title: 'Needs review',
      description: item.userStatusDescription || 'Project OS found a service conflict that needs review before changes are made.',
    };
  }
  if (item.managementState === 'linked') {
    return {
      title: 'Linked service',
      description: 'Project OS can open this service but does not manage its runtime.',
    };
  }
  return {
    title: 'Found service',
    description: item.userStatusDescription || 'Project OS found this service on the server.',
  };
}

function observedActionReason(
  busyAction: ObservedServiceAction | null,
  action: ApplicationSurfaceItem['availableActions'][number] | undefined,
  fallbackAction: string,
) {
  if (busyAction) {
    return 'Wait for the current service action to finish.';
  }
  if (action?.disabled) {
    return action.reason || `Project OS cannot ${fallbackAction} right now.`;
  }
  if (!action) {
    return `Project OS cannot ${fallbackAction} right now.`;
  }
  return '';
}

function adoptDisabledReason(busyAction: ObservedServiceAction | null, blockedReasons: string[], confirmationText: string) {
  if (busyAction) {
    return 'Wait for the current service action to finish before adopting this service.';
  }
  if (blockedReasons.length > 0) {
    return 'Resolve the blocked recovery items before adopting this service.';
  }
  if (confirmationText) {
    return 'Type the confirmation text exactly before adopting this service.';
  }
  return 'This recovery plan is not available yet.';
}
