import { CheckCircle2, ExternalLink, Pause, Play, RotateCw, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { ApplicationIcon, ApplicationStatusBadge, labelForKind } from './extensions/ApplicationVisuals';
import type { ApplicationActionHandlers, ApplicationSurfaceItem } from './extensions/ApplicationsPage.types';

type ApplicationManagementPanelProps = {
  actions: ApplicationActionHandlers;
  item: ApplicationSurfaceItem;
  variant?: 'inline' | 'rail';
};

export function ApplicationManagementPanel({ actions, item, variant = 'inline' }: ApplicationManagementPanelProps) {
  const managed = item.kind === 'managed';
  const paused = item.runtimeState === 'paused';
  const rail = variant === 'rail';

  return (
    <section
      className={cn(
        'bg-slate-900 text-slate-50',
        rail
          ? 'min-h-full'
          : 'animate-in fade-in-0 slide-in-from-top-2 rounded-2xl border border-cyan-300/40 shadow-2xl shadow-cyan-950/40',
      )}
    >
      {/* <div className={cn('flex flex-col gap-4 border-b border-sky-400/20 p-4', !rail && 'lg:flex-row lg:items-start lg:justify-between')}>
        <div className="flex min-w-0 items-start gap-3">
          <ApplicationIcon item={item} size="md" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-xl font-semibold text-white">{item.name}</h3>
              <ApplicationStatusBadge item={item} />
              <Badge className="bg-slate-800 text-sky-50">{labelForKind(item.kind)}</Badge>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-sky-100/70">{item.description}</p>
          </div>
        </div>

        {item.href && !rail && (
          <Button asChild className="bg-cyan-300 text-slate-950 shadow-md shadow-cyan-700/20 hover:bg-cyan-200">
            <a href={item.href} rel="noreferrer" target="_blank">
              <ExternalLink data-icon="inline-start" />
              Open app
            </a>
          </Button>
        )}
      </div> */}

      <Tabs className="gap-0" defaultValue="overview">
        <TabsList className="w-full justify-start rounded-none border-b border-sky-400/20 bg-slate-900 px-4 py-2" variant="line">
          <TabsTrigger className="px-3 py-2 text-sky-100/60 data-active:text-white data-active:text-shadow-2xl data-active:shadow-cyan-500/20" value="overview">Overview</TabsTrigger>
          <TabsTrigger className="px-3 py-2 text-sky-100/60 data-active:text-white data-active:text-shadow-2xl data-active:shadow-cyan-500/20" value="actions">Actions</TabsTrigger>
          <TabsTrigger className="px-3 py-2 text-sky-100/60 data-active:text-white data-active:text-shadow-2xl data-active:shadow-cyan-500/20" value="activity">Activity</TabsTrigger>
          <TabsTrigger className="px-3 py-2 text-sky-100/60 data-active:text-white" value="settings">Settings</TabsTrigger>
        </TabsList>

        <div className="p-4">
          <TabsContent className={cn('grid gap-4', !rail && 'lg:grid-cols-[minmax(0,1fr)_18rem]')} value="overview">
            <section className="grid gap-2">
              <Detail label="State" value={item.status} />
              <Detail label="Access" value={item.access} />
              <Detail label="Backup" value={item.backup} />
              <Detail label="Last event" value={item.lastEvent || 'No recent activity'} />
            </section>
          </TabsContent>

          <TabsContent className={cn('grid gap-4', !rail && 'lg:grid-cols-[minmax(0,1fr)_18rem]')} value="actions">
            <section className="grid gap-2">
              {item.href && rail && (
                <Button asChild className="bg-cyan-300 text-slate-950 shadow-md shadow-cyan-700/20 hover:bg-cyan-200">
                  <a href={item.href} rel="noreferrer" target="_blank">
                    <ExternalLink data-icon="inline-start" />
                    Open app
                  </a>
                </Button>
              )}

              {managed ? (
                <div className={cn('grid gap-2', rail ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
                  <Button className="border-sky-400/40 bg-slate-800 text-sky-50 hover:bg-slate-700 hover:text-white" onClick={() => paused ? actions.onStart(item.id) : actions.onStop(item.id)} type="button" variant="outline">
                    {paused ? <Play data-icon="inline-start" /> : <Pause data-icon="inline-start" />}
                    {paused ? 'Start' : 'Pause'}
                  </Button>
                  <Button className="border-sky-400/40 bg-slate-800 text-sky-50 hover:bg-slate-700 hover:text-white" onClick={() => actions.onRestart(item.id)} type="button" variant="outline">
                    <RotateCw data-icon="inline-start" />
                    Restart
                  </Button>
                  <Button className="border-sky-400/40 bg-slate-800 text-sky-50 hover:bg-slate-700 hover:text-white" onClick={() => actions.onCreateBackup(item.id)} type="button" variant="outline">
                    <ShieldCheck data-icon="inline-start" />
                    Create backup
                  </Button>
                </div>
              ) : (
                <div className="rounded-xl border border-sky-400/20 bg-slate-800 p-4 text-sm text-sky-100/70">
                  Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                </div>
              )}
            </section>

            <section className="grid gap-2">
              <Button asChild className="border-sky-400/40 bg-slate-800 text-sky-50 hover:bg-slate-700 hover:text-white" variant="outline">
                <Link to="/backups">
                  <ShieldCheck data-icon="inline-start" />
                  Backups
                </Link>
              </Button>
              <Button asChild className="border-sky-400/40 bg-slate-800 text-sky-50 hover:bg-slate-700 hover:text-white" variant="outline">
                <Link to="/access">
                  <ExternalLink data-icon="inline-start" />
                  Access
                </Link>
              </Button>
            </section>
          </TabsContent>

          <TabsContent className="grid gap-3" value="activity">
            <ActivityRow label={item.lastEvent || 'State checked'} value="Just now" />
            <ActivityRow label={`${item.access} access reviewed`} value="Today" />
            <ActivityRow label={`${item.backup} backup status`} value="Today" />
            <Separator className="bg-sky-400/20" />
            <p className="text-sm leading-6 text-sky-100/60">Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
          </TabsContent>
        </div>
      </Tabs>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-800 px-3 py-2">
      <p className="text-xs font-medium text-sky-100/60">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function ActivityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-sky-400/20 bg-slate-800 px-3 py-2">
      <span className="min-w-0 truncate text-sm text-sky-50">{label}</span>
      <span className="shrink-0 text-xs text-sky-100/60">{value}</span>
    </div>
  );
}
