import { Activity, BarChart3, Cpu, Database, HardDrive, MemoryStick, Server } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ProjectInlineEmptyState } from '@/components/primitives/EmptyState';
import { ProjectInset, ProjectPanel } from '@/components/primitives/Surface';
import { Badge } from '@/components/ui/badge';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { cn } from '@/lib/utils';
import type { AppReliabilitySummary } from '@/types/app';
import type { MonitoringHistory } from '@/types/monitoring';
import type { SystemMetrics } from '@/types/system';

type ChartPoint = {
  label: string;
  count: number;
};

type ResourcePoint = {
  label: string;
  cpu: number;
  memory: number;
};

type HostTrendPoint = {
  label: string;
  cpu: number;
  memory: number;
  disk: number;
};

type AppTrendPoint = {
  label: string;
  cpu: number;
  memory: number;
};

type MonitoringChartsSectionProps = {
  appTrendData: AppTrendPoint[];
  categoryData: ChartPoint[];
  history: MonitoringHistory | null;
  hostTrendData: HostTrendPoint[];
  levelData: ChartPoint[];
  metrics: SystemMetrics | null;
  reliability: AppReliabilitySummary | null;
  resourceData: ResourcePoint[];
};

const MonitoringPanel = ProjectPanel;
const MonitoringInset = ProjectInset;

export default function MonitoringChartsSection({
  appTrendData,
  categoryData,
  history,
  hostTrendData,
  levelData,
  metrics,
  reliability,
  resourceData,
}: MonitoringChartsSectionProps) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
      <AutarkOsMetricsPanel
        appTrendData={appTrendData}
        categoryData={categoryData}
        history={history}
        levelData={levelData}
        reliability={reliability}
        resourceData={resourceData}
      />
      <DeviceInstrumentationPanel history={history} hostTrendData={hostTrendData} metrics={metrics} />
    </div>
  );
}

