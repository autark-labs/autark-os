import { CheckCircle2, Loader2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { AppSettingsChangePlan } from '@/types/app';

type Review = Pick<AppSettingsChangePlan, 'headline' | 'summary' | 'changes' | 'warnings' | 'blockedReasons' | 'saveAllowed'>;

/** One review of the backend-owned consequences for settings and Access changes. */
export function SettingsChangeReview({ open, onOpenChange, plan, busy, cancelDisabled = busy, error, onConfirm }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: Review | null;
  busy: boolean;
  cancelDisabled?: boolean;
  error?: string | null;
  onConfirm: () => void;
}) {
  return <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
      <AlertDialogHeader>
        <AlertDialogTitle>{plan?.headline || 'Review settings change'}</AlertDialogTitle>
        <AlertDialogDescription>{plan?.summary || 'Checking the effect on this app.'}</AlertDialogDescription>
      </AlertDialogHeader>
      {plan && <div className="grid gap-3 text-sm">
        {plan.changes.length > 0 && <ul className="list-inside list-disc">{plan.changes.map(change => <li key={change}>{change}</li>)}</ul>}
        {plan.warnings.length > 0 && <ul className="list-inside list-disc text-amber-300">{plan.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
        {plan.blockedReasons.length > 0 && <ul className="list-inside list-disc text-destructive">{plan.blockedReasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
      </div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={cancelDisabled}>Cancel</AlertDialogCancel>
        <AlertDialogAction disabled={busy || !plan?.saveAllowed} onClick={event => { event.preventDefault(); onConfirm(); }}>
          {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <CheckCircle2 data-icon="inline-start" />}
          Save settings
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
