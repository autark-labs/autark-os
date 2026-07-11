import { useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Clock3, Filter, HeartPulse, ShieldCheck, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ProjectInlineEmptyState as EmptyState } from '@/components/primitives/EmptyState';
import { ProjectDarkControlButton } from '@/components/primitives/ProjectButtons';
import { ProjectInset, ProjectPanel } from '@/components/primitives/Surface';
import { Badge } from '@/components/ui/badge';
import { buildAppRemediationFromIssue } from '@/lib/appRemediation';
import { formatLocalizedDateTime } from '@/lib/dateTime';
import { cn } from '@/lib/utils';
import type { ActivityLog } from '@/types/activity';
import type { AppReliabilityIssue, AppReliabilitySummary } from '@/types/app';
import { humanize } from './extensions/MonitoringPage.viewModels';

type MonitoringActivityFeedProps = {
  activity: ActivityLog[];
  category: string;
  categoryFilters: string[];
  isLoading: boolean;
  level: string;
  levelFilters: string[];
  onCategoryChange: (value: string) => void;
  onLevelChange: (value: string) => void;
  reliability: AppReliabilitySummary | null;
  showAdvancedMetrics: boolean;
  timeZone: string;
};

const MonitoringPanel = ProjectPanel;
const MonitoringInset = ProjectInset;

export function SystemActivitySummary({
  highlightedIssue,
  recentEvents,
  recentFixes,
  reliability,
  timeZone,
}: {
  highlightedIssue: AppReliabilityIssue | null;
  recentEvents: ActivityLog[];
  recentFixes: ActivityLog[];
  reliability: AppReliabilitySummary | null;
  timeZone: string;
}) {
  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <MonitoringPanel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="size-5 text-cyan-200" />
              <h2 className="text-xl font-black text-white">What Autark-OS is doing</h2>
            </div>
            <p className="mt-1 text-sm text-slate-400">Recent checks, background repairs, and app activity in plain language.</p>
          </div>
          <Badge className="border-cyan-300/35 bg-cyan-400/10 text-cyan-100">{recentEvents.length} recent</Badge>
        </div>
        <div className="mt-5 grid gap-3">
          {recentEvents.length ? recentEvents.map((event) => <CompactActivityItem event={event} key={event.id} timeZone={timeZone} />) : (
            <EmptyState compact title="No recent activity" description="Autark-OS has not logged visible work for the current filters yet." />
          )}
        </div>
      </MonitoringPanel>

      <div className="grid gap-5">
        <MonitoringPanel>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg border border-emerald-300/20 bg-emerald-500/10 text-emerald-200">
              <HeartPulse className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-black text-white">App health summary</h2>
              <p className="mt-1 text-sm text-slate-400">{reliability?.summary || 'Health checks appear here after apps are installed.'}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <MiniCount label="Ready" tone="green" value={`${reliability?.readyApps ?? 0}`} />
            <MiniCount label="Starting" tone="orange" value={`${reliability?.startingApps ?? 0}`} />
            <MiniCount label="Review" tone="red" value={`${(reliability?.needsAttentionApps ?? 0) + (reliability?.unavailableApps ?? 0)}`} />
          </div>
        </MonitoringPanel>

        <MonitoringPanel>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg border border-cyan-300/35 bg-cyan-400/10 text-cyan-100">
              <Wrench className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-black text-white">Automatic fixes</h2>
              <p className="mt-1 text-sm text-slate-400">{recentFixes.length ? 'Recent safe repairs Autark-OS completed.' : 'No automatic repairs were needed recently.'}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-2">
            {recentFixes.slice(0, 3).map((event) => <CompactActivityItem event={event} key={event.id} timeZone={timeZone} />)}
            {!recentFixes.length && <EmptyState compact title="Quiet is good" description="Autark-OS will list safe repair work here when it happens." />}
          </div>
        </MonitoringPanel>

        <HighlightedIssueCard issue={highlightedIssue} />
      </div>
    </section>
  );
}

