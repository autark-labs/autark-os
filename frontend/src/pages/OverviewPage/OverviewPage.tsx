import { useMemo } from 'react';
import { HomeHero } from './components/HomeHero';
import { DashboardSummaryGrid, InstalledAppsLauncher } from './components/HomeDashboardPanels';
import { PageShell } from '@/components/layout/PageShell';
import { useApplicationStateRepository } from '@/repositories/applicationStateRepository';
import { useHomeRepository } from '@/repositories/homeRepository';
import { homeSummaryAvailability, homeSystemMetrics } from './extensions/OverviewPage.systemStatus';

function OverviewPage() {
  const appState = useApplicationStateRepository();
  const home = useHomeRepository();

  const apps = useMemo(() => appState.applicationState?.managedApps ?? [], [appState.applicationState]);
  const readyApps = useMemo(() => apps.filter((app) => app.userStatus === 'Ready'), [apps]);
  const pinnedServices = appState.pinnedExternalServices;
  const observedNeedingReview = appState.foundServices;
  const deviceName = home.summary?.deviceName || 'Autark-OS';
  const summaryAvailability = homeSummaryAvailability(home.summary, home.summaryError);
  const systemMetrics = homeSystemMetrics(home.summary, summaryAvailability);

  return (
    <PageShell>
      <HomeHero
        deviceName={deviceName}
        summaryAvailability={summaryAvailability}
        summary={home.summary}
      >
        {appState.freshness.hasUsableData && <InstalledAppsLauncher apps={readyApps} />}
      </HomeHero>

      <DashboardSummaryGrid
        metrics={systemMetrics}
        observedCount={observedNeedingReview.length}
        pinnedCount={pinnedServices.length}
      />

      {home.error && (
        <div className="rounded-lg border border-amber-300/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-100/80" role="status">
          Some live Home information is unavailable: {home.error}
        </div>
      )}
    </PageShell>
  );
}

export default OverviewPage;
