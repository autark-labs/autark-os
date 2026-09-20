import { useState, type ReactNode } from 'react';
import { Activity, AlertTriangle, BarChart3, CheckCircle2, ChevronDown, ChevronRight, Clock3, Download, HeartPulse, Info, PackageOpen, ShieldCheck, Wrench, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiErrorMessage } from '@/api/httpClient';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { PageLoadError } from '@/components/autark-os/PageLoadError';
import { LocalizedDateTime } from '@/components/autark-os/LocalizedDateTime';
import { MetadataBadge } from '@/components/autark-os/MetadataBadge';
import { RefreshStatus } from '@/components/RefreshStatus';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProjectDarkControlButton } from '@/components/primitives/ProjectButtons';
import { ProjectInlineEmptyState as EmptyState } from '@/components/primitives/EmptyState';
import { Surface } from '@/components/primitives/Surface';
import { buildAppRemediationFromIssue } from '@/lib/appRemediation';
import { cn } from '@/lib/utils';
import type { ActivityLog } from '@/types/activity';
import type { AppReliabilityIssue } from '@/types/app';
import type { useMonitoringRepository } from '@/repositories/monitoringRepository';
import { humanize } from './extensions/MonitoringPage.viewModels';

type MonitoringRepository = ReturnType<typeof useMonitoringRepository>;
type MonitoringActivityWorkspaceProps = {
  activity: ActivityLog[];
  monitoring: MonitoringRepository;
  advancedMetrics: ReactNode;
  category: string;
  categoryFilters: string[];
  diagnosticsExporting: boolean;
  level: string;
  levelFilters: string[];
  onCategoryChange: (value: string) => void;
  onExportDiagnostics: () => void;
  onLevelChange: (value: string) => void;
  showAdvancedMetrics: boolean;
  timeZone: string;
};

const categoryLabels: Record<string, string> = {
  'app-related': 'App-related events', access: 'Access', api: 'API', backup: 'Backups',
  health: 'Health', install: 'App installs', pro: 'Autark Pro', repair: 'Repairs', system: 'System',
};

