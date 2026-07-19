import { useState } from 'react';
import { History, Loader2, RefreshCw, ShieldCheck, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { operationBlocksManagement } from '../extensions/ApplicationsPage.operations';
import type { ApplicationActionHandlers, ApplicationSurfaceItem } from '../extensions/ApplicationsPage.types';
import type { AppUpdatePlan } from '@/types/app';

type ApplicationUpdateSectionProps = {
  actions: Pick<ApplicationActionHandlers, 'onLoadRollbackPlan' | 'onLoadUpdatePlan' | 'onRunRollback' | 'onRunUpdate'>;
  item: ApplicationSurfaceItem;
};

export function ApplicationUpdateSection({ actions, item }: ApplicationUpdateSectionProps) {
  const [plan, setPlan] = useState<AppUpdatePlan | null>(null);
  const [loading, setLoading] = useState<'update' | 'rollback' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (item.managementState !== 'managed') {
    return null;
  }

  const blockedByOperation = operationBlocksManagement(item.operationState);

  async function review(operation: 'update' | 'rollback') {
    setLoading(operation);
    try {
      setPlan(operation === 'update'
        ? await actions.onLoadUpdatePlan(item.id)
        : await actions.onLoadRollbackPlan(item.id));
    } catch {
      // The page-level action handler has already shown the actionable error notification.
    } finally {
      setLoading(null);
    }
  }

  async function apply() {
    if (!plan?.canApply) {
      return;
    }
    setSubmitting(true);
    try {
      if (plan.operation === 'rollback') {
        await actions.onRunRollback(item.id);
      } else {
        await actions.onRunUpdate(item.id);
      }
      setPlan(null);
    } catch {
      // The page-level action handler has already shown the actionable error notification.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-xl border border-sky-400/20 bg-slate-800/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-sky-50">
            <History className="size-4 text-cyan-200" />
            App release
          </div>
          <p className="mt-1 text-xs leading-5 text-sky-100/65">Review a safe, image-only update before Autark-OS changes this app.</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            className="border-sky-400/30 bg-slate-900 text-sky-50 hover:bg-slate-700"
            disabled={blockedByOperation || loading !== null || submitting}
            onClick={() => void review('update')}
            size="sm"
            title={blockedByOperation ? 'Wait for the current app operation to finish.' : undefined}
            type="button"
            variant="outline"
          >
            {loading === 'update' ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Review update
          </Button>
          <Button
            className="border-sky-400/30 bg-slate-900 text-sky-50 hover:bg-slate-700"
            disabled={blockedByOperation || loading !== null || submitting}
            onClick={() => void review('rollback')}
            size="icon-sm"
            title={blockedByOperation ? 'Wait for the current app operation to finish.' : 'Review rollback'}
            type="button"
            variant="outline"
          >
            {loading === 'rollback' ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />}
            <span className="sr-only">Review rollback</span>
          </Button>
        </div>
      </div>

      {plan && (
        <div className={cn('mt-3 rounded-lg border p-3', plan.canApply ? 'border-cyan-300/25 bg-cyan-300/5' : 'border-amber-300/25 bg-amber-300/5')}>
          <div className="flex items-start gap-2">
            <ShieldCheck className={cn('mt-0.5 size-4 shrink-0', plan.canApply ? 'text-cyan-200' : 'text-amber-200')} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">{plan.headline}</p>
              <p className="mt-1 text-xs leading-5 text-sky-100/70">{plan.summary}</p>
            </div>
          </div>

          {(plan.currentVersion || plan.targetVersion) && (
            <p className="mt-2 text-xs text-sky-100/70">
              {plan.currentVersion || 'Current release'} <span className="px-1 text-sky-100/35">→</span> {plan.targetVersion || 'No target release'}
            </p>
          )}

          {(plan.changes.length > 0 || plan.blockedReasons.length > 0) && (
            <ul className="mt-2 grid gap-1 text-xs leading-5 text-sky-100/70">
              {(plan.canApply ? plan.changes : plan.blockedReasons).map((line) => <li key={line}>• {line}</li>)}
            </ul>
          )}

          <div className="mt-3 flex justify-end gap-2">
            <Button className="text-sky-100/70 hover:bg-slate-700 hover:text-white" onClick={() => setPlan(null)} size="sm" type="button" variant="ghost">Close</Button>
            {plan.canApply && (
              <Button className="bg-cyan-300 text-slate-950 hover:bg-cyan-200" disabled={submitting} onClick={() => void apply()} size="sm" type="button">
                {submitting ? <Loader2 className="size-3.5 animate-spin" /> : plan.operation === 'rollback' ? <Undo2 className="size-3.5" /> : <RefreshCw className="size-3.5" />}
                {plan.operation === 'rollback' ? 'Restore release' : 'Start update'}
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
