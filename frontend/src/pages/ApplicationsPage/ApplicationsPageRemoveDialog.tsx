import { useState } from 'react';
import { Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { DisabledAction } from '@/components/project-os/DisabledAction';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { InstalledAppsAPIClient } from '@/api/InstalledAppsAPIClient';
import type { AppRuntimeView, UninstallPlan } from '@/types/app';

type UninstallDialogProps = {
  app: AppRuntimeView;
  disabled: boolean;
  iconOnly?: boolean;
  onUninstall: (appId: string) => Promise<void> | void;
};

export function UninstallDialog({ app, disabled, iconOnly = false, onUninstall }: UninstallDialogProps) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<UninstallPlan | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  async function openPlan() {
    setOpen(true);
    setConfirmed(false);
    try {
      setPlan(await InstalledAppsAPIClient.uninstallPlan(app.appId));
    } catch (err) {
      console.warn('Unable to load uninstall plan.', err);
    }
  }

  async function removeApp() {
    await onUninstall(app.appId);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DisabledAction disabled={disabled} reason="Wait for the current app action to finish before removing this app.">
        <Button className="border-red-400/30 bg-red-500/10 text-red-100 hover:bg-red-500/20" disabled={disabled} onClick={openPlan} size={iconOnly ? 'icon-sm' : 'default'} title="Remove app" type="button" variant="outline">
          <Trash2 className="size-4" />
          {iconOnly ? <span className="sr-only">Remove {app.appName}</span> : 'Remove'}
        </Button>
      </DisabledAction>
      <DialogContent className="border-slate-700 bg-slate-950 text-slate-100 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-white">Remove {app.appName}</DialogTitle>
          <DialogDescription className="text-slate-400">Review what will happen before anything is removed.</DialogDescription>
        </DialogHeader>
        {plan ? (
          <div className="grid gap-4">
            <p className="text-sm text-slate-300">{plan.headline}</p>
            <div className={plan.safetyCheckpointPlanned ? 'rounded-lg border border-emerald-300/20 bg-emerald-500/10 p-3 text-emerald-100' : 'rounded-lg border border-amber-300/20 bg-amber-500/10 p-3 text-amber-100'}>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-slate-950/40">
                  <ShieldCheck className="size-4" />
                </span>
                <div>
                  <h5 className="font-bold text-white">Safety checkpoint</h5>
                  <p className="mt-1 text-sm text-current/80">{plan.safetyCheckpointMessage || 'Project OS will protect app data before making this change when possible.'}</p>
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <PlanList title="Will remove" items={plan.willStop} />
              <PlanList title="Will keep" items={plan.willKeep} />
            </div>
            <label className="flex items-start gap-3 rounded-lg border border-slate-700/40 bg-slate-900/70 p-3 text-sm text-slate-300">
              <Checkbox checked={confirmed} className="mt-1" onCheckedChange={(checked) => setConfirmed(Boolean(checked))} />
              <span>I understand Project OS will remove the running app, keep its data, and create a safety checkpoint when app data is present.</span>
            </label>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="size-4 animate-spin" /> Loading uninstall plan</div>
        )}
        <DialogFooter className="border-slate-800 bg-slate-900/80">
          <Button className="border-slate-700/50 bg-slate-950/50 text-slate-200 hover:bg-slate-800" onClick={() => setOpen(false)} type="button" variant="outline">Cancel</Button>
          <DisabledAction disabled={!confirmed || !plan} reason={!plan ? 'Wait for the uninstall plan to load.' : 'Confirm that Project OS should remove the app while keeping its data.'}>
            <Button className="bg-red-600 text-white hover:bg-red-500" disabled={!confirmed || !plan} onClick={removeApp} type="button">Remove app</Button>
          </DisabledAction>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-slate-700/30 bg-slate-900/70 p-3">
      <h5 className="font-bold text-white">{title}</h5>
      <ul className="mt-2 grid gap-1 text-sm text-slate-400">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}
