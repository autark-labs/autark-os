import { useMemo } from 'react';
import { apiErrorMessage } from '@/api/httpClient';
import { HomeHero } from './components/HomeHero';
import { DashboardSummaryGrid, InstalledAppsLauncher } from './components/HomeDashboardPanels';
import { PageShell } from '@/components/layout/PageShell';
import { ExtensionActionTarget } from '@/extensions/ExtensionActionTarget';
import { useApplicationStateRepository } from '@/repositories/applicationStateRepository';
import { useSystemSummaryQuery } from '@/repositories/systemRepository';
import { homeSummaryAvailability, homeSystemMetrics } from './extensions/OverviewPage.systemStatus';

function OverviewPage() {
  const appState = useApplicationStateRepository();
  const summaryQuery = useSystemSummaryQuery();
  const summary = summaryQuery.data ?? null;
  const summaryError = summaryQuery.error ? apiErrorMessage(summaryQuery.error, 'Home status could not be loaded.') : null;

  const apps = useMemo(() => appState.applications.filter((application) => application.relationship === 'managed'), [appState.applications]);
  const deviceName = summary?.deviceName || 'Autark-OS';
  const summaryAvailability = homeSummaryAvailability(summary, summaryError);
  const systemMetrics = homeSystemMetrics(summary, summaryAvailability);

  return (
    <PageShell>
      <ExtensionActionTarget actionId="review-pro" routeId="home">
        <HomeHero
          deviceName={deviceName}
          refreshError={summaryError}
          onRefresh={() => void summaryQuery.refetch()}
          refreshing={summaryQuery.isFetching}
          summaryAvailability={summaryAvailability}
          summary={summary}
        >
          {appState.freshness.hasUsableData && <InstalledAppsLauncher apps={apps} />}
        </HomeHero>
      </ExtensionActionTarget>

      <DashboardSummaryGrid metrics={systemMetrics} />

    </PageShell>
  );
}

export default OverviewPage;
