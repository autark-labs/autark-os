import { AlertTriangle, CheckCircle2, Lock, MonitorSmartphone, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { statusTone } from './extensions/NetworkPage.theme';
import type { NetworkPosture } from './extensions/NetworkPage.types';

export function NetworkPostureHeader({ posture }: { posture: NetworkPosture }) {
  const Icon = posture.status === 'attention' ? AlertTriangle : posture.status === 'setup-needed' ? Lock : ShieldCheck;
  const tone = posture.status === 'ready' ? 'connected' : 'warning';

  return (
    <Card className="overflow-hidden border-sky-400/30 bg-slate-900 py-0 text-slate-100 shadow-xl shadow-slate-950/30">
      <CardContent className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 gap-4">
          <span className={cn('grid size-12 shrink-0 place-items-center rounded-lg border', statusTone(tone, 'soft'))}>
            <Icon className="size-6" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-bold text-white">{posture.headline}</h3>
              <Badge className={cn('border', statusTone(tone, 'badge'))} variant="outline">
                {posture.status === 'ready' ? 'Ready' : posture.status === 'attention' ? 'Needs attention' : 'Setup needed'}
              </Badge>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{posture.summary}</p>
            {posture.primaryAction && (
              <div className="mt-4 rounded-lg border border-sky-400/25 bg-slate-800 p-3">
                <p className="text-sm font-semibold text-white">{posture.primaryAction.label}</p>
                <p className="mt-1 text-sm text-slate-400">{posture.primaryAction.detail}</p>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[420px]">
          <PostureMetric icon={Lock} label="Private apps" value={posture.counts.privateApps} />
          <PostureMetric icon={MonitorSmartphone} label="Online devices" value={posture.counts.onlineDevices} />
          <PostureMetric icon={AlertTriangle} label="Open issues" value={posture.counts.issues} />
        </div>
      </CardContent>
    </Card>
  );
}

function PostureMetric({ icon: Icon, label, value }: { icon: typeof Lock; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-sky-400/25 bg-slate-800 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        <Icon className="size-4 text-slate-500" />
      </div>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}