function AutarkOsMetricsPanel({
  appTrendData,
  categoryData,
  history,
  levelData,
  reliability,
  resourceData,
}: {
  appTrendData: AppTrendPoint[];
  categoryData: ChartPoint[];
  history: MonitoringHistory | null;
  levelData: ChartPoint[];
  reliability: AppReliabilitySummary | null;
  resourceData: ResourcePoint[];
}) {
  const healthTotal = Math.max(1, reliability?.totalApps ?? 0);
  const healthyPercent = ((reliability?.readyApps ?? 0) / healthTotal) * 100;
  const startingPercent = ((reliability?.startingApps ?? 0) / healthTotal) * 100;
  const attentionPercent = (((reliability?.needsAttentionApps ?? 0) + (reliability?.unavailableApps ?? 0)) / healthTotal) * 100;

  return (
    <MonitoringPanel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="size-5 text-cyan-200" />
            <h2 className="text-xl font-black text-white">Autark-OS metrics</h2>
          </div>
          <p className="mt-1 text-sm text-slate-400">A quick read on system activity, app health, and managed app resource usage.</p>
        </div>
        <Badge className="border-cyan-300/35 bg-cyan-400/10 text-cyan-100">{history?.windowLabel || 'Last 60 minutes'}</Badge>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="grid gap-4">
          <MonitoringInset className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-slate-500">App health mix</p>
                <p className="mt-1 text-sm text-slate-300">{reliability?.headline || 'Waiting for app health data'}</p>
              </div>
              <span className="text-2xl font-black text-white">{reliability?.totalApps ?? 0}</span>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-950">
              <div className="flex h-full">
                <span className="bg-emerald-400" style={{ width: `${healthyPercent}%` }} />
                <span className="bg-orange-400" style={{ width: `${startingPercent}%` }} />
                <span className="bg-red-400" style={{ width: `${attentionPercent}%` }} />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-400">
              <LegendDot color="bg-emerald-400" label={`${reliability?.readyApps ?? 0} ready`} />
              <LegendDot color="bg-orange-400" label={`${reliability?.startingApps ?? 0} starting`} />
              <LegendDot color="bg-red-400" label={`${(reliability?.needsAttentionApps ?? 0) + (reliability?.unavailableApps ?? 0)} issues`} />
            </div>
          </MonitoringInset>

          <MonitoringInset className="p-4">
            <p className="text-xs font-bold uppercase text-slate-500">Event tone</p>
            <ChartContainer className="mt-3 h-[190px] w-full aspect-auto" config={{ count: { label: 'Events', color: '#8b5cf6' } }}>
              <AreaChart data={levelData} margin={{ left: 0, right: 8, top: 12, bottom: 0 }}>
                <defs>
                  <linearGradient id="eventToneFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.75} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={24} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area dataKey="count" type="monotone" stroke="#a78bfa" fill="url(#eventToneFill)" strokeWidth={2} />
              </AreaChart>
            </ChartContainer>
          </MonitoringInset>
        </div>

        <div className="grid gap-4">
          <MonitoringInset className="p-4">
            <p className="text-xs font-bold uppercase text-slate-500">Activity by area</p>
            <ChartContainer className="mt-3 h-[220px] w-full aspect-auto" config={{ count: { label: 'Events', color: '#22d3ee' } }}>
              <BarChart data={categoryData} margin={{ left: 0, right: 8, top: 12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={24} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="#22d3ee" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </MonitoringInset>

          <MonitoringInset className="p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase text-slate-500">Managed app resources</p>
              <span className="text-xs text-slate-500">{resourceData.length ? 'Current top apps' : 'No current sample'}</span>
            </div>
            {resourceData.length ? (
              <ChartContainer
                className="mt-3 h-[220px] w-full aspect-auto"
                config={{
                  cpu: { label: 'CPU %', color: '#34d399' },
                  memory: { label: 'Memory %', color: '#fbbf24' },
                }}
              >
                <BarChart data={resourceData} margin={{ left: 0, right: 8, top: 12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={28} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="cpu" fill="#34d399" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="memory" fill="#fbbf24" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <EmptyState title="No app resource samples" message="App CPU and memory charts appear after telemetry is collected." compact />
            )}
          </MonitoringInset>

          <MonitoringInset className="p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase text-slate-500">App resource trend</p>
              <span className="text-xs text-slate-500">{history?.windowLabel || 'Last 60 minutes'}</span>
            </div>
            {appTrendData.length > 1 ? (
              <ChartContainer
                className="mt-3 h-[220px] w-full aspect-auto"
                config={{
                  cpu: { label: 'Avg CPU %', color: '#34d399' },
                  memory: { label: 'Avg Memory %', color: '#fbbf24' },
                }}
              >
                <AreaChart data={appTrendData} margin={{ left: 0, right: 8, top: 12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="appCpuTrendFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.55} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id="appMemoryTrendFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#fbbf24" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={18} />
                  <YAxis tickLine={false} axisLine={false} width={28} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area dataKey="cpu" type="monotone" stroke="#34d399" fill="url(#appCpuTrendFill)" strokeWidth={2} />
                  <Area dataKey="memory" type="monotone" stroke="#fbbf24" fill="url(#appMemoryTrendFill)" strokeWidth={2} />
                </AreaChart>
              </ChartContainer>
            ) : (
              <EmptyState title="Trend is still warming up" message="Keep Monitoring open briefly to collect enough app samples for a trend." compact />
            )}
          </MonitoringInset>
        </div>
      </div>
    </MonitoringPanel>
  );
}

function DeviceInstrumentationPanel({
  history,
  hostTrendData,
  metrics,
}: {
  history: MonitoringHistory | null;
  hostTrendData: HostTrendPoint[];
  metrics: SystemMetrics | null;
}) {
  const memoryUsedBytes = metrics ? metrics.totalMemoryBytes - metrics.freeMemoryBytes : 0;
  const runtimeUsedBytes = metrics ? metrics.runtimeTotalBytes - metrics.runtimeUsableBytes : 0;

  return (
    <MonitoringPanel>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Server className="size-5 text-cyan-300" />
            <h2 className="text-xl font-black text-white">Device instrumentation</h2>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Current host readings for the device running Autark-OS. Memory uses Linux available memory so cache does not look like active app usage.
          </p>
        </div>
        <Badge className="border-cyan-300/20 bg-cyan-500/10 text-cyan-100">{metrics ? formatDate(metrics.checkedAt) : 'Waiting'}</Badge>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <MetricRing icon={Cpu} label="Device CPU" value={metrics?.systemCpuPercent ?? -1} detail={metrics ? `${metrics.availableProcessors} cores available` : 'No sample yet'} tone="cyan" />
        <MetricRing icon={MemoryStick} label="Memory" value={metrics?.usedMemoryPercent ?? -1} detail={metrics ? `${formatBytes(memoryUsedBytes)} used of ${formatBytes(metrics.totalMemoryBytes)}` : 'No sample yet'} tone="cyan" />
        <MetricRing icon={HardDrive} label="Autark-OS disk" value={metrics?.runtimeUsedPercent ?? -1} detail={metrics ? `${formatBytes(runtimeUsedBytes)} used of ${formatBytes(metrics.runtimeTotalBytes)}` : 'No sample yet'} tone="orange" />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <MetricDetail icon={Server} label="Device" value={metrics?.deviceName || 'Autark-OS device'} />
        <MetricDetail icon={Cpu} label="OS" value={metrics ? `${metrics.osName} ${metrics.osVersion}` : 'Not reported'} />
        <MetricDetail icon={MemoryStick} label="Available memory" value={metrics ? `${formatBytes(metrics.freeMemoryBytes)} available` : 'Not reported'} />
        <MetricDetail icon={Activity} label="System load" value={metrics ? loadLabel(metrics.systemLoadAverage, metrics.availableProcessors) : 'Not reported'} />
        <MetricDetail icon={Database} label="Runtime" value={metrics?.runtimeRoot || 'Not reported'} />
        <MetricDetail icon={Activity} label="Backend CPU" value={percentLabel(metrics?.processCpuPercent)} />
      </div>

      <MonitoringInset className="mt-5 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase text-slate-500">Device trends</p>
          <span className="text-xs text-slate-500">{history?.windowLabel || 'Last 60 minutes'}</span>
        </div>
        {hostTrendData.length > 1 ? (
          <ChartContainer
            className="mt-3 h-[240px] w-full aspect-auto"
            config={{
              cpu: { label: 'CPU %', color: '#22d3ee' },
              memory: { label: 'Memory %', color: '#a78bfa' },
              disk: { label: 'Disk %', color: '#fbbf24' },
            }}
          >
            <AreaChart data={hostTrendData} margin={{ left: 0, right: 8, top: 12, bottom: 0 }}>
              <defs>
                <linearGradient id="hostCpuTrendFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.55} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.04} />
                </linearGradient>
                <linearGradient id="hostMemoryTrendFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#a78bfa" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={18} />
              <YAxis tickLine={false} axisLine={false} width={28} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area dataKey="cpu" type="monotone" stroke="#22d3ee" fill="url(#hostCpuTrendFill)" strokeWidth={2} />
              <Area dataKey="memory" type="monotone" stroke="#a78bfa" fill="url(#hostMemoryTrendFill)" strokeWidth={2} />
              <Area dataKey="disk" type="monotone" stroke="#fbbf24" fill="transparent" strokeWidth={2} />
            </AreaChart>
          </ChartContainer>
        ) : (
          <EmptyState title="Trend is still warming up" message="Autark-OS needs at least two retained host samples before drawing this trend." compact />
        )}
      </MonitoringInset>
    </MonitoringPanel>
  );
}

function MetricRing({ detail, icon: Icon, label, tone, value }: { detail: string; icon: LucideIcon; label: string; tone: 'cyan' | 'orange'; value: number }) {
  const colors = {
    cyan: '#22d3ee',
    orange: '#fb923c',
  };
  const safeValue = value < 0 ? 0 : clamp(value);

  return (
    <MonitoringInset className="p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
        <Icon className="size-4 text-slate-400" />
      </div>
      <div className="mt-4 flex items-center gap-4">
        <div
          className="grid size-20 shrink-0 place-items-center rounded-full"
          style={{ background: `conic-gradient(${colors[tone]} ${safeValue * 3.6}deg, rgb(30 41 59) 0deg)` }}
        >
          <div className="grid size-14 place-items-center rounded-full bg-slate-950 text-sm font-black text-white">
            {value < 0 ? 'N/A' : `${Math.round(value)}%`}
          </div>
        </div>
        <p className="text-sm text-slate-400">{detail}</p>
      </div>
    </MonitoringInset>
  );
}

function MetricDetail({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <MonitoringInset className="flex min-w-0 gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-slate-500" />
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
        <p className="mt-1 truncate text-sm text-slate-200" title={value}>{value}</p>
      </div>
    </MonitoringInset>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('size-2 rounded-full', color)} />
      {label}
    </span>
  );
}

function EmptyState({ compact = false, message, title }: { compact?: boolean; message: string; title: string }) {
  return <ProjectInlineEmptyState compact={compact} description={message} title={title} />;
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'Not recorded';
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function percentLabel(value?: number | null) {
  if (value == null || value < 0) {
    return 'Not reported';
  }
  return `${Math.round(value)}%`;
}

function loadLabel(value: number, cores: number) {
  if (!Number.isFinite(value) || value < 0) {
    return 'Not reported';
  }
  const normalized = cores > 0 ? `, ${(value / cores).toFixed(2)} per core` : '';
  return `${value.toFixed(2)} load average${normalized}`;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}
