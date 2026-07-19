import { useMemo, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Cpu,
  Download,
  Filter,
  HardDrive,
  HeartPulse,
  Info,
  MemoryStick,
  PackageOpen,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { LocalizedDateTime } from '@/components/autark-os/LocalizedDateTime';
import { MetadataBadge } from '@/components/autark-os/MetadataBadge';
import { StatusBadge, type StatusBadgeTone } from '@/components/autark-os/StatusBadge';
import { RefreshStatus } from '@/components/RefreshStatus';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProjectDarkControlButton } from '@/components/primitives/ProjectButtons';
import { ProjectInlineEmptyState as EmptyState } from '@/components/primitives/EmptyState';
import { ProjectInset, Surface } from '@/components/primitives/Surface';
import { buildAppRemediationFromIssue } from '@/lib/appRemediation';
import { cn } from '@/lib/utils';
import type { ActivityLog } from '@/types/activity';
import type { AppReliabilityIssue, AppReliabilitySummary } from '@/types/app';
import type { SystemMetrics } from '@/types/system';
import { humanize } from './extensions/MonitoringPage.viewModels';

type ActivityWorkspaceTab = 'all' | 'attention' | 'repairs' | 'apps' | 'metrics';

type MonitoringActivityWorkspaceProps = {
  activity: ActivityLog[];
  advancedMetrics: ReactNode;
  category: string;
  categoryFilters: string[];
  diagnosticsExporting: boolean;
  isLoading: boolean;
  level: string;
  levelFilters: string[];
  metrics: SystemMetrics | null;
  onCategoryChange: (value: string) => void;
  onExportDiagnostics: () => void;
  onLevelChange: (value: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
  reliability: AppReliabilitySummary | null;
  showAdvancedMetrics: boolean;
  timeZone: string;
  updatedAt: Date | null;
};

const tabLabels: Record<ActivityWorkspaceTab, string> = {
  all: 'All activity',
  apps: 'App activity',
  attention: 'Needs attention',
  metrics: 'System metrics',
  repairs: 'Repairs',
};

const categoryLabels: Record<string, string> = {
  access: 'Access',
  api: 'API',
  backup: 'Backups',
  health: 'Health',
  install: 'Apps',
  repair: 'Repairs',
  system: 'System',
};

export function MonitoringActivityWorkspace({
  activity,
  advancedMetrics,
  category,
  categoryFilters,
  diagnosticsExporting,
  isLoading,
  level,
  levelFilters,
  metrics,
  onCategoryChange,
  onExportDiagnostics,
  onLevelChange,
  onRefresh,
  refreshing,
  reliability,
  showAdvancedMetrics,
  timeZone,
  updatedAt,
}: MonitoringActivityWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<ActivityWorkspaceTab>('all');
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const attentionEvents = useMemo(() => activity.filter(needsAttention), [activity]);
  const visibleEvents = useMemo(() => eventsForTab(activity, activeTab), [activity, activeTab]);
  const selectedEvent = activity.find((event) => event.id === selectedEventId)
    ?? visibleEvents[0]
    ?? activity[0]
    ?? null;
  const attentionCount = reliability?.issues.length ?? attentionEvents.length;
  const recentRepairCount = reliability?.recentSuccessfulRepairs ?? activity.filter((event) => event.category === 'repair' && event.level === 'success').length;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <ActivityWorkspaceHeader
        attentionCount={attentionCount}
        diagnosticsExporting={diagnosticsExporting}
        lastEvent={activity[0] ?? null}
        onExportDiagnostics={onExportDiagnostics}
        onRefresh={onRefresh}
        recentRepairCount={recentRepairCount}
        refreshing={refreshing}
        reliability={reliability}
        showAdvancedMetrics={showAdvancedMetrics}
        timeZone={timeZone}
        updatedAt={updatedAt}
      />

      <Tabs
        className="min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-sky-300/20 bg-slate-900 xl:grid xl:grid-cols-[13rem_minmax(0,1fr)_18rem]"
        onValueChange={(value) => setActiveTab(value as ActivityWorkspaceTab)}
        orientation="vertical"
        value={activeTab}
      >
        <ActivityWorkspaceNavigation attentionCount={attentionCount} showAdvancedMetrics={showAdvancedMetrics} />

        <section className="flex min-h-0 flex-col overflow-hidden bg-slate-900/40">
          {activeTab !== 'metrics' && (
            <ActivityFilterBar
              category={category}
              categoryFilters={categoryFilters}
              level={level}
              levelFilters={levelFilters}
              onCategoryChange={onCategoryChange}
              onLevelChange={onLevelChange}
            />
          )}

          <TabsContent className="m-0 h-full min-h-0" value="all">
            <ActivityEventWorkspace
              description="The latest visible work Autark-OS has done for apps, backups, access, and repairs."
              events={visibleEvents}
              isLoading={isLoading}
              onSelect={setSelectedEventId}
              selectedEventId={selectedEvent?.id ?? null}
              timeZone={timeZone}
              title={tabLabels.all}
            />
          </TabsContent>

          <TabsContent className="m-0 h-full min-h-0" value="attention">
            <ActivityEventWorkspace
              description="Events that need a review or could not be repaired automatically."
              events={visibleEvents}
              isLoading={isLoading}
              onSelect={setSelectedEventId}
              selectedEventId={selectedEvent?.id ?? null}
              timeZone={timeZone}
              title={tabLabels.attention}
            />
          </TabsContent>

          <TabsContent className="m-0 h-full min-h-0" value="repairs">
            <ActivityEventWorkspace
              description="Safe repairs and recovery attempts performed by Autark-OS."
              events={visibleEvents}
              isLoading={isLoading}
              onSelect={setSelectedEventId}
              selectedEventId={selectedEvent?.id ?? null}
              timeZone={timeZone}
              title={tabLabels.repairs}
            />
          </TabsContent>

          <TabsContent className="m-0 h-full min-h-0" value="apps">
            <ActivityEventWorkspace
              description="Events linked to installed apps on this Autark-OS instance."
              events={visibleEvents}
              isLoading={isLoading}
              onSelect={setSelectedEventId}
              selectedEventId={selectedEvent?.id ?? null}
              timeZone={timeZone}
              title={tabLabels.apps}
            />
          </TabsContent>

          {showAdvancedMetrics && (
            <TabsContent className="m-0 h-full min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-4" value="metrics">
              <SystemMetricsWorkspace metrics={metrics}>{advancedMetrics}</SystemMetricsWorkspace>
            </TabsContent>
          )}
        </section>

        <ActivityAttentionRail event={selectedEvent} issues={reliability?.issues ?? []} showAdvancedMetrics={showAdvancedMetrics} timeZone={timeZone} />
      </Tabs>
    </section>
  );
}