export function MonitoringActivityFeed({
  activity,
  category,
  categoryFilters,
  isLoading,
  level,
  levelFilters,
  onCategoryChange,
  onLevelChange,
  reliability,
  showAdvancedMetrics,
  timeZone,
}: MonitoringActivityFeedProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <MonitoringPanel>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="size-5 text-cyan-200" />
              <h2 className="text-xl font-black text-white">Recent activity</h2>
            </div>
            <p className="mt-1 text-sm text-slate-400">{showAdvancedMetrics ? 'Install progress, health checks, repairs, private access changes, and backend warnings.' : 'The latest visible work Autark-OS has done for apps, backups, access, and repairs.'}</p>
          </div>
          <Badge className="border-slate-700 bg-slate-900 text-slate-300">{activity.length} events</Badge>
        </div>

        {showAdvancedMetrics && (
          <MonitoringInset className="mt-5 grid gap-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500">
              <Filter className="size-3.5" />
              Filters
            </div>
            <FilterBar label="Level" options={levelFilters} value={level} onChange={onLevelChange} />
            <FilterBar label="Category" options={categoryFilters} value={category} onChange={onCategoryChange} />
          </MonitoringInset>
        )}

        <div className="mt-5 flex max-h-[680px] flex-col gap-3 overflow-y-auto pr-2 [scrollbar-color:rgba(103,232,249,0.55)_rgba(15,23,42,0.8)] [scrollbar-width:thin]">
          {isLoading ? (
            <EmptyState title="Loading activity" description="Autark-OS is checking recent events." />
          ) : activity.length ? (
            activity.map((event) => (
              <ActivityRow
                event={event}
                expanded={expandedId === event.id}
                key={event.id}
                onToggle={() => setExpandedId((current) => current === event.id ? null : event.id)}
                showAdvancedMetrics={showAdvancedMetrics}
                timeZone={timeZone}
              />
            ))
          ) : (
            <EmptyState title="No activity found" description="Try another filter, or install an app to start recording activity." />
          )}
        </div>
      </MonitoringPanel>

      <aside className="flex flex-col gap-5">
        <MonitoringPanel>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-white">Needs attention</h2>
              <p className="mt-1 text-sm text-slate-400">Apps Autark-OS cannot fully fix on its own.</p>
            </div>
            <Badge className={cn('border', (reliability?.issues.length ?? 0) > 0 ? 'border-orange-400/45 bg-orange-500/10 text-orange-200' : 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100')}>
              {reliability?.issues.length ?? 0}
            </Badge>
          </div>
          <div className="mt-4 grid gap-3">
            {reliability?.issues.length ? reliability.issues.map((issue) => <IssueCard issue={issue} key={`${issue.appId}-${issue.status}`} />) : (
              <EmptyState title="No active issues" description="Autark-OS has not found any app stability issues." compact />
            )}
          </div>
        </MonitoringPanel>

        <MonitoringPanel>
          <h2 className="text-lg font-black text-white">What gets logged</h2>
          <div className="mt-4 grid gap-3 text-sm text-slate-300">
            <GuideRow icon={CheckCircle2} title="Successful work" text="Installs, repairs, access updates, and app checks that completed." />
            <GuideRow icon={AlertTriangle} title="Needs attention" text="Problems Autark-OS detected or could not safely repair." />
            <GuideRow icon={ShieldCheck} title="Background repair" text="Safe restart and private-link repair attempts performed by the guardian." />
            <GuideRow icon={Clock3} title="Timing" text="This page refreshes automatically every few seconds while it is open." />
          </div>
        </MonitoringPanel>
      </aside>
    </div>
  );
}

function CompactActivityItem({ event, timeZone }: { event: ActivityLog; timeZone: string }) {
  const Icon = eventIcon(event);
  return (
    <div className={cn('flex gap-3 rounded-lg border bg-slate-900/45 p-3 text-sm', eventTone(event))}>
      <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-slate-950/70">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate font-semibold text-white">{event.title}</p>
        <p className="mt-1 line-clamp-2 text-slate-300">{event.message}</p>
        <p className="mt-1 text-xs text-slate-500">{formatLocalizedDateTime(event.createdAt, timeZone)}</p>
      </div>
    </div>
  );
}

function HighlightedIssueCard({ issue }: { issue: AppReliabilityIssue | null }) {
  if (!issue) {
    return (
      <section className="rounded-xl border border-emerald-300/20 bg-emerald-500/10 p-5 text-emerald-100 shadow-xl shadow-slate-950/30">
        <div className="flex gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
          <div>
            <h2 className="font-black text-white">No highlighted issue</h2>
            <p className="mt-1 text-sm text-emerald-100/80">Autark-OS has not found an app issue that needs action right now.</p>
          </div>
        </div>
      </section>
    );
  }

  const remediation = buildAppRemediationFromIssue(issue);
  const destination = remediation?.safeAction.kind === 'link' ? remediation.safeAction.to : '/apps';
  return (
    <section className="rounded-xl border border-orange-400/45 bg-orange-500/10 p-5 text-orange-200 shadow-xl shadow-slate-950/30">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" />
        <div>
          <h2 className="font-black text-white">{remediation?.title || `Review ${issue.appName}`}</h2>
          <p className="mt-1 text-sm text-orange-100/80">{remediation?.summary || issue.message}</p>
          <p className="mt-2 text-xs text-orange-100/70">{remediation?.nextStep || issue.suggestedAction}</p>
          <ProjectDarkControlButton asChild className="mt-4 border-orange-300/30 text-orange-100" size="sm">
            <Link to={destination}>{remediation?.safeAction.label || 'Open Applications'} <ChevronRight className="size-4" /></Link>
          </ProjectDarkControlButton>
        </div>
      </div>
    </section>
  );
}

function MiniCount({ label, tone, value }: { label: string; tone: 'green' | 'orange' | 'red'; value: string }) {
  const tones = {
    orange: 'border-orange-400/45 bg-orange-500/10 text-orange-200',
    green: 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100',
    red: 'border-red-400/40 bg-red-500/10 text-red-200',
  };
  return (
    <div className={cn('rounded-lg border p-3', tones[tone])}>
      <p className="text-xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase text-current/70">{label}</p>
    </div>
  );
}

function FilterBar({ label, onChange, options, value }: { label: string; options: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 text-xs font-semibold text-slate-500">{label}</span>
      {options.map((option) => (
        <button
          className={cn(
            'rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70',
            value === option
              ? 'border-cyan-300/35 bg-cyan-400/10 text-cyan-100'
              : 'border-sky-400/25 bg-slate-800 text-slate-400 hover:border-cyan-300/45 hover:text-slate-200',
          )}
          key={option}
          onClick={() => onChange(option)}
          type="button"
        >
          {option.replace('_', ' ')}
        </button>
      ))}
    </div>
  );
}

function ActivityRow({ event, expanded, onToggle, showAdvancedMetrics, timeZone }: { event: ActivityLog; expanded: boolean; onToggle: () => void; showAdvancedMetrics: boolean; timeZone: string }) {
  const Icon = eventIcon(event);
  return (
    <article className={cn('rounded-lg border bg-slate-900/45 transition', eventTone(event))}>
      <button className="grid w-full gap-3 rounded-lg p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 sm:grid-cols-[auto_minmax(0,1fr)_130px_auto] sm:items-start" onClick={onToggle} type="button">
        <span className="grid size-10 place-items-center rounded-lg border border-sky-400/25 bg-slate-950/70">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-white">{event.title}</span>
            <Badge className={cn('border text-[11px] capitalize', badgeTone(event.level))}>{event.category}</Badge>
            {event.appId && <Badge className="border-slate-700 bg-slate-950 text-slate-300">{event.appId}</Badge>}
          </span>
          <span className="mt-1 block text-sm text-slate-300">{event.message}</span>
        </span>
        <span className="text-xs text-slate-500 sm:text-right">{formatLocalizedDateTime(event.createdAt, timeZone)}</span>
        <span className="text-slate-400">{expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</span>
      </button>
      {expanded && showAdvancedMetrics && (
        <div className="border-t border-white/10 px-4 py-3 text-sm">
          <div className="grid gap-3 md:grid-cols-3">
            <Detail label="Action" value={event.action} />
            <Detail label="Outcome" value={humanize(event.outcome)} />
            <Detail label="Level" value={humanize(event.level)} />
          </div>
          {event.details && (
            <pre className="mt-3 max-h-48 overflow-auto rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-xs text-slate-300">{event.details}</pre>
          )}
        </div>
      )}
    </article>
  );
}

function IssueCard({ issue }: { issue: AppReliabilityIssue }) {
  const remediation = buildAppRemediationFromIssue(issue);
  return (
    <div className="rounded-lg border border-orange-400/45 bg-orange-500/10 p-4 text-sm text-orange-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-white">{issue.appName}</p>
          <p className="mt-1">{remediation?.summary || issue.message}</p>
        </div>
        <Badge className="border-orange-400/45 bg-orange-500/10 text-orange-200">{issue.status}</Badge>
      </div>
      <p className="mt-3 text-xs text-orange-100/75">{remediation?.nextStep || issue.suggestedAction}</p>
      {issue.detail && remediation?.summary !== issue.detail && <p className="mt-2 text-xs text-orange-100/60">{issue.detail}</p>}
    </div>
  );
}

function GuideRow({ icon: Icon, text, title }: { icon: LucideIcon; text: string; title: string }) {
  return (
    <MonitoringInset className="flex gap-3">
      <Icon className="mt-0.5 size-4 text-cyan-200" />
      <div>
        <p className="font-bold text-white">{title}</p>
        <p className="mt-1 text-xs text-slate-400">{text}</p>
      </div>
    </MonitoringInset>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <MonitoringInset>
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 break-words text-slate-200">{value || 'None'}</p>
    </MonitoringInset>
  );
}

function eventIcon(event: ActivityLog) {
  if (event.level === 'error') {
    return AlertTriangle;
  }
  if (event.category === 'repair') {
    return Wrench;
  }
  if (event.category === 'health') {
    return HeartPulse;
  }
  if (event.level === 'success') {
    return CheckCircle2;
  }
  return Activity;
}

function eventTone(event: ActivityLog) {
  if (event.level === 'error' || event.outcome === 'failed') {
    return 'border-red-400/40 text-red-200';
  }
  if (event.level === 'warning' || event.outcome === 'needs_attention') {
    return 'border-orange-400/45 text-orange-200';
  }
  if (event.level === 'success') {
    return 'border-emerald-300/20 text-emerald-100';
  }
  return 'border-slate-800 text-slate-300';
}

function badgeTone(level: string) {
  if (level === 'error') {
    return 'border-red-400/40 bg-red-500/10 text-red-200';
  }
  if (level === 'warning') {
    return 'border-orange-400/45 bg-orange-500/10 text-orange-200';
  }
  if (level === 'success') {
    return 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100';
  }
  return 'border-slate-700 bg-slate-950 text-slate-300';
}