export function MonitoringActivityWorkspace({
  activity, monitoring, advancedMetrics, category, categoryFilters, diagnosticsExporting,
  level, levelFilters, onCategoryChange, onExportDiagnostics, onLevelChange, showAdvancedMetrics, timeZone,
}: MonitoringActivityWorkspaceProps) {
  const [view, setView] = useState('history');
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const { activityQuery, reliabilityQuery, refresh } = monitoring;
  const selectedEvent = activity.find(event => event.id === selectedEventId) ?? activity[0] ?? null;
  const error = activityQuery.error ? apiErrorMessage(activityQuery.error, 'Activity could not be loaded.') : null;
  const activeView = showAdvancedMetrics ? view : 'history';

  return <section className="flex min-h-0 flex-1 flex-col gap-3">
    <Surface as="header" className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-border bg-app-panel p-5" tone="panel">
      <div className="flex items-center gap-3"><Activity className="size-8 text-primary" /><div><h1 className="text-3xl font-semibold">Activity Log</h1><p className="mt-1 text-sm text-muted-foreground">A history of your server and apps.</p></div></div>
      <div className="flex items-center gap-2">
        {showAdvancedMetrics && <DisabledAction disabled={diagnosticsExporting} reason="Diagnostics export is already being prepared.">
          <ProjectDarkControlButton disabled={diagnosticsExporting} onClick={onExportDiagnostics}><Download className="size-4" />Export</ProjectDarkControlButton>
        </DisabledAction>}
        <RefreshStatus error={error} intervalLabel="History updates every 10s" onRefresh={() => void refresh()} refreshing={activityQuery.isFetching} updatedAt={activityQuery.dataUpdatedAt ? new Date(activityQuery.dataUpdatedAt) : null} />
      </div>
    </Surface>
    <Tabs className="min-h-0 flex-1 gap-0 overflow-hidden rounded-2xl border border-border bg-app-panel" value={activeView} onValueChange={setView}>
      <div className="shrink-0 border-b border-border px-4 pt-3">
        <TabsList variant="line"><TabsTrigger value="history"><Activity />History</TabsTrigger>{showAdvancedMetrics && <TabsTrigger value="metrics"><BarChart3 />System metrics</TabsTrigger>}</TabsList>
      </div>
      <TabsContent value="history" className="m-0 min-h-0 overflow-y-auto">
        <div className="grid min-h-full md:grid-cols-[minmax(0,1fr)_18rem] xl:h-full">
          <section className="flex min-h-0 min-w-0 flex-col p-3">
            <ActivityFilterBar category={category} categoryFilters={categoryFilters} level={level} levelFilters={levelFilters} onCategoryChange={onCategoryChange} onLevelChange={onLevelChange} />
            {error && !activityQuery.data ? <PageLoadError model={{ title: 'History is unavailable', message: error }} onRetry={() => void activityQuery.refetch()} /> :
              <ActivityEventWorkspace
                description={category === 'app-related' ? 'App-related events within the latest 120 records matching this level.' : 'Latest 120 matching events, newest first. Historical warnings do not indicate current unresolved issues.'}
                events={activity}
                filtered={category !== 'all' || level !== 'all'}
                isLoading={activityQuery.isLoading}
                onClearFilters={() => { onCategoryChange('all'); onLevelChange('all'); }}
                onSelect={setSelectedEventId}
                selectedEventId={selectedEvent?.id ?? null}
                timeZone={timeZone}
              />}
          </section>
          <ActivityAttentionRail event={selectedEvent} query={reliabilityQuery} showAdvancedMetrics={showAdvancedMetrics} timeZone={timeZone} />
        </div>
      </TabsContent>
      {showAdvancedMetrics && <TabsContent value="metrics" className="m-0 min-h-0 overflow-y-auto p-4">{advancedMetrics}</TabsContent>}
    </Tabs>
  </section>;
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
      <Select onValueChange={onCategoryChange} value={category}>
        <SelectTrigger aria-label="Filter activity by category" className="h-8 w-48 border-border bg-app-surface text-xs" size="sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          {categoryFilters.map((option) => <SelectItem key={option} value={option}>{option === 'all' ? 'All events' : categoryLabels[option] ?? humanize(option)}</SelectItem>)}
        </SelectContent>
      </Select>
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        {levelFilters.map((option) => <button aria-pressed={level === option} className={cn('h-8 rounded-lg px-2.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', level === option ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground')} key={option} onClick={() => onLevelChange(option)} type="button">{levelLabel(option)}</button>)}
      </div>
    </div>
  );
}

function ActivityEventWorkspace({ description, events, filtered, isLoading, onClearFilters, onSelect, selectedEventId, timeZone }: {
  description: string;
  events: ActivityLog[];
  filtered: boolean;
  onClearFilters: () => void;
  isLoading: boolean;
  onSelect: (id: number) => void;
  selectedEventId: number | null;
  timeZone: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col p-3 sm:p-4">
      <div className="mb-2 flex shrink-0 items-start justify-between gap-3">
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
        <MetadataBadge tone="info">{events.length} events</MetadataBadge>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-sky-300/15 bg-slate-950/25 [scrollbar-color:rgba(103,232,249,0.55)_rgba(15,23,42,0.8)] [scrollbar-width:thin]">
        {isLoading ? <EmptyState className="m-3" title="Loading activity" description="Autark-OS is checking recent events." />
          : events.length ? events.map((event) => <ActivityEventRow event={event} key={event.id} onSelect={() => onSelect(event.id)} selected={event.id === selectedEventId} timeZone={timeZone} />)
            : <div className="p-3"><EmptyState title={filtered ? "No events match these filters" : "No activity recorded yet"} description={filtered ? "Choose another event type or level." : "Recorded work will appear here as you use Autark-OS."} />{filtered && <ProjectDarkControlButton onClick={onClearFilters}>Clear filters</ProjectDarkControlButton>}</div>}
      </div>
    </div>
  );
}

function ActivityEventRow({ event, onSelect, selected, timeZone }: { event: ActivityLog; onSelect: () => void; selected: boolean; timeZone: string }) {
  const Icon = eventIcon(event);
  return (
    <button aria-pressed={selected} className={cn('flex w-full items-center gap-3 border-b border-sky-300/10 px-3 py-2.5 text-left transition last:border-b-0 hover:bg-slate-800/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70', selected && 'bg-cyan-400/10')} onClick={onSelect} type="button">
      <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg border', eventIconTone(event))}><Icon aria-hidden="true" className="size-4" /></span>
      <span className="min-w-0 flex-1"><span className="flex min-w-0 items-center gap-2"><span className="truncate text-sm font-semibold text-white">{event.title}</span>{event.appId && <span className="hidden truncate text-xs text-sky-100/55 sm:inline">{event.appId}</span>}</span><span className="mt-0.5 block truncate text-xs text-sky-100/60">{event.message}</span></span>
      <span className="hidden shrink-0 text-right sm:block"><span className="block text-[0.65rem] font-semibold uppercase tracking-wide text-sky-100/45">{categoryLabels[event.category] ?? humanize(event.category)}</span><LocalizedDateTime className="mt-0.5 block text-xs text-sky-100/60" model={{ timeZone, value: event.createdAt }} /></span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-sky-100/30" />
    </button>
  );
}

function ActivityAttentionRail({ event, query, showAdvancedMetrics, timeZone }: { event: ActivityLog | null; query: MonitoringRepository['reliabilityQuery']; showAdvancedMetrics: boolean; timeZone: string }) {
  const issues = query.data?.issues ?? [];
  return (
    <aside className="min-h-0 overflow-y-auto border-l border-border bg-app-surface/40 p-4">
      <h2 className="text-sm font-semibold">Current app issues</h2>
      {query.error ? <RefreshStatus error={apiErrorMessage(query.error, 'Current app issues could not be checked.')} onRefresh={() => void query.refetch()} refreshing={query.isFetching} updatedAt={query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : null} /> : null}
      {!query.data ? <p className="mt-2 text-sm text-muted-foreground">{query.error ? 'Current issues are unavailable. History is still available.' : 'Checking current app issues…'}</p>
        : issues[0] ? <AttentionIssueCard issue={issues[0]} remainingCount={issues.length - 1} />
          : <p className="mt-2 text-sm text-muted-foreground">{query.error ? 'No app issues in the last confirmed check.' : 'No current app issues reported.'}</p>}
      <Link className="mt-2 inline-flex items-center gap-1 text-sm text-primary" to="/apps">Open My Apps <ChevronRight className="size-4" /></Link>
      <section aria-label="Selected activity" className="mt-5 border-t border-border pt-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected activity</h2>
        {event ? <SelectedActivityDetail key={event.id} event={event} showAdvancedMetrics={showAdvancedMetrics} timeZone={timeZone} /> : <p className="mt-3 text-sm text-muted-foreground">No event selected.</p>}
      </section>
    </aside>
  );
}

function AttentionIssueCard({ issue, remainingCount }: { issue: AppReliabilityIssue; remainingCount: number }) {
  const remediation = buildAppRemediationFromIssue(issue);
  const action = remediation?.safeAction;
  const destination = action?.kind === 'link' ? action.to : '/apps';
  return (
    <section className="mt-3 rounded-xl border border-amber-300/25 bg-amber-400/5 p-3">
      <div className="flex gap-2"><span className="grid size-7 shrink-0 place-items-center rounded-lg border border-amber-300/25 bg-amber-400/10 text-amber-100"><AlertTriangle aria-hidden="true" className="size-3.5" /></span><div className="min-w-0"><p className="text-xs font-semibold text-amber-100">Review available</p><h3 className="mt-0.5 text-sm font-semibold text-white">{remediation?.title || `Review ${issue.appName}`}</h3></div></div>
      <p className="mt-3 text-xs leading-5 text-amber-100/75">{remediation?.summary || issue.message}</p>
      <ProjectDarkControlButton asChild className="mt-3 h-8 w-full border-amber-300/30 px-2.5 text-xs text-amber-100" size="sm"><Link to={destination}>{action?.kind === 'link' ? action.label : 'Open My Apps'} <ChevronRight aria-hidden="true" className="size-3.5" /></Link></ProjectDarkControlButton>
      {remainingCount > 0 && <Link className="mt-2 block text-center text-xs font-medium text-amber-100/80 hover:text-amber-50" to="/apps">{remainingCount} more item{remainingCount === 1 ? '' : 's'} in My Apps</Link>}
    </section>
  );
}

function SelectedActivityDetail({ event, showAdvancedMetrics, timeZone }: { event: ActivityLog; showAdvancedMetrics: boolean; timeZone: string }) {
  const Icon = eventIcon(event);
  return (
    <div className="mt-2 rounded-xl border border-sky-300/15 bg-slate-900 p-3">
      <div className="flex gap-2"><span className={cn('grid size-7 shrink-0 place-items-center rounded-lg border', eventIconTone(event))}><Icon aria-hidden="true" className="size-3.5" /></span><div className="min-w-0"><p className={cn('text-xs font-semibold', eventTextTone(event))}>{humanize(event.category)}</p><h3 className="mt-0.5 text-sm font-semibold text-white">{event.title}</h3></div></div>
      <p className="mt-3 text-xs leading-5 text-sky-100/65">{event.message}</p>
      <div className="mt-3 grid gap-1.5 border-t border-sky-300/15 pt-3"><RailFact icon={Clock3} label="Recorded" value={<LocalizedDateTime className="font-semibold text-white" model={{ timeZone, value: event.createdAt }} />} /><RailFact icon={event.appId ? PackageOpen : Activity} label={event.appId ? 'Related app' : 'Scope'} value={event.appId || 'This server'} /><RailFact icon={event.category === 'repair' ? Wrench : Info} label="Type" value={humanize(event.category)} /></div>
      {(showAdvancedMetrics || event.category === 'pro') && <AdvancedEventDetail event={event} />}
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

function eventIcon(event: ActivityLog) {
  if (event.level === 'error') return AlertTriangle;
  if (event.category === 'repair') return Wrench;
  if (event.category === 'health') return HeartPulse;
  if (event.category === 'access') return ShieldCheck;
  if (event.category === 'pro') return ShieldCheck;
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

function levelLabel(level: string) {
  if (level === 'all') return 'All levels';
  if (level === 'warning') return 'Warnings';
  if (level === 'success') return 'Completed';
  if (level === 'info') return 'Updates';
  if (level === 'error') return 'Errors';
  return humanize(level);
}
