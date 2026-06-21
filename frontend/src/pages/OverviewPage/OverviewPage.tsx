import { useEffect, useMemo, useState } from 'react';
import { Boxes, CheckCircle2, Clock3, Database, Link2, LockKeyhole, Monitor, ShieldCheck, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import { ActivityAPIClient } from '@/api/ActivityAPIClient';
import { ExternalServiceAPIClient } from '@/api/ExternalServiceAPIClient';
import { HostInventoryAPIClient } from '@/api/HostInventoryAPIClient';
import { InstalledAppsAPIClient } from '@/api/InstalledAppsAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { SystemAPIClient } from '@/api/SystemAPIClient';
import {
  ActivityTimeline,
  IssueBanner,
  MetricStoryCard,
  PageSection,
  PageShell,
  PrimaryActionCard,
  QuickAccessAppTile,
  SoftCard,
  StatusPill,
} from '@/components/project-os/ProjectOSComponents';
import { FoundResourcesBanner } from '@/components/project-os/FoundResourcesBanner';
import { Button } from '@/components/ui/button';
import overviewBackground from '@/assets/overviewBackground.png';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { cn } from '@/lib/utils';
import { homeMajorActivity } from './extensions/OverviewPage.activity';
import { shouldShowActivityLogLink } from './extensions/OverviewPage.activityLink';
import type { ActivityLog } from '@/types/activity';
import type { AppInstanceView } from '@/types/app';
import type { ExternalService, HostInventoryResource } from '@/types/host';
import type { RecommendedAction, SystemSummary } from '@/types/system';

type OverviewState = {
  activity: ActivityLog[];
  apps: AppInstanceView[];
  externalServices: ExternalService[];
  hostInventory: HostInventoryResource[];
  recommendedAction: RecommendedAction | null;
  summary: SystemSummary | null;
};

const initialState: OverviewState = {
  activity: [],
  apps: [],
  externalServices: [],
  hostInventory: [],
  recommendedAction: null,
  summary: null,
};

function OverviewPage() {
  const { viewMode } = useProjectSettings();
  const [state, setState] = useState<OverviewState>(initialState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      setLoading(true);
      const [summary, recommendedAction, apps, externalServices, activity, hostInventory] = await Promise.allSettled([
        SystemAPIClient.summary(),
        SystemAPIClient.recommendedAction(),
        InstalledAppsAPIClient.listAppInstances(),
        ExternalServiceAPIClient.list(),
        ActivityAPIClient.recent({ limit: 5 }),
        HostInventoryAPIClient.list(false),
      ]);

      if (cancelled) {
        return;
      }

      const rejected = [summary, recommendedAction, apps, externalServices, activity, hostInventory].find((result) => result.status === 'rejected');
      setError(rejected?.status === 'rejected' ? apiErrorMessage(rejected.reason, 'Home is missing some live data.') : null);
      setState({
        activity: valueOr(activity, []),
        apps: valueOr(apps, []),
        externalServices: valueOr(externalServices, []),
        hostInventory: valueOr(hostInventory, []),
        recommendedAction: valueOr(recommendedAction, null),
        summary: valueOr(summary, null),
      });
      setLoading(false);
    }

    loadOverview();
    const interval = window.setInterval(loadOverview, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const readyApps = useMemo(() => state.apps.filter((app) => app.userStatus === 'Ready'), [state.apps]);
  const majorActivity = useMemo(() => homeMajorActivity(state.activity, 5) as ActivityLog[], [state.activity]);
  const showActivityLogLink = shouldShowActivityLogLink(viewMode, majorActivity);
  const primaryAction = state.recommendedAction?.id === 'no-action-needed' ? null : state.recommendedAction;
  const deviceName = state.summary?.deviceName || 'Project OS';

  return (
    <PageShell maxWidth="max-w-7xl">
      <HomeHero
        deviceName={deviceName}
        linkedServices={state.externalServices.length}
        loading={loading}
        readyApps={readyApps.length}
        summary={state.summary}
      />

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:items-start">
        <div className="grid gap-5">
          {primaryAction ? (
            <PrimaryActionCard
              action={primaryAction.primaryAction}
              body={primaryAction.body}
              dismissible={primaryAction.dismissible}
              severity={primaryAction.severity}
              title={primaryAction.title}
            />
          ) : (
            <PrimaryActionCard
              action={{ id: 'open-discover', label: state.apps.length ? 'Discover apps' : 'Install your first app', route: '/discover', confirmationRequired: false, danger: false }}
              body={state.apps.length ? 'Project OS does not see anything urgent right now.' : 'Start with a verified app and Project OS will guide the setup.'}
              severity="success"
              title={state.apps.length ? 'Everything important looks good' : 'Start with Discover'}
            />
          )}

          <FoundResourcesBanner resources={state.hostInventory} />

          <PageSection
            action={<Button asChild variant="outline"><Link to="/apps">Manage apps</Link></Button>}
            description="These are the apps ready to open now."
            title="Your Apps"
          >
            {readyApps.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {readyApps.slice(0, 6).map((app) => (
                  <QuickAccessAppTile
                    actionLabel="Open"
                    description={app.category}
                    href={app.privateUrl || app.localUrl}
                    key={app.appInstanceId}
                    name={app.name}
                    status={accessLabel(app)}
                    statusTone={app.privateUrl ? 'success' : 'info'}
                  />
                ))}
              </div>
            ) : (
              <SoftCard>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="m-0 font-bold text-po-text">{state.apps.length ? 'No apps are ready to open yet' : 'No apps installed yet'}</p>
                    <p className="m-0 mt-1 text-sm text-po-text-muted">{state.apps.length ? 'Open My Apps to review setup or repair options.' : 'Discover verified starter apps to get going.'}</p>
                  </div>
                  <Button asChild>
                    <Link to={state.apps.length ? '/apps' : '/discover'}>{state.apps.length ? 'Review apps' : 'Open Discover'}</Link>
                  </Button>
                </div>
              </SoftCard>
            )}
          </PageSection>

          {state.externalServices.length > 0 && (
            <PageSection
              description="Links to services Project OS does not install or manage."
              title="Linked Services"
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {state.externalServices.slice(0, 6).map((service) => (
                  <QuickAccessAppTile
                    actionLabel="Open"
                    description={`${service.category} - ${service.accessScope}`}
                    href={service.url}
                    key={service.id}
                    name={service.name}
                    status="Linked"
                    statusTone="info"
                  />
                ))}
              </div>
            </PageSection>
          )}
        </div>

        <div className="grid gap-5">
          <PageSection title="System Status">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <MetricStoryCard detail={state.summary?.docker.summary || 'Checking Docker'} icon={Boxes} label="Docker" tone={state.summary?.docker.ready ? 'success' : 'warning'} value={state.summary?.docker.ready ? 'Ready' : 'Needs setup'} />
              <MetricStoryCard detail={state.externalServices.length ? `${state.externalServices.length} linked external service${state.externalServices.length === 1 ? '' : 's'}` : 'No external services linked'} icon={Link2} label="Linked" tone="info" value={state.externalServices.length ? 'Available' : 'None'} />
              <MetricStoryCard detail={state.summary?.access.summary || 'Checking access'} icon={LockKeyhole} label="Access" tone={state.summary?.access.mode === 'private_ready' ? 'success' : 'info'} value={accessModeLabel(state.summary?.access.mode)} />
              <MetricStoryCard detail={state.summary?.backups.summary || 'Checking backups'} icon={ShieldCheck} label="Backups" tone={state.summary?.backups.state === 'needs_restore_point' ? 'warning' : 'success'} value={backupStateLabel(state.summary?.backups.state)} />
              <MetricStoryCard detail={state.summary?.storage.summary || 'Checking storage'} icon={Database} label="Storage" tone="teal" value={state.summary?.storage.state || 'Checking'} />
            </div>
          </PageSection>

          {state.summary?.issues.length ? (
            <PageSection title="Needs Review">
              <div className="grid gap-2">
                {state.summary.issues.slice(0, 3).map((issue) => <IssueBanner issue={issue} key={issue.id} />)}
              </div>
            </PageSection>
          ) : null}

          <PageSection
            action={showActivityLogLink ? <Button asChild size="sm" variant="outline"><Link to="/activity">Activity Log</Link></Button> : null}
            title="Recent Activity"
          >
            <ActivityTimeline
              emptyText={loading ? 'Loading recent activity.' : 'No recent activity recorded.'}
              items={majorActivity.map((item) => ({
                id: item.id,
                title: item.title || item.message,
                detail: item.message,
                time: formatRelativeTime(item.createdAt),
                tone: item.level === 'error' ? 'danger' : item.level === 'warning' ? 'warning' : 'neutral',
                icon: item.level === 'error' ? Sparkles : CheckCircle2,
              }))}
            />
          </PageSection>
        </div>
      </section>

      {error && <IssueBanner issue={{ id: 'home-load-error', scope: 'system', subjectId: '', severity: 'warning', reasonCode: 'home_partial_load', title: 'Some Home data did not load', summary: error, secondaryActions: [], advancedDetails: {} }} />}
    </PageShell>
  );
}

function HomeHero({
  deviceName,
  linkedServices,
  loading,
  readyApps,
  summary,
}: {
  deviceName: string;
  linkedServices: number;
  loading: boolean;
  readyApps: number;
  summary: SystemSummary | null;
}) {
  const needsReview = Boolean(summary?.issues.length);
  const statusTone = loading ? 'info' : needsReview ? 'warning' : 'success';
  const readyStatus = loading ? 'Checking' : needsReview ? 'Needs review' : 'Ready';

  return (
    <header className="relative overflow-hidden rounded-po-lg border border-po-border-accent bg-po-bg shadow-po-brand-glow">
      <div className="relative min-h-[360px] overflow-hidden md:min-h-[430px]">
        <img alt="" className="absolute inset-x-0 top-0 h-full w-full object-cover object-center opacity-95" src={overviewBackground} />
        <div className="absolute inset-0 bg-po-overview-side-overlay" />
        <div className="absolute inset-0 bg-po-overview-vertical-overlay" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-po-overview-bottom-fade" />

        <div className="relative z-10 flex min-h-[360px] flex-col justify-between gap-7 p-5 md:min-h-[430px] md:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-2xl">
              <p className="m-0 text-xs font-black uppercase tracking-normal text-violet-200">Project OS</p>
              <h1 className="m-0 mt-3 text-4xl font-black leading-none text-white md:text-5xl">
                {timeGreeting()}, {shortName(deviceName)}.
              </h1>
              <p className="mt-4 max-w-xl text-lg font-semibold leading-7 text-slate-100">
                {homeHeroSubtitle(summary, loading)}
              </p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Open apps, handle the next setup step, and keep your home server calm.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 xl:justify-end">
              <StatusPill tone={statusTone}>{readyStatus}</StatusPill>
              {loading && (
                <span className="inline-flex items-center gap-2 rounded-po-full border border-white/10 bg-black/25 px-3 py-2 text-xs font-semibold text-slate-200 backdrop-blur-xl">
                  <Clock3 className="size-3.5" />
                  Updating
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-po-md border border-white/10 bg-slate-950/45 p-3 shadow-po-panel backdrop-blur-xl xl:grid-cols-4">
            <HomeHeroStat
              detail={summary?.docker.summary || 'Checking Docker'}
              icon={Boxes}
              label={summary?.docker.ready ? 'Ready' : 'Needs setup'}
              tone={summary?.docker.ready ? 'success' : 'warning'}
              value="Docker"
            />
            <HomeHeroStat
              detail={summary ? `${readyApps} ready to open` : 'Checking apps'}
              icon={Monitor}
              label={`${summary?.apps.running ?? 0} running`}
              tone={summary?.apps.needsAttention ? 'warning' : 'brand'}
              value="Apps"
            />
            <HomeHeroStat
              detail={summary?.access.summary || 'Checking access'}
              icon={LockKeyhole}
              label={accessModeLabel(summary?.access.mode)}
              tone={summary?.access.mode === 'private_ready' ? 'success' : 'info'}
              value="Access"
            />
            <HomeHeroStat
              detail={linkedServices ? `${linkedServices} linked service${linkedServices === 1 ? '' : 's'}` : backupStateLabel(summary?.backups.state)}
              icon={linkedServices ? Link2 : ShieldCheck}
              label={linkedServices ? 'Available' : backupStateLabel(summary?.backups.state)}
              tone={summary?.backups.state === 'needs_restore_point' ? 'warning' : linkedServices ? 'info' : 'success'}
              value={linkedServices ? 'Linked' : 'Backups'}
            />
          </div>
        </div>
      </div>
    </header>
  );
}

function HomeHeroStat({
  detail,
  icon: Icon,
  label,
  tone,
  value,
}: {
  detail: string;
  icon: LucideIcon;
  label: string;
  tone: 'brand' | 'success' | 'warning' | 'info';
  value: string;
}) {
  return (
    <div className="flex min-h-[82px] items-center gap-3 rounded-po-sm border border-white/10 bg-slate-950/45 p-3">
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-po-sm', homeHeroIconTone(tone))}>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold uppercase tracking-normal text-slate-400">{value}</span>
        <span className="mt-1 block truncate text-sm font-black text-white">{label}</span>
        <span className="mt-1 block truncate text-xs text-slate-400">{detail}</span>
      </span>
    </div>
  );
}

function homeHeroIconTone(tone: 'brand' | 'success' | 'warning' | 'info') {
  if (tone === 'success') return 'bg-po-success-soft text-emerald-200';
  if (tone === 'warning') return 'bg-po-warning-soft text-amber-200';
  if (tone === 'info') return 'bg-po-info-soft text-sky-200';
  return 'bg-po-brand-soft text-po-brand-strong';
}

function homeHeroSubtitle(summary: SystemSummary | null, loading: boolean) {
  if (loading && !summary) return 'Project OS is checking your home server.';
  if (summary?.issues.length) return 'Your server needs a quick look.';
  if (summary?.setup.complete === false) return summary.setup.summary || 'Finish setup to unlock the full Project OS experience.';
  return 'Your digital home is ready.';
}

function valueOr<T>(result: PromiseSettledResult<T>, fallback: T) {
  return result.status === 'fulfilled' ? result.value : fallback;
}

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function shortName(value: string) {
  return value.split(/[\s.-]+/).filter(Boolean)[0]?.replace(/^./, (first) => first.toUpperCase()) || 'there';
}

function accessLabel(app: AppInstanceView) {
  if (app.privateUrl) return 'Private link';
  if (app.localUrl) return 'Local link';
  return 'No link yet';
}

function accessModeLabel(mode?: string) {
  if (mode === 'private_ready') return 'Private ready';
  if (mode === 'private_needs_setup') return 'Needs setup';
  if (mode === 'mocked_dev') return 'Dev mock';
  return 'Local ready';
}

function backupStateLabel(state?: string) {
  if (state === 'needs_restore_point') return 'First backup needed';
  if (state === 'not_configured') return 'Not configured';
  return 'Ready';
}

function formatRelativeTime(value?: string | null) {
  if (!value) return 'Not yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  const absSeconds = Math.abs(seconds);
  if (absSeconds < 60) return seconds < 0 ? 'Soon' : 'Just now';
  const minutes = Math.round(absSeconds / 60);
  if (minutes < 60) return seconds < 0 ? `In ${minutes}m` : `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return seconds < 0 ? `In ${hours}h` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  return seconds < 0 ? `In ${days}d` : `${days}d ago`;
}

export default OverviewPage;
