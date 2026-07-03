import { useMemo } from 'react';
import { AlertTriangle, Boxes, CheckCircle2, Database, Pin, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

import {
  HomeActionCard,
  HomeActivityTimeline,
  HomeIssueBanner,
  HomeMetricCard,
  HomeQuickAccessTile,
  HomeSection,
  HomeSoftCard,
} from './components/HomeCards';
import { HomeHero } from './components/HomeHero';
import { PageShell } from '@/components/layout/PageShell';
import { ProjectDarkControlButton, ProjectPrimaryButton, ProjectWarningButton } from '@/components/primitives/ProjectButtons';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { useApplicationStateRepository } from '@/repositories/applicationStateRepository';
import { useHomeRepository } from '@/repositories/homeRepository';
import { managedAppIconUrl, observedServiceIconUrl } from './extensions/OverviewPage.appTiles';
import { homeMajorActivity } from './extensions/OverviewPage.activity';
import { shouldShowActivityLogLink } from './extensions/OverviewPage.activityLink';
import type { ActivityLog } from '@/types/activity';
import type { AppInstanceView } from '@/types/app';

function OverviewPage() {
  const { viewMode } = useProjectSettings();
  const appState = useApplicationStateRepository();
  const home = useHomeRepository();

  const apps = appState.applicationState?.managedApps ?? [];
  const observedServices = appState.observedServices;
  const readyApps = useMemo(() => apps.filter((app) => app.userStatus === 'Ready'), [apps]);
  const pinnedServices = useMemo(() => observedServices.filter((service) => service.userStatus === 'pinned_external'), [observedServices]);
  const observedNeedingReview = useMemo(() => observedServices.filter((service) => !service.managedByThisAutarkOs && service.userStatus !== 'pinned_external'), [observedServices]);
  const majorActivity = useMemo(() => homeMajorActivity(home.activity, 5) as ActivityLog[], [home.activity]);
  const showActivityLogLink = shouldShowActivityLogLink(viewMode, majorActivity);
  const primaryAction = home.recommendedAction?.id === 'no-action-needed' ? null : home.recommendedAction;
  const deviceName = home.summary?.deviceName || 'Autark-OS';
  const pageLoading = home.isLoading || appState.isLoading;

  return (
    <PageShell>
      <HomeHero
        deviceName={deviceName}
        loading={pageLoading}
        summary={home.summary}
      />

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:items-start">
        <div className="grid gap-5">
          {primaryAction ? (
            <HomeActionCard
              action={primaryAction.primaryAction}
              body={primaryAction.body}
              dismissible={primaryAction.dismissible}
              severity={primaryAction.severity}
              title={primaryAction.title}
            />
          ) : (
            <HomeActionCard
              action={{ id: 'open-discover', label: apps.length ? 'Discover apps' : 'Install your first app', route: '/discover', confirmationRequired: false, danger: false }}
              body={apps.length ? 'Autark-OS does not see anything urgent right now.' : 'Start with a verified app and Autark-OS will guide the setup.'}
              severity="success"
              title={apps.length ? 'Everything important looks good' : 'Start with Discover'}
            />
          )}

          {observedNeedingReview.length > 0 && (
            <HomeSoftCard className="border-orange-400/45 bg-slate-800">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 gap-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-orange-400/30 bg-orange-500/10 text-orange-200">
                    <AlertTriangle className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="m-0 text-sm font-bold text-slate-50">Services found on this server</p>
                    <p className="m-0 mt-1 text-sm leading-5 text-sky-100/70">
                      Autark-OS found {observedNeedingReview.length} service{observedNeedingReview.length === 1 ? '' : 's'} that need review before they are treated as managed apps.
                    </p>
                  </div>
                </div>
                <ProjectWarningButton asChild className="shrink-0" size="sm">
                  <Link to="/apps/found">Review</Link>
                </ProjectWarningButton>
              </div>
            </HomeSoftCard>
          )}

          <HomeSection
            action={<ProjectDarkControlButton asChild><Link to="/apps">Manage apps</Link></ProjectDarkControlButton>}
            description="These are the apps ready to open now."
            title="Your Apps"
          >
            {readyApps.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {readyApps.slice(0, 6).map((app) => (
                  <HomeQuickAccessTile
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
              <HomeSoftCard>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="m-0 font-bold text-slate-50">{apps.length ? 'No apps are ready to open yet' : 'No apps installed yet'}</p>
                    <p className="m-0 mt-1 text-sm text-sky-100/65">{apps.length ? 'Open My Apps to review setup or repair options.' : 'Discover verified starter apps to get going.'}</p>
                  </div>
                  <ProjectPrimaryButton asChild>
                    <Link to={apps.length ? '/apps' : '/discover'}>{apps.length ? 'Review apps' : 'Open Discover'}</Link>
                  </ProjectPrimaryButton>
                </div>
              </HomeSoftCard>
            )}
          </HomeSection>

          {pinnedServices.length > 0 && (
            <HomeSection
              description="Pinned services Autark-OS can open or check but does not own."
              title="Pinned External Services"
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {pinnedServices.slice(0, 6).map((service) => (
                  <HomeQuickAccessTile
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
            </HomeSection>
          )}
        </div>

        <div className="grid gap-5">
          <HomeSection title="System Status">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <HomeMetricCard detail={home.summary?.docker.summary || 'Checking Docker'} icon={Boxes} label="Docker" tone={home.summary?.docker.ready ? 'success' : 'warning'} value={home.summary?.docker.ready ? 'Ready' : 'Needs setup'} />
              <HomeMetricCard detail={observedNeedingReview.length ? `${observedNeedingReview.length} observed service${observedNeedingReview.length === 1 ? '' : 's'} to review` : `${pinnedServices.length} pinned external service${pinnedServices.length === 1 ? '' : 's'}`} icon={Pin} label="Pinned" tone="info" value={pinnedServices.length ? 'Available' : 'None'} />
              <HomeMetricCard detail={home.summary?.access.summary || 'Checking access'} icon={LockKeyhole} label="Access" tone={home.summary?.access.mode === 'private_ready' ? 'success' : 'info'} value={accessModeLabel(home.summary?.access.mode)} />
              <HomeMetricCard detail={home.summary?.backups.summary || 'Checking backups'} icon={ShieldCheck} label="Backups" tone={home.summary?.backups.state === 'needs_restore_point' ? 'warning' : 'success'} value={backupStateLabel(home.summary?.backups.state)} />
              <HomeMetricCard detail={home.summary?.storage.summary || 'Checking storage'} icon={Database} label="Storage" tone="teal" value={home.summary?.storage.state || 'Checking'} />
            </div>
          </HomeSection>

          {home.summary?.issues.length ? (
            <HomeSection title="Needs Review">
              <div className="grid gap-2">
                {home.summary.issues.slice(0, 3).map((issue) => <HomeIssueBanner issue={issue} key={issue.id} />)}
              </div>
            </HomeSection>
          ) : null}

          <HomeSection
            action={showActivityLogLink ? <ProjectDarkControlButton asChild size="sm"><Link to="/activity">Activity Log</Link></ProjectDarkControlButton> : null}
            title="Recent Activity"
          >
            <HomeActivityTimeline
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
          </HomeSection>
        </div>
      </section>

      {home.error && <HomeIssueBanner issue={{ id: 'home-load-error', scope: 'system', subjectId: '', severity: 'warning', reasonCode: 'home_partial_load', title: 'Some Home data did not load', summary: home.error, secondaryActions: [], advancedDetails: {} }} />}
    </PageShell>
  );
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
  return 'Protected by restore point';
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