function ActivityWorkspaceHeader({
  attentionCount,
  diagnosticsExporting,
  lastEvent,
  onExportDiagnostics,
  onRefresh,
  recentRepairCount,
  refreshing,
  reliability,
  showAdvancedMetrics,
  timeZone,
  updatedAt,
}: {
  attentionCount: number;
  diagnosticsExporting: boolean;
  lastEvent: ActivityLog | null;
  onExportDiagnostics: () => void;
  onRefresh: () => void;
  recentRepairCount: number;
  refreshing: boolean;
  reliability: AppReliabilitySummary | null;
  showAdvancedMetrics: boolean;
  timeZone: string;
  updatedAt: Date | null;
}) {
  return (
    <Surface as="header" className="shrink-0 overflow-hidden border-sky-300/15 bg-app-panel shadow-xl shadow-slate-950/20" tone="panel">
      <div className="flex flex-col gap-3 px-4 py-3 sm:px-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="hidden size-10 shrink-0 place-items-center rounded-xl border border-cyan-300/35 bg-cyan-400/10 text-cyan-200 sm:grid">
            <Activity aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 text-3xl font-semibold tracking-tight text-white sm:text-[2.1rem]">Activity Log</h1>
              {reliability && <StatusBadge tone={postureBadgeTone(reliability.posture)}>{reliability.headline}</StatusBadge>}
            </div>
            <p className="mt-1 text-sm text-sky-100/70">A clear history of your server and apps.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <HeaderMetric label="Last event">
            <LocalizedDateTime className="block truncate text-xs font-semibold text-white" model={{ empty: 'Waiting', timeZone, value: lastEvent?.createdAt }} />
          </HeaderMetric>
          <HeaderMetric label="Needs review" tone={attentionCount > 0 ? 'warning' : 'neutral'} value={`${attentionCount}`} />
          <HeaderMetric label="Auto-fixed" tone="success" value={`${recentRepairCount}`} />
          {showAdvancedMetrics && (
            <DisabledAction disabled={diagnosticsExporting} reason="Diagnostics export is already being prepared.">
              <ProjectDarkControlButton className="h-9 px-2.5 text-xs" disabled={diagnosticsExporting} onClick={onExportDiagnostics} type="button">
                <Download aria-hidden="true" className="size-3.5" />
                Export
              </ProjectDarkControlButton>
            </DisabledAction>
          )}
          <RefreshStatus className="pl-1" intervalLabel="Updates every 10s" onRefresh={onRefresh} refreshing={refreshing} showButton tone="info" updatedAt={updatedAt} />
        </div>
      </div>
    </Surface>
  );
}

