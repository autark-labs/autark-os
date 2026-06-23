import { useMemo } from 'react';
import { AlertTriangle, Boxes, CheckCircle2, Clock3, Database, Pin, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

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
import { Button } from '@/components/ui/button';
import overviewBackground from '@/assets/overviewBackground.png';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { cn } from '@/lib/utils';
import { useApplicationStateRepository } from '@/repositories/applicationStateRepository';
import { useHomeRepository } from '@/repositories/homeRepository';
import { managedAppIconUrl, observedServiceIconUrl } from './extensions/OverviewPage.appTiles';
import { homeMajorActivity } from './extensions/OverviewPage.activity';
import { shouldShowActivityLogLink } from './extensions/OverviewPage.activityLink';
import type { ActivityLog } from '@/types/activity';
import type { AppInstanceView } from '@/types/app';
import type { SystemSummary } from '@/types/system';

function OverviewPage() {
  const { viewMode } = useProjectSettings();
  const appState = useApplicationStateRepository();
  const home = useHomeRepository();

  const apps = appState.applicationState?.managedApps ?? [];
  const observedServices = appState.observedServices;
  const readyApps = useMemo(() => apps.filter((app) => app.userStatus === 'Ready'), [apps]);
  const pinnedServices = useMemo(() => observedServices.filter((service) => service.userStatus === 'pinned_external'), [observedServices]);
  const observedNeedingReview = useMemo(() => observedServices.filter((service) => !service.managedByThisProjectOs && service.userStatus !== 'pinned_external'), [observedServices]);
  const majorActivity = useMemo(() => homeMajorActivity(home.activity, 5) as ActivityLog[], [home.activity]);
  const showActivityLogLink = shouldShowActivityLogLink(viewMode, majorActivity);
  const primaryAction = home.recommendedAction?.id === 'no-action-needed' ? null : home.recommendedAction;
  const deviceName = home.summary?.deviceName || 'Project OS';
  const pageLoading = home.isLoading || appState.isLoading;

  return (
    <PageShell maxWidth="max-w-[90%]">
      <HomeHero
        deviceName={deviceName}
        loading={pageLoading}
        pinnedServices={pinnedServices.length}
        readyApps={readyApps.length}
        summary={home.summary}
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
              action={{ id: 'open-discover', label: apps.length ? 'Discover apps' : 'Install your first app', route: '/discover', confirmationRequired: false, danger: false }}
              body={apps.length ? 'Project OS does not see anything urgent right now.' : 'Start with a verified app and Project OS will guide the setup.'}
              severity="success"
              title={apps.length ? 'Everything important looks good' : 'Start with Discover'}
            />
          )}

          {observedNeedingReview.length > 0 && (
            <SoftCard className="border-amber-300/25 bg-amber-500/10">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 gap-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-po-sm bg-amber-500/15 text-amber-200">
                    <AlertTriangle className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="m-0 text-sm font-bold text-white">Services found on this server</p>
                    <p className="m-0 mt-1 text-sm leading-5 text-amber-100/80">
                      Project OS found {observedNeedingReview.length} service{observedNeedingReview.length === 1 ? '' : 's'} that need review before they are treated as managed apps.
                    </p>
                  </div>
                </div>
                <Button asChild className="shrink-0" size="sm" variant="outline">
                  <Link to="/apps/found">Review</Link>
                </Button>
              </div>
            </SoftCard>
          )}

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
                    iconUrl={managedAppIconUrl(app)}
                    key={app.appInstanceId}
                    name={app.name}
                    secondaryActionLabel="Manage"
                    secondaryTo="/apps"
                    status={accessLabel(app)}
                    statusTone="info"
                  />
                ))}
              </div>
            ) : (
              <SoftCard>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="m-0 font-bold text-po-text">{apps.length ? 'No apps are ready to open yet' : 'No apps installed yet'}</p>
                    <p className="m-0 mt-1 text-sm text-po-text-muted">{apps.length ? 'Open My Apps to review setup or repair options.' : 'Discover verified starter apps to get going.'}</p>
                  </div>
                  <Button asChild>
                    <Link to={apps.length ? '/apps' : '/discover'}>{apps.length ? 'Review apps' : 'Open Discover'}</Link>
                  </Button>
                </div>
              </SoftCard>
            )}
          </PageSection>

          {pinnedServices.length > 0 && (
            <PageSection
              description="Pinned services Project OS can open or check but does not own."
              title="Pinned External Services"
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {pinnedServices.slice(0, 6).map((service) => (
                  <QuickAccessAppTile
                    actionLabel="Open"
                    description={`${service.category} - ${service.accessScope}`}
                    href={service.url || undefined}
                    iconUrl={observedServiceIconUrl(service)}
                    key={service.id}
                    name={service.displayName}
                    secondaryActionLabel="Review"
                    secondaryTo="/apps/found"
                    status="Pinned"
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
              <MetricStoryCard detail={home.summary?.docker.summary || 'Checking Docker'} icon={Boxes} label="Docker" tone={home.summary?.docker.ready ? 'success' : 'warning'} value={home.summary?.docker.ready ? 'Ready' : 'Needs setup'} />
              <MetricStoryCard detail={observedNeedingReview.length ? `${observedNeedingReview.length} observed service${observedNeedingReview.length === 1 ? '' : 's'} to review` : `${pinnedServices.length} pinned external service${pinnedServices.length === 1 ? '' : 's'}`} icon={Pin} label="Pinned" tone="info" value={pinnedServices.length ? 'Available' : 'None'} />
              <MetricStoryCard detail={home.summary?.access.summary || 'Checking access'} icon={LockKeyhole} label="Access" tone={home.summary?.access.mode === 'private_ready' ? 'success' : 'info'} value={accessModeLabel(home.summary?.access.mode)} />
              <MetricStoryCard detail={home.summary?.backups.summary || 'Checking backups'} icon={ShieldCheck} label="Backups" tone={home.summary?.backups.state === 'needs_restore_point' ? 'warning' : 'success'} value={backupStateLabel(home.summary?.backups.state)} />
              <MetricStoryCard detail={home.summary?.storage.summary || 'Checking storage'} icon={Database} label="Storage" tone="teal" value={home.summary?.storage.state || 'Checking'} />
            </div>
          </PageSection>

          {home.summary?.issues.length ? (
            <PageSection title="Needs Review">
              <div className="grid gap-2">
                {home.summary.issues.slice(0, 3).map((issue) => <IssueBanner issue={issue} key={issue.id} />)}
              </div>
            </PageSection>
          ) : null}

          <PageSection
            action={showActivityLogLink ? <Button asChild size="sm" variant="outline"><Link to="/activity">Activity Log</Link></Button> : null}
            title="Recent Activity"
          >
            <ActivityTimeline
              emptyText={home.isLoading ? 'Loading recent activity.' : 'No recent activity recorded.'}
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

      {home.error && <IssueBanner issue={{ id: 'home-load-error', scope: 'system', subjectId: '', severity: 'warning', reasonCode: 'home_partial_load', title: 'Some Home data did not load', summary: home.error, secondaryActions: [], advancedDetails: {} }} />}
    </PageShell>
  );
}

function HomeHero({
  deviceName,
  loading,
  pinnedServices,
  readyApps,
  summary,
}: {
  deviceName: string;
  loading: boolean;
  pinnedServices: number;
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
