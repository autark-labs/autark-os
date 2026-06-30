import { useEffect, useState } from 'react';
import { Loader2, Search, ShieldAlert, XCircle } from 'lucide-react';
import { apiErrorMessage } from '@/api/httpClient';
import { DisabledAction } from '@/components/project-os/DisabledAction';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ApplicationActionHandlers, ApplicationSurfaceItem } from '../extensions/ApplicationsPage.types';

type ObservedServiceAction = 'clear_match' | 'match';

export function ObservedServiceCatalogMatchSection({
  actions,
  item,
}: {
  actions: Pick<ApplicationActionHandlers, 'onMatchObservedService'>;
  item: ApplicationSurfaceItem;
}) {
  const [busyAction, setBusyAction] = useState<ObservedServiceAction | null>(null);
  const [matchValue, setMatchValue] = useState(item.catalogAppId || '');
  const [localError, setLocalError] = useState<string | null>(null);
  const serviceId = item.sourceId || item.id;
  const changeMatchAction = item.availableActions.find((action) => action.id === 'change_match');
  const isObservedService = item.managementState === 'found' || item.managementState === 'linked';

  useEffect(() => {
    setMatchValue(item.catalogAppId || '');
    setLocalError(null);
  }, [item.catalogAppId, item.id]);

  if (!isObservedService || !changeMatchAction) {
    return null;
  }

  const canChangeMatch = !changeMatchAction.disabled;
  const matchChanged = matchValue.trim() !== (item.catalogAppId || '');

  async function saveMatch(catalogAppId: string | null, nextBusyAction: ObservedServiceAction) {
    setBusyAction(nextBusyAction);
    setLocalError(null);
    try {
      await actions.onMatchObservedService(serviceId, catalogAppId);
      setMatchValue(catalogAppId || '');
    } catch (error) {
      setLocalError(apiErrorMessage(error, 'Catalog match could not be saved.'));
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="grid gap-3 rounded-xl border border-sky-400/20 bg-slate-800 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-sky-50">Catalog match</p>
          <p className="mt-1 text-xs leading-5 text-sky-100/65">
            Match this service to a catalog app when Project OS guessed wrong or could not identify it.
          </p>
        </div>
        {item.catalogMatchConfidence && (
          <Badge className="border-sky-300/25 bg-slate-950 text-sky-100" variant="outline">
            {item.catalogMatchConfidence}
          </Badge>
        )}
      </div>

      {localError && (
        <Alert className="border-red-300/25 bg-red-500/10 text-red-100">
          <ShieldAlert data-icon="inline-start" />
          <AlertTitle>Match not saved</AlertTitle>
          <AlertDescription>{localError}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-2">
        <Label className="text-xs text-sky-100/80" htmlFor={`observed-service-match-${item.id}`}>Catalog app id</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            className="border-sky-300/25 bg-slate-950 text-slate-50 placeholder:text-slate-400"
            disabled={!canChangeMatch || busyAction !== null}
            id={`observed-service-match-${item.id}`}
            onChange={(event) => setMatchValue(event.target.value)}
            placeholder="vaultwarden"
            value={matchValue}
          />
          <DisabledAction disabled={!canChangeMatch || !matchChanged || busyAction !== null} reason={observedActionReason(busyAction, changeMatchAction, 'save this match')}>
            <Button
              className="border-sky-300/30 bg-slate-950 text-sky-100 hover:bg-slate-900"
              disabled={!canChangeMatch || !matchChanged || busyAction !== null}
              onClick={() => void saveMatch(matchValue.trim() || null, 'match')}
              type="button"
              variant="outline"
            >
              {busyAction === 'match' ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Search data-icon="inline-start" />}
              Save
            </Button>
          </DisabledAction>
          {(item.catalogAppId || matchValue) && (
            <DisabledAction disabled={!canChangeMatch || busyAction !== null} reason={observedActionReason(busyAction, changeMatchAction, 'clear this match')}>
              <Button
                className="border-sky-300/30 bg-slate-950 text-sky-100 hover:bg-slate-900"
                disabled={!canChangeMatch || busyAction !== null}
                onClick={() => void saveMatch(null, 'clear_match')}
                type="button"
                variant="outline"
              >
                {busyAction === 'clear_match' ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <XCircle data-icon="inline-start" />}
                Clear match
              </Button>
            </DisabledAction>
          )}
        </div>
      </div>
    </section>
  );
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