function HeaderMetric({ children, label, tone = 'neutral', value }: { children?: ReactNode; label: string; tone?: 'neutral' | 'success' | 'warning'; value?: string }) {
  return (
    <span className={cn(
      'hidden min-w-[5.3rem] rounded-xl border px-2.5 py-1.5 sm:block',
      tone === 'success' && 'border-emerald-300/20 bg-emerald-400/5',
      tone === 'warning' && 'border-amber-300/20 bg-amber-400/5',
      tone === 'neutral' && 'border-sky-300/15 bg-slate-950/25',
    )}>
      <span className="block text-[0.62rem] text-sky-100/55">{label}</span>
      {children ?? <span className={cn('block text-xs font-semibold text-white', tone === 'success' && 'text-emerald-100', tone === 'warning' && 'text-amber-100')}>{value}</span>}
    </span>
  );
}

function ActivityWorkspaceNavigation({ attentionCount, showAdvancedMetrics }: { attentionCount: number; showAdvancedMetrics: boolean }) {
  const tabs: Array<{ icon: LucideIcon; label: string; value: Exclude<ActivityWorkspaceTab, 'metrics'> | 'metrics' }> = [
    { icon: Activity, label: tabLabels.all, value: 'all' },
    { icon: AlertTriangle, label: tabLabels.attention, value: 'attention' },
    { icon: Wrench, label: tabLabels.repairs, value: 'repairs' },
    { icon: PackageOpen, label: tabLabels.apps, value: 'apps' },
  ];
  if (showAdvancedMetrics) tabs.push({ icon: BarChart3, label: tabLabels.metrics, value: 'metrics' });

  return (
    <aside className="shrink-0 border-b border-sky-300/15 bg-slate-950/20 p-3 xl:min-h-0 xl:border-r xl:border-b-0">
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-sky-100/55">Views</p>
      <TabsList className="mt-2 w-full items-stretch gap-1 rounded-none bg-transparent p-0" variant="line">
        {tabs.map((tab) => <ActivityTabTrigger attentionCount={attentionCount} key={tab.value} tab={tab} />)}
      </TabsList>
      <div className="mt-4 border-t border-sky-300/15 pt-3">
        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-sky-100/55">Apps</p>
        <Link className="mt-2 flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-sky-100/70 transition hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70" to="/apps">
          <PackageOpen aria-hidden="true" className="size-3.5 text-cyan-200" />
          <span className="min-w-0 flex-1">View My Apps</span>
          <ChevronRight aria-hidden="true" className="size-3.5 text-sky-100/35" />
        </Link>
      </div>
    </aside>
  );
}

