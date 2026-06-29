import { forwardRef } from 'react';
import { CheckCircle2, ExternalLink, Pause, Play, RotateCw, ShieldCheck, Wrench, X } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ApplicationIcon, labelForKind } from './extensions/ApplicationVisuals';
import { ApplicationManagementPanel } from './ApplicationManagementPanel';
import type { ApplicationActionHandlers, ApplicationSurfaceItem } from './extensions/ApplicationsPage.types';

type ApplicationDetailsRailProps = {
  actions: ApplicationActionHandlers;
  item: ApplicationSurfaceItem | null;
  managementOpen: boolean;
  onManagementOpenChange: (open: boolean) => void;
};

export const ApplicationDetailsRail = forwardRef<HTMLDivElement, ApplicationDetailsRailProps>(function ApplicationDetailsRail(
  { actions, item, managementOpen, onManagementOpenChange },
  ref,
) {
  return (
    <Card
      className={cn(
        'relative z-30 h-fit w-full scroll-mt-5 justify-self-end overflow-hidden rounded-2xl border border-sky-400/30 bg-slate-900 text-slate-50 shadow-xl shadow-slate-950/30 ring-0 transition-[width,box-shadow] duration-300 ease-out lg:sticky lg:top-5 lg:w-[22rem]',
        managementOpen && 'shadow-2xl shadow-cyan-950/50 lg:w-[58rem]',
      )}
      onPointerDown={(event) => event.stopPropagation()}
      ref={ref}
    >
      <CardHeader>
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            {item && <ApplicationIcon item={item} size="md" />}
            <div className="min-w-0 flex-1">
              <CardTitle className="truncate text-white">{item?.name ?? 'Selected app'}</CardTitle>
              <CardDescription className="text-sky-100/70">{item?.description ?? 'Lorem ipsum dolor sit amet.'}</CardDescription>
            </div>
          </div>

          {item && (
            <Button
              className={cn(
                'border-sky-400/40 bg-slate-800 text-sky-50 hover:bg-slate-700 hover:text-white',
                managementOpen && 'border-cyan-300 bg-cyan-300 text-slate-950 hover:bg-cyan-200 hover:text-slate-950',
              )}
              onClick={() => onManagementOpenChange(!managementOpen)}
              type="button"
              variant="outline"
            >
              {managementOpen ? <X data-icon="inline-start" /> : <Wrench data-icon="inline-start" />}
              {managementOpen ? 'Close details' : 'Manage app'}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="overflow-hidden">
        {item ? (
          <div
            className={cn(
              'grid transition-[grid-template-columns,gap] duration-300 ease-out',
              managementOpen
                ? 'grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]'
                : 'grid-cols-[0fr_minmax(0,1fr)] gap-0',
            )}
          >
            <div
              aria-hidden={!managementOpen}
              className={cn(
                'min-w-0 overflow-hidden transition-[max-height,opacity] duration-200',
                managementOpen ? 'max-h-[80rem] opacity-100 delay-100' : 'max-h-0 pointer-events-none opacity-0',
              )}
            >
              <div className="mb-3">
                <p className="text-sm font-semibold text-white">Management</p>
                <p className="text-xs text-sky-100/60">Lorem ipsum dolor sit amet.</p>
              </div>
              <ApplicationManagementPanel item={item} variant="rail" />
            </div>

            <div className="min-w-0">
              <div className="flex flex-col gap-4">
                <RailControls actions={actions} item={item} />

                <div className="grid gap-2 text-sm">
                  <InfoRow label="Type" value={labelForKind(item.kind)} />
                  <InfoRow label="State" value={item.status} />
                  <InfoRow label="Access" value={item.access} />
                  <InfoRow label="Backup" value={item.backup} />
                  {item.lastEvent && <InfoRow label="Last event" value={item.lastEvent} />}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-sky-100/70">No item selected.</p>
        )}
      </CardContent>
    </Card>
  );
});

function RailControls({ actions, item }: { actions: ApplicationActionHandlers; item: ApplicationSurfaceItem }) {
  return (
    <section className="grid gap-3 rounded-xl border border-sky-400/20 bg-slate-800 p-3">
      {item.href && (
        <Button asChild className="bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-500/20 hover:bg-cyan-200">
          <a href={item.href} rel="noreferrer" target="_blank">
            <ExternalLink data-icon="inline-start" />
            Open app
          </a>
        </Button>
      )}

      {item.nextAction ? (
        <div className="rounded-lg border border-orange-400 bg-orange-200 p-3 text-orange-950">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">{item.nextAction.label}</p>
              <p className="mt-1 text-xs leading-5">{item.nextAction.description}</p>
            </div>
            <Button className="bg-orange-500 text-white hover:bg-orange-400" onClick={() => actions.onRunNextAction(item.id)} size="sm" type="button">
              Run
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-200 px-3 py-2 text-sm text-emerald-950">
          <CheckCircle2 data-icon="inline-start" />
          {item.kind === 'managed' ? 'App fully functional' : 'No action needed'}
        </div>
      )}

      {item.kind === 'managed' && (
        <div className="grid gap-2 sm:grid-cols-3">
          <Button className="border-sky-400/40 bg-slate-900 text-sky-50 hover:bg-slate-700 hover:text-white" onClick={() => item.runtimeState === 'paused' ? actions.onStart(item.id) : actions.onStop(item.id)} type="button" variant="outline">
            {item.runtimeState === 'paused' ? <Play data-icon="inline-start" /> : <Pause data-icon="inline-start" />}
            {item.runtimeState === 'paused' ? 'Start' : 'Pause'}
          </Button>
          <Button className="border-sky-400/40 bg-slate-900 text-sky-50 hover:bg-slate-700 hover:text-white" onClick={() => actions.onRestart(item.id)} type="button" variant="outline">
            <RotateCw data-icon="inline-start" />
            Restart
          </Button>
          <Button className="border-sky-400/40 bg-slate-900 text-sky-50 hover:bg-slate-700 hover:text-white" onClick={() => actions.onCreateBackup(item.id)} type="button" variant="outline">
            <ShieldCheck data-icon="inline-start" />
            Backup
          </Button>
          {(item.runtimeState === 'needs_attention' || item.nextAction) && (
            <Button className="border-orange-300/40 bg-slate-900 text-orange-100 hover:bg-slate-700 hover:text-orange-50" onClick={() => actions.onRunNextAction(item.id)} type="button" variant="outline">
              <Wrench data-icon="inline-start" />
              Repair
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-slate-800 px-3 py-2">
      <span className="text-sky-100/70">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  );
}
