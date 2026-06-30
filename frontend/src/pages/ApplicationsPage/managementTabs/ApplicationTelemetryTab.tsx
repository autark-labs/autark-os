import { Activity, Archive, Clock3, Cpu, Network } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAppTelemetryQuery } from '@/repositories/appManagementRepository';
import { labelForReadiness } from '../components/AppStateBadges';
import type { ApplicationSurfaceItem } from '../extensions/ApplicationsPage.types';

export function ApplicationTelemetryTab({ item }: { item: ApplicationSurfaceItem }) {
  const telemetryQuery = useAppTelemetryQuery(
    item.managementState === 'managed' ? item.id : null,
    item.managementState === 'managed',
    item.runtime.telemetry,
  );
  const telemetry = telemetryQuery.data ?? item.runtime.telemetry;
  const health = item.runtime.health;
  const cpu = percentValue(telemetry?.cpuPercent);
  const memory = percentValue(telemetry?.memoryPercent);

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 sm:grid-cols-2">
        <MetricBar icon={Cpu} label="CPU" secondary={cpu?.toString()} loading={telemetryQuery.isFetching} text={telemetry?.cpuPercent || 'Unavailable'} value={cpu} />
        <MetricBar icon={Archive} label="Memory" secondary={telemetry?.memoryUsage} text={telemetry?.memoryPercent || 'Unavailable'} value={memory} />
        <MetricBar icon={Network} label="Network" text={telemetry?.networkIo || 'Unavailable'} />
        <MetricBar icon={Activity} label="Disk I/O" text={telemetry?.blockIo || 'Unavailable'} />
      </section>

      <section className="grid gap-2 rounded-xl border border-sky-400/20 bg-slate-800 p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-white">Health</span>
          <Badge className="bg-slate-900 text-sky-50">{labelForReadiness(item.readinessState)}</Badge>
        </div>
        <Detail label="Status" value={health?.status || item.status} />
        {(health?.message || health?.detail) && (
          <p className="rounded-lg bg-slate-900 px-3 py-2 text-sm leading-6 text-sky-50">
            {health.detail || health.message}
          </p>
        )}
      </section>

      <section className="grid gap-2 rounded-xl border border-sky-400/20 bg-slate-800 p-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-white">
          <Clock3 data-icon="inline-start" />
          Runtime
        </span>
        <Detail label="Checked" value={formatTimestamp(telemetry?.checkedAt || item.runtime.checkedAt || health?.checkedAt)} />
        <Detail label="Compose project" value={item.runtime.composeProject || 'Not reported'} />
        <Detail label="Runtime path" value={item.runtime.runtimePath || 'Not reported'} />
        <Detail label="Version" value={item.runtime.version || 'Unknown'} />
      </section>
    </div>
  );
}

function MetricBar({
  icon: Icon,
  label,
  loading = false,
  secondary,
  text,
  value,
}: {
  icon: typeof Cpu;
  label: string;
  loading?: boolean;
  secondary?: string;
  text: string;
  value?: number | null;
}) {
  const hasProgress = typeof value === 'number' && Number.isFinite(value);

  return (
    <div className="rounded-xl border border-sky-400/20 bg-slate-800 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-white">
          <Icon data-icon="inline-start" />
          {label}
        </span>
        <span className="text-xs text-sky-100/60">{loading ? 'Refreshing' : text}</span>
      </div>
      {secondary && <p className="mt-2 truncate text-xs text-sky-100/60">{secondary}</p>}
      {hasProgress && <Progress className="mt-3 bg-slate-900" value={value} />}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-900 px-3 py-2">
      <p className="text-xs font-medium text-sky-100/60">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function percentValue(value?: string | null) {
  if (!value || value === 'Unavailable') {
    return null;
  }
  const parsed = Number.parseFloat(value.replace('%', ''));
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : null;
}

function formatTimestamp(value?: string | null) {
  if (!value) {
    return 'Not checked';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}
