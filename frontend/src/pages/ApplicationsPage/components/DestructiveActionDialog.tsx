import { useState, type MouseEvent } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { DestructiveActionPlan } from '../extensions/ApplicationsPage.destructiveActions';

type DestructiveActionDialogCommonProps = {
  className?: string;
  triggerLabel: string;
};

type EnabledDestructiveActionDialogProps = DestructiveActionDialogCommonProps & {
  disabledReason?: null;
  loadPlan: () => Promise<DestructiveActionPlan>;
  onActionStarted?: () => void;
  runAction: () => Promise<unknown>;
};

type DisabledDestructiveActionDialogProps = DestructiveActionDialogCommonProps & {
  disabledReason: string;
  loadPlan?: never;
  onActionStarted?: never;
  runAction?: never;
};

type DestructiveActionDialogProps = EnabledDestructiveActionDialogProps | DisabledDestructiveActionDialogProps;

export function DestructiveActionDialog(props: DestructiveActionDialogProps) {
  if (typeof props.disabledReason === 'string') {
    return (
      <div className="grid justify-items-end gap-1">
        <Button className={props.className} disabled size="sm" type="button" variant="outline">
          <AlertTriangle data-icon="inline-start" />
          {props.triggerLabel}
        </Button>
        <p className="max-w-48 text-right text-xs leading-5 text-red-100/70">{props.disabledReason}</p>
      </div>
    );
  }

  return <EnabledDestructiveActionDialog {...props} />;
}

function EnabledDestructiveActionDialog({ className, loadPlan, onActionStarted, runAction, triggerLabel }: EnabledDestructiveActionDialogProps) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<DestructiveActionPlan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');

  const blocked = Boolean(plan?.blockedReasons.length);
  const confirmationRequired = Boolean(plan?.requiresTextConfirmation);
  const confirmationMatches = !plan?.requiresTextConfirmation || confirmationText === plan.requiresTextConfirmation;
  const canRun = Boolean(plan) && !blocked && !loadingPlan && !running && confirmationMatches;

  async function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setConfirmationText('');
      setActionError(null);
      return;
    }
    if (plan || loadingPlan) {
      return;
    }
    setLoadingPlan(true);
    setPlanError(null);
    try {
      setPlan(await loadPlan());
    } catch {
      setPlanError('Project OS could not load the safety plan. Try again before making changes.');
    } finally {
      setLoadingPlan(false);
    }
  }

  async function confirmAction(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (!canRun) {
      return;
    }
    setRunning(true);
    setActionError(null);
    try {
      await runAction();
      onActionStarted?.();
      setOpen(false);
      setConfirmationText('');
    } catch {
      setActionError('Project OS could not start this action. The app was not changed.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button className={className} size="sm" type="button" variant="outline">
          <AlertTriangle data-icon="inline-start" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto bg-slate-950 text-slate-50 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{plan?.title ?? 'Review safety plan'}</DialogTitle>
          <DialogDescription>
            {plan?.summary ?? 'Project OS will load a safety plan before making changes.'}
          </DialogDescription>
        </DialogHeader>

        {loadingPlan && <PlanSkeleton />}

        {planError && (
          <Alert className="border-red-400/30 bg-red-500/10 text-red-50">
            <AlertTriangle data-icon="inline-start" />
            <AlertTitle>Plan unavailable</AlertTitle>
            <AlertDescription>{planError}</AlertDescription>
          </Alert>
        )}

        {plan && (
          <div className="grid gap-4">
            <Alert className={cn(
              plan.preservesDataByDefault
                ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-50'
                : 'border-red-400/30 bg-red-500/10 text-red-50',
            )}>
              {plan.preservesDataByDefault ? <ShieldCheck data-icon="inline-start" /> : <AlertTriangle data-icon="inline-start" />}
              <AlertTitle>{plan.preservesDataByDefault ? 'Data preserved by default' : 'Data may be removed'}</AlertTitle>
              <AlertDescription>
                {plan.preservesDataByDefault
                  ? 'Project OS will keep app data unless the reviewed plan says otherwise.'
                  : 'Read the plan carefully before continuing.'}
              </AlertDescription>
            </Alert>

            {plan.blockedReasons.length > 0 && (
              <PlanList title="Blocked" tone="danger" items={plan.blockedReasons} />
            )}

            <PlanList title="Will happen" items={plan.steps} />

            {plan.warnings.length > 0 && (
              <PlanList title="Review" tone={plan.severity} items={plan.warnings} />
            )}

            {confirmationRequired && (
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-100" htmlFor="destructive-confirmation">
                  Type {plan.requiresTextConfirmation} to continue
                </label>
                <Input
                  className="border-slate-700 bg-slate-900 text-slate-50"
                  id="destructive-confirmation"
                  onChange={(event) => setConfirmationText(event.target.value)}
                  value={confirmationText}
                />
              </div>
            )}
          </div>
        )}

        {actionError && (
          <Alert className="border-red-400/30 bg-red-500/10 text-red-50">
            <AlertTriangle data-icon="inline-start" />
            <AlertTitle>Action not started</AlertTitle>
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button disabled={running} type="button" variant="outline">Cancel</Button>
          </DialogClose>
          <Button className="bg-red-600 text-white hover:bg-red-500" disabled={!canRun} onClick={confirmAction} type="button">
            {running && <Loader2 className="animate-spin" data-icon="inline-start" />}
            {running ? 'Starting' : plan?.runLabel ?? 'Continue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanSkeleton() {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-16 rounded-xl bg-slate-800" />
      <Skeleton className="h-28 rounded-xl bg-slate-800" />
    </div>
  );
}

function PlanList({ items, title, tone = 'warning' }: { items: string[]; title: string; tone?: 'warning' | 'danger' }) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3',
        tone === 'danger'
          ? 'border-red-400/30 bg-red-500/10'
          : 'border-amber-400/30 bg-amber-500/10',
      )}
    >
      <p className="text-sm font-semibold text-white">{title}</p>
      <ul className="mt-2 grid gap-1 text-sm text-slate-200">
        {items.map((item) => (
          <li className="flex items-start gap-2" key={item}>
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-slate-300" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
