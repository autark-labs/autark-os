import { lazy, Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiErrorMessage } from '@/api/httpClient';
import { PageLoadError } from '@/components/autark-os/PageLoadError';
import { PageShell } from '@/components/layout/PageShell';
import { ProjectInlineEmptyState as EmptyState } from '@/components/primitives/EmptyState';
import { ProjectPanel } from '@/components/primitives/Surface';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { useApplicationStateRepository } from '@/repositories/applicationStateRepository';
import { useMonitoringDiagnosticsMutation, useMonitoringRepository } from '@/repositories/monitoringRepository';
import {
  buildAppTrendData,
  buildCategoryData,
  buildHostTrendData,
  buildLevelData,
  buildResourceData,
} from './extensions/MonitoringPage.viewModels';
import { MonitoringActivityWorkspace } from './MonitoringActivitySections';

const levelFilters = ['all', 'error', 'warning', 'success', 'info'];
const categoryFilters = ['all', 'pro', 'install', 'health', 'repair', 'access', 'backup', 'system', 'api'];
const MonitoringChartsSection = lazy(() => import('./MonitoringChartsSection'));

const MonitoringPanel = ProjectPanel;

function MonitoringPage() {
  const { settings, showAdvancedMetrics } = useProjectSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const timeZone = settings?.timeZone || 'UTC';
  const appState = useApplicationStateRepository();
  const [level, setLevel] = useState('all');
  const [category, setCategory] = useState(
    searchParams.get('category') === 'pro' ? 'pro' : 'all',
  );
  const [actionError, setActionError] = useState<string | null>(null);

  const filters = useMemo(() => ({
    level: level === 'all' ? undefined : level,
    category: category === 'all' ? undefined : category,
    limit: 120,
  }), [category, level]);
  const monitoring = useMonitoringRepository(filters);
  const diagnosticsMutation = useMonitoringDiagnosticsMutation();
  const error = actionError ?? (monitoring.error ? apiErrorMessage(monitoring.error, 'Monitoring data could not be loaded.') : null);

  function changeCategory(value: string) {
    setCategory(value);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value === 'all') next.delete('category');
      else next.set('category', value);
      return next;
    }, { replace: true });
  }

  async function exportDiagnostics() {
    setActionError(null);
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
    } catch (exportError) {
      setActionError(apiErrorMessage(exportError, 'Monitoring diagnostics could not be exported.'));
    }
  }

  const categoryData = useMemo(() => buildCategoryData(monitoring.activity), [monitoring.activity]);
  const levelData = useMemo(() => buildLevelData(monitoring.activity), [monitoring.activity]);
  const resourceData = useMemo(() => buildResourceData(appState.telemetryByAppId), [appState.telemetryByAppId]);
  const hostTrendData = useMemo(() => buildHostTrendData(monitoring.history?.hostSamples ?? []), [monitoring.history]);
  const appTrendData = useMemo(() => buildAppTrendData(monitoring.history?.appSamples ?? []), [monitoring.history]);

  return (
    <PageShell
      className="xl:h-[calc(100dvh-7.25rem)] xl:min-h-0"
      contained
      contentClassName="gap-3 xl:h-full xl:min-h-0 xl:!overflow-hidden"
    >
      {error && <MonitoringErrorState message={error} onRetry={() => void monitoring.refresh()} />}
      <MonitoringActivityWorkspace
        activity={monitoring.activity}
        advancedMetrics={showAdvancedMetrics ? (
          <Suspense fallback={<MonitoringChartsFallback />}>
            <MonitoringChartsSection
              appTrendData={appTrendData}
              categoryData={categoryData}
              compact
              history={monitoring.history}
              hostTrendData={hostTrendData}
              levelData={levelData}
              metrics={monitoring.metrics}
              reliability={monitoring.reliability}
              resourceData={resourceData}
            />
          </Suspense>
        ) : null}
        category={category}
        categoryFilters={categoryFilters}
        diagnosticsExporting={diagnosticsMutation.isPending}
        isLoading={monitoring.isLoading}
        level={level}
        levelFilters={levelFilters}
        metrics={monitoring.metrics}
        onCategoryChange={changeCategory}
        onExportDiagnostics={() => void exportDiagnostics()}
        onLevelChange={setLevel}
        onRefresh={() => void Promise.all([monitoring.refresh(), appState.refresh()])}
        refreshing={monitoring.isFetching || appState.isFetching}
        reliability={monitoring.reliability}
        showAdvancedMetrics={showAdvancedMetrics}
        timeZone={timeZone}
        updatedAt={appState.updatedAt ?? monitoring.updatedAt}
      />
    </PageShell>
  );
}

function MonitoringChartsFallback() {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
      <MonitoringPanel className="min-h-[420px]">
        <EmptyState title="Loading metrics" description="Autark-OS is preparing advanced charts." />
      </MonitoringPanel>
      <MonitoringPanel className="min-h-[420px]">
        <EmptyState title="Loading instrumentation" description="Autark-OS is preparing device readings." />
      </MonitoringPanel>
    </div>
  );
}

function MonitoringErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <PageLoadError className="shrink-0 px-4 py-3" model={{ message, title: 'Monitoring data could not refresh' }} onRetry={onRetry} />;
}

export default MonitoringPage;
