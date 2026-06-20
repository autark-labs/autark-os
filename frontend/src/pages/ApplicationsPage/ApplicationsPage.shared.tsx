import { Archive } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AppRuntimeView } from '@/types/app';
import { formatDate, humanize, statusStyles } from './extensions/ApplicationsPage.logic';

export function ActivityTimeline({ events }: { events?: AppRuntimeView['recentEvents'] }) {
  if (!events?.length) {
    return <div className="rounded-lg border border-slate-700/30 bg-slate-950/35 p-4 text-sm text-slate-400">No activity recorded yet.</div>;
  }
  return (
    <section className="grid gap-3 rounded-lg border border-slate-700/30 bg-slate-950/35 p-4">
      {events.map((event) => (
        <div className="flex gap-3" key={event.id}>
          <span className="mt-1 size-2 rounded-full bg-violet-300" />
          <div>
            <p className="text-sm font-semibold text-white">{humanize(event.type)}</p>
            <p className="text-sm text-slate-400">{event.message}</p>
            <p className="mt-1 text-xs text-slate-600">{formatDate(event.createdAt)}</p>
          </div>
        </div>
      ))}
    </section>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge className={cn('border', statusStyles[status] || statusStyles.Stopped)} variant="outline">{status}</Badge>;
}

export function AppIcon({ app, large = false }: { app: AppRuntimeView; large?: boolean }) {
  return (
    <div className={cn('grid shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-700/40 bg-slate-950/65', large ? 'size-16' : 'size-12')}>
      {app.image ? <img alt="" className="size-full object-cover" src={app.image} /> : <Archive className="size-6 text-slate-400" />}
    </div>
  );
}

export function FriendlyStat({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg border border-slate-700/30 bg-slate-950/35 p-3">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 truncate font-semibold text-white">{value}</p>
    </div>
  );
}

export function Diagnostic({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm text-slate-300">{value}</p>
    </div>
  );
}

export function StatusLine({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return <div className="flex items-start gap-2"><Icon className="mt-0.5 size-4 text-violet-300" /><span>{text}</span></div>;
}
