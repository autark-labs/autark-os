import { useEffect, useMemo, useState } from 'react';
import { Boxes, CheckCircle2, Database, Link2, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
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
import { homeMajorActivity } from './extensions/OverviewPage.activity';
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
  const primaryAction = state.recommendedAction?.id === 'no-action-needed' ? null : state.recommendedAction;
  const deviceName = state.summary?.deviceName || 'Project OS';

  return (
    <PageShell maxWidth="max-w-7xl">
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:items-start">
        <div className="grid gap-5">
          <SoftCard className="overflow-hidden border-violet-300/20 bg-po-hero-overview shadow-po-brand-glow">
            <div className="flex min-h-[180px] flex-col justify-between gap-5 sm:flex-row sm:items-start">
              <div>
                <p className="m-0 text-sm font-bold uppercase tracking-normal text-violet-200">Project OS</p>
                <h1 className="m-0 mt-3 text-4xl font-black text-white md:text-5xl">{timeGreeting()}, {shortName(deviceName)}.</h1>
                <p className="mt-3 max-w-2xl text-lg font-semibold text-slate-100">
                  {state.summary?.issues.length ? 'Your server needs a quick look.' : 'Your server is ready.'}
                </p>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                  Open apps, handle the next setup step, and keep your home server calm.
                </p>
              </div>
              <StatusPill tone={state.summary?.issues.length ? 'warning' : 'success'}>
                {loading ? 'Checking' : state.summary?.issues.length ? 'Needs review' : 'Ready'}
              </StatusPill>
            </div>
          </SoftCard>

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
            action={<Button asChild size="sm" variant="outline"><Link to="/activity">Activity Log</Link></Button>}
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
