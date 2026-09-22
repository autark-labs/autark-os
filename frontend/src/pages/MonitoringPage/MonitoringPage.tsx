import { lazy, Suspense, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { showActionErrorNotification, showActionNotification } from '@/lib/actionNotifications';
import { apiErrorMessage } from '@/api/httpClient';
import { PageLoadError } from '@/components/autark-os/PageLoadError';
import { RefreshStatus } from '@/components/RefreshStatus';
import { PageShell } from '@/components/layout/PageShell';
import { ExtensionActionTarget } from '@/extensions/ExtensionActionTarget';
import { ProjectInlineEmptyState as EmptyState } from '@/components/primitives/EmptyState';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { useApplicationStateRepository } from '@/repositories/applicationStateRepository';
import { useMonitoringDiagnosticsMutation, useMonitoringMetricsRepository, useMonitoringRepository } from '@/repositories/monitoringRepository';
import type { ActivityLog } from '@/types/activity';
import type { AppReliabilitySummary } from '@/types/app';
import { buildAppTrendData, buildCategoryData, buildHostTrendData, buildLevelData, buildResourceData } from './extensions/MonitoringPage.viewModels';
import { MonitoringActivityWorkspace } from './MonitoringActivitySections';

const levelFilters = ['all', 'error', 'warning', 'success', 'info'];
const categoryFilters = ['all', 'app-related', 'install', 'backup', 'repair', 'access', 'health', 'system', 'api', 'pro'];
const MonitoringChartsSection = lazy(() => import('./MonitoringChartsSection'));

function MonitoringPage() {
  const { settings } = useProjectSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [level, setLevel] = useState('all');
  const category = categoryFilters.find(value => value === searchParams.get('category')) ?? 'all';
  const monitoring = useMonitoringRepository({
    level: level === 'all' ? undefined : level,
    category: category === 'all' || category === 'app-related' ? undefined : category,
    limit: 120,
  });
  const diagnosticsMutation = useMonitoringDiagnosticsMutation();
  const { activityQuery, reliabilityQuery } = monitoring;
  const activity = (activityQuery.data ?? []).filter(event => category !== 'app-related' || Boolean(event.appId));

  function changeCategory(value: string) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value === 'all') next.delete('category');
      else next.set('category', value);
      return next;
    }, { replace: true });
  }

  async function exportDiagnostics() {
    try {
      const diagnostics = await diagnosticsMutation.mutateAsync(60);
      const blob = new Blob([JSON.stringify(diagnostics, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `autark-os-monitoring-${new Date().toISOString().replaceAll(':', '-')}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showActionNotification({ ok: true, severity: 'success', title: 'Diagnostics exported' });
    } catch (exportError) {
      showActionErrorNotification(exportError, 'Monitoring diagnostics could not be exported');
    }
  }

  return (
    <PageShell className="xl:h-[calc(100dvh-7.25rem)] xl:min-h-0" contained contentClassName="gap-3 xl:h-full xl:min-h-0 xl:!overflow-hidden">
      <ExtensionActionTarget actionId="review-activity" className="min-h-0 flex-1" routeId="activity">
        <MonitoringActivityWorkspace
          activity={activity}
          monitoring={monitoring}
          advancedMetrics={<MonitoringMetrics activity={activityQuery.data ? activity : null} reliability={reliabilityQuery.error ? null : reliabilityQuery.data ?? null} />}
          category={category}
          categoryFilters={categoryFilters}
          diagnosticsExporting={diagnosticsMutation.isPending}
          level={level}
          levelFilters={levelFilters}
          onCategoryChange={changeCategory}
          onExportDiagnostics={() => void exportDiagnostics()}
          onLevelChange={setLevel}
          timeZone={settings?.timeZone || 'UTC'}
        />
      </ExtensionActionTarget>
    </PageShell>
  );
}

function MonitoringMetrics({ activity, reliability }: { activity: ActivityLog[] | null; reliability: AppReliabilitySummary | null }) {
  const { metricsQuery, historyQuery } = useMonitoringMetricsRepository();
  const appState = useApplicationStateRepository();
  const error = metricsQuery.error || historyQuery.error;
  const refresh = () => { void Promise.all([metricsQuery.refetch(), historyQuery.refetch(), appState.refresh()]).catch(() => {}); };
  const updatedAt = Math.min(metricsQuery.dataUpdatedAt, historyQuery.dataUpdatedAt);
  if (error && (!metricsQuery.data || !historyQuery.data)) {
    return <PageLoadError model={{ title: 'System metrics are unavailable', message: apiErrorMessage(error, 'Metrics could not be loaded. History is still available.') }} onRetry={refresh} />;
  }
  if (!metricsQuery.data || !historyQuery.data) {
    return <EmptyState title="Loading metrics" description="Autark-OS is checking device readings and recent samples." />;
  }
  return <div className="space-y-3">
    <RefreshStatus error={error ? apiErrorMessage(error, 'Metrics could not refresh.') : null} onRefresh={refresh} refreshing={metricsQuery.isFetching || historyQuery.isFetching} updatedAt={updatedAt ? new Date(updatedAt) : null} />
    <Suspense fallback={<EmptyState title="Loading charts" description="Preparing the metrics view." />}>
      <MonitoringChartsSection
        appTrendData={buildAppTrendData(historyQuery.data.appSamples)}
        categoryData={activity ? buildCategoryData(activity) : null}
        compact
        history={historyQuery.data}
        hostTrendData={buildHostTrendData(historyQuery.data.hostSamples)}
        levelData={activity ? buildLevelData(activity) : null}
        metrics={metricsQuery.data}
        reliability={reliability}
        resourceData={buildResourceData(appState.telemetryByAppId)}
      />
    </Suspense>
  </div>;
}

export default MonitoringPage;