function ActivityTabTrigger({ attentionCount, tab }: { attentionCount: number; tab: { icon: LucideIcon; label: string; value: ActivityWorkspaceTab } }) {
  const Icon = tab.icon;
  return (
    <TabsTrigger className="h-auto min-h-10 rounded-lg border-0 px-2 py-2 text-left data-active:bg-cyan-300/15 data-active:text-cyan-100" value={tab.value}>
      <Icon aria-hidden="true" className="size-3.5" />
      <span className="min-w-0 flex-1 truncate">{tab.label}</span>
      {tab.value === 'attention' && attentionCount > 0 && <span aria-label={`${attentionCount} needs review`} className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[0.65rem] font-semibold text-amber-100">{attentionCount}</span>}
    </TabsTrigger>
  );
}

function ActivityFilterBar({ category, categoryFilters, level, levelFilters, onCategoryChange, onLevelChange }: {
  category: string;
  categoryFilters: string[];
  level: string;
  levelFilters: string[];
  onCategoryChange: (value: string) => void;
  onLevelChange: (value: string) => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-sky-300/15 px-3 py-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <span className="inline-flex h-8 items-center gap-1.5 px-1.5 text-xs font-semibold text-sky-100/55"><Filter aria-hidden="true" className="size-3.5" />Filter</span>
        {levelFilters.map((option) => <button aria-pressed={level === option} className={cn('h-8 rounded-lg px-2.5 text-xs font-medium capitalize transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70', level === option ? 'bg-cyan-300 text-slate-950' : 'text-sky-100/65 hover:bg-slate-800 hover:text-white')} key={option} onClick={() => onLevelChange(option)} type="button">{levelLabel(option)}</button>)}
      </div>
      <Select onValueChange={onCategoryChange} value={category}>
        <SelectTrigger aria-label="Filter activity by category" className="h-8 border-sky-300/20 bg-slate-950/25 text-xs text-sky-100/75" size="sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          {categoryFilters.map((option) => <SelectItem key={option} value={option}>{option === 'all' ? 'All categories' : categoryLabels[option] ?? humanize(option)}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function ActivityEventWorkspace({ description, events, isLoading, onSelect, selectedEventId, timeZone, title }: {
  description: string;
  events: ActivityLog[];
  isLoading: boolean;
  onSelect: (id: number) => void;
  selectedEventId: number | null;
  timeZone: string;
  title: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col p-3 sm:p-4">
      <div className="mb-2 flex shrink-0 items-start justify-between gap-3">
        <div><h2 className="text-sm font-semibold text-white">{title}</h2><p className="mt-0.5 text-xs leading-5 text-sky-100/55">{description}</p></div>
        <MetadataBadge tone="info">{events.length} events</MetadataBadge>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-sky-300/15 bg-slate-950/25 [scrollbar-color:rgba(103,232,249,0.55)_rgba(15,23,42,0.8)] [scrollbar-width:thin]">
        {isLoading ? <EmptyState className="m-3" title="Loading activity" description="Autark-OS is checking recent events." />
          : events.length ? events.map((event) => <ActivityEventRow event={event} key={event.id} onSelect={() => onSelect(event.id)} selected={event.id === selectedEventId} timeZone={timeZone} />)
            : <EmptyState className="m-3" title="No activity found" description="Try another filter, or install an app to start recording activity." />}
      </div>
    </div>
  );
}

function ActivityEventRow({ event, onSelect, selected, timeZone }: { event: ActivityLog; onSelect: () => void; selected: boolean; timeZone: string }) {
  const Icon = eventIcon(event);
  return (
    <button className={cn('flex w-full items-center gap-3 border-b border-sky-300/10 px-3 py-2.5 text-left transition last:border-b-0 hover:bg-slate-800/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70', selected && 'bg-cyan-400/10')} onClick={onSelect} type="button">
      <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg border', eventIconTone(event))}><Icon aria-hidden="true" className="size-4" /></span>
      <span className="min-w-0 flex-1"><span className="flex min-w-0 items-center gap-2"><span className="truncate text-sm font-semibold text-white">{event.title}</span>{event.appId && <span className="hidden truncate text-xs text-sky-100/55 sm:inline">{event.appId}</span>}</span><span className="mt-0.5 block truncate text-xs text-sky-100/60">{event.message}</span></span>
      <span className="hidden shrink-0 text-right sm:block"><span className="block text-[0.65rem] font-semibold uppercase tracking-wide text-sky-100/45">{categoryLabels[event.category] ?? humanize(event.category)}</span><LocalizedDateTime className="mt-0.5 block text-xs text-sky-100/60" model={{ timeZone, value: event.createdAt }} /></span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-sky-100/30" />
    </button>
  );
}

function ActivityAttentionRail({ event, issues, showAdvancedMetrics, timeZone }: { event: ActivityLog | null; issues: AppReliabilityIssue[]; showAdvancedMetrics: boolean; timeZone: string }) {
  const highlightedIssue = issues[0] ?? null;
  return (
    <aside className="min-h-0 overflow-y-auto bg-slate-950/20 p-3 xl:border-l xl:border-sky-300/15">
      <h2 className="text-sm font-semibold text-white">Needs attention</h2>
      {highlightedIssue ? <AttentionIssueCard issue={highlightedIssue} remainingCount={issues.length - 1} /> : <NoAttentionCard />}
      <section className="mt-4 border-t border-sky-300/15 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-100/55">Selected activity</p>
        {event ? <SelectedActivityDetail event={event} showAdvancedMetrics={showAdvancedMetrics} timeZone={timeZone} /> : <p className="mt-2 text-xs leading-5 text-sky-100/60">Select an event to read its context.</p>}
      </section>
      <ProjectInset className="mt-4 border border-sky-300/15 bg-slate-900/55 text-xs leading-5 text-sky-100/60"><span className="font-semibold text-sky-100">Quiet by default.</span> Routine events remain in the history; only actionable changes are highlighted here.</ProjectInset>
    </aside>
  );
}

function AttentionIssueCard({ issue, remainingCount }: { issue: AppReliabilityIssue; remainingCount: number }) {
  const remediation = buildAppRemediationFromIssue(issue);
  const destination = remediation?.safeAction.kind === 'link' ? remediation.safeAction.to : '/apps';
  return (
    <section className="mt-3 rounded-xl border border-amber-300/25 bg-amber-400/5 p-3">
      <div className="flex gap-2"><span className="grid size-7 shrink-0 place-items-center rounded-lg border border-amber-300/25 bg-amber-400/10 text-amber-100"><AlertTriangle aria-hidden="true" className="size-3.5" /></span><div className="min-w-0"><p className="text-xs font-semibold text-amber-100">Review available</p><h3 className="mt-0.5 text-sm font-semibold text-white">{remediation?.title || `Review ${issue.appName}`}</h3></div></div>
      <p className="mt-3 text-xs leading-5 text-amber-100/75">{remediation?.summary || issue.message}</p>
      <ProjectDarkControlButton asChild className="mt-3 h-8 w-full border-amber-300/30 px-2.5 text-xs text-amber-100" size="sm"><Link to={destination}>{remediation?.safeAction.label || 'Open My Apps'} <ChevronRight aria-hidden="true" className="size-3.5" /></Link></ProjectDarkControlButton>
      {remainingCount > 0 && <Link className="mt-2 block text-center text-xs font-medium text-amber-100/80 hover:text-amber-50" to="/apps">{remainingCount} more item{remainingCount === 1 ? '' : 's'} in My Apps</Link>}
    </section>
  );
}

function NoAttentionCard() {
  return <section className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-400/5 p-3"><div className="flex gap-2"><span className="grid size-7 shrink-0 place-items-center rounded-lg border border-emerald-300/25 bg-emerald-400/10 text-emerald-100"><CheckCircle2 aria-hidden="true" className="size-3.5" /></span><div><p className="text-sm font-semibold text-white">Nothing needs attention</p><p className="mt-1 text-xs leading-5 text-emerald-100/75">Autark-OS has not found an app issue that needs action right now.</p></div></div></section>;
}

function SelectedActivityDetail({ event, showAdvancedMetrics, timeZone }: { event: ActivityLog; showAdvancedMetrics: boolean; timeZone: string }) {
  const Icon = eventIcon(event);
  return (
    <div className="mt-2 rounded-xl border border-sky-300/15 bg-slate-900 p-3">
      <div className="flex gap-2"><span className={cn('grid size-7 shrink-0 place-items-center rounded-lg border', eventIconTone(event))}><Icon aria-hidden="true" className="size-3.5" /></span><div className="min-w-0"><p className={cn('text-xs font-semibold', eventTextTone(event))}>{humanize(event.category)}</p><h3 className="mt-0.5 text-sm font-semibold text-white">{event.title}</h3></div></div>
      <p className="mt-3 text-xs leading-5 text-sky-100/65">{event.message}</p>
      <div className="mt-3 grid gap-1.5 border-t border-sky-300/15 pt-3"><RailFact icon={Clock3} label="Recorded" value={<LocalizedDateTime className="font-semibold text-white" model={{ timeZone, value: event.createdAt }} />} /><RailFact icon={event.appId ? PackageOpen : Activity} label={event.appId ? 'Related app' : 'Scope'} value={event.appId || 'This server'} /><RailFact icon={event.category === 'repair' ? Wrench : Info} label="Type" value={humanize(event.category)} /></div>
      {showAdvancedMetrics && <AdvancedEventDetail event={event} />}
    </div>
  );
}

function AdvancedEventDetail({ event }: { event: ActivityLog }) {
  return (
    <Collapsible className="mt-3 border-t border-sky-300/15 pt-3">
      <CollapsibleTrigger className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-sky-300/20 bg-slate-950/25 px-2.5 text-xs font-semibold text-sky-100 hover:border-cyan-300/30 hover:text-white"><Info aria-hidden="true" className="size-3.5" />Technical detail <ChevronDown aria-hidden="true" className="size-3.5" /></CollapsibleTrigger>
      <CollapsibleContent className="mt-2 grid gap-2"><RailFact label="Action" value={humanize(event.action)} /><RailFact label="Outcome" value={humanize(event.outcome)} /><RailFact label="Level" value={humanize(event.level)} />{event.details && <pre className="max-h-40 overflow-auto rounded-lg border border-slate-800 bg-slate-950/80 p-2 text-[0.68rem] leading-5 text-slate-300">{event.details}</pre>}</CollapsibleContent>
    </Collapsible>
  );
}

function RailFact({ icon: Icon, label, value }: { icon?: LucideIcon; label: string; value: ReactNode }) {
  return <div className="flex items-center gap-2 text-xs">{Icon && <Icon aria-hidden="true" className="size-3.5 text-sky-100/45" />}<span className="text-sky-100/55">{label}</span><span className="ml-auto min-w-0 truncate text-right font-semibold text-white">{value}</span></div>;
}

function SystemMetricsWorkspace({ children, metrics }: { children: ReactNode; metrics: SystemMetrics | null }) {
  const memoryUsedBytes = metrics ? metrics.totalMemoryBytes - metrics.freeMemoryBytes : 0;
  const runtimeUsedBytes = metrics ? metrics.runtimeTotalBytes - metrics.runtimeUsableBytes : 0;
  return (
    <div className="grid min-h-full content-start gap-3">
      <div><h2 className="text-base font-semibold text-white">System metrics</h2><p className="mt-1 text-xs leading-5 text-sky-100/60">Current readings and recent trends for this server.</p></div>
      <section className="grid gap-2 sm:grid-cols-3" aria-label="Current system metrics">
        <SystemMetricCard detail={metrics ? `${metrics.availableProcessors} cores available` : 'Waiting for a sample'} icon={Cpu} label="Device CPU" tone="info" value={percentLabel(metrics?.systemCpuPercent)} />
        <SystemMetricCard detail={metrics ? `${formatMetricBytes(memoryUsedBytes)} used of ${formatMetricBytes(metrics.totalMemoryBytes)}` : 'Waiting for a sample'} icon={MemoryStick} label="Memory" tone="info" value={percentLabel(metrics?.usedMemoryPercent)} />
        <SystemMetricCard detail={metrics ? `${formatMetricBytes(runtimeUsedBytes)} used of ${formatMetricBytes(metrics.runtimeTotalBytes)}` : 'Waiting for a sample'} icon={HardDrive} label="Autark-OS disk" tone="warning" value={percentLabel(metrics?.runtimeUsedPercent)} />
      </section>
      {children}
    </div>
  );
}

function SystemMetricCard({ detail, icon: Icon, label, tone, value }: { detail: string; icon: LucideIcon; label: string; tone: 'info' | 'warning'; value: string }) {
  return <ProjectInset className={cn('border p-3', tone === 'warning' ? 'border-amber-300/20 bg-amber-400/5' : 'border-cyan-300/15 bg-cyan-400/5')}><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-sky-100/65">{label}</p><Icon aria-hidden="true" className={cn('size-3.5', tone === 'warning' ? 'text-amber-100' : 'text-cyan-100')} /></div><p className="mt-1 text-xl font-semibold text-white">{value}</p><p className="mt-1 truncate text-[0.68rem] text-sky-100/55">{detail}</p></ProjectInset>;
}

function eventsForTab(events: ActivityLog[], tab: ActivityWorkspaceTab) {
  if (tab === 'attention') return events.filter(needsAttention);
  if (tab === 'repairs') return events.filter((event) => event.category === 'repair');
  if (tab === 'apps') return events.filter((event) => Boolean(event.appId));
  return events;
}

function needsAttention(event: ActivityLog) {
  return event.level === 'error' || event.level === 'warning' || event.outcome === 'failed' || event.outcome === 'needs_attention';
}

function eventIcon(event: ActivityLog) {
  if (event.level === 'error') return AlertTriangle;
  if (event.category === 'repair') return Wrench;
  if (event.category === 'health') return HeartPulse;
  if (event.category === 'access') return ShieldCheck;
  if (event.level === 'success') return CheckCircle2;
  return Activity;
}

function eventIconTone(event: ActivityLog) {
  if (event.level === 'error' || event.outcome === 'failed') return 'border-rose-300/25 bg-rose-400/10 text-rose-100';
  if (event.level === 'warning' || event.outcome === 'needs_attention') return 'border-amber-300/25 bg-amber-400/10 text-amber-100';
  if (event.level === 'success') return 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100';
  return 'border-cyan-300/25 bg-cyan-400/10 text-cyan-100';
}

function eventTextTone(event: ActivityLog) {
  if (event.level === 'error' || event.outcome === 'failed') return 'text-rose-100';
  if (event.level === 'warning' || event.outcome === 'needs_attention') return 'text-amber-100';
  if (event.level === 'success') return 'text-emerald-100';
  return 'text-cyan-100';
}

function postureBadgeTone(posture: string): StatusBadgeTone {
  if (posture === 'healthy') return 'success';
  if (posture === 'critical') return 'danger';
  if (posture === 'warning') return 'warning';
  return 'neutral';
}

function levelLabel(level: string) {
  if (level === 'all') return 'All levels';
  if (level === 'warning') return 'Needs review';
  if (level === 'success') return 'Completed';
  if (level === 'info') return 'Updates';
  return humanize(level);
}

function percentLabel(value: number | null | undefined) {
  return typeof value === 'number' && value >= 0 ? `${Math.round(value)}%` : 'Waiting';
}

function formatMetricBytes(value: number) {
  if (!Number.isFinite(value) || value < 0) return 'Not reported';
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let current = value / 1024;
  let unit = 0;
  while (current >= 1024 && unit < units.length - 1) {
    current /= 1024;
    unit += 1;
  }
  return `${current >= 10 ? current.toFixed(0) : current.toFixed(1)} ${units[unit]}`;
}
