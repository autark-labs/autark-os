import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { RefreshStatus } from '@/components/RefreshStatus';
import { PageErrorState, PageLoadingState } from '@/components/project-os/PageState';
import { PageShell } from '@/components/project-os/ProjectOSComponents';
import { Button } from '@/components/ui/button';
import { InstalledAppsAPIClient } from '@/api/InstalledAppsAPIClient';
import { NetworkAPIClient } from '@/api/NetworkAPIClient';
import type { AppAccessCheck, AppActionResult, AppHealthSnapshot, AppInstanceView, AppRuntimeView, AppTelemetry, AppUpdateResult, AppUpdateStatus, InstallSettings } from '@/types/app';
import type { PrivateAccessReconciliationReport } from '@/types/network';
import { ApplicationsDashboard, EmptyState } from './ApplicationsDashboard';
import { ManageAppDialog } from './ApplicationsPageModal';
import {
  appNeedsAttention,
  appPriority,
  displayStatus,
  errorMessage,
} from './extensions/ApplicationsPage.logic';
import type { AppAction } from './extensions/ApplicationsPage.types';

function ApplicationsPage() {
  const [apps, setApps] = useState<AppRuntimeView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [actionLoading, setActionLoading] = useState<AppAction | 'uninstall' | 'update' | 'rollback' | null>(null);
  const [manageAppId, setManageAppId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [telemetryByAppId, setTelemetryByAppId] = useState<Record<string, AppTelemetry>>({});
  const [accessByAppId, setAccessByAppId] = useState<Record<string, AppAccessCheck>>({});
  const [healthByAppId, setHealthByAppId] = useState<Record<string, AppHealthSnapshot>>({});
  const [updates, setUpdates] = useState<AppUpdateStatus[]>([]);
  const [reconciliation, setReconciliation] = useState<PrivateAccessReconciliationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<AppActionResult | null>(null);
  const [updateResult, setUpdateResult] = useState<AppUpdateResult | null>(null);
  const refreshInFlight = useRef(false);
  const telemetryRefreshInFlight = useRef(false);
  const accessRefreshInFlight = useRef(false);
  const healthRefreshInFlight = useRef(false);
  const reconciliationRefreshInFlight = useRef(false);
  const updatesRefreshInFlight = useRef(false);

  const managedApp = useMemo(() => apps.find((app) => app.appId === manageAppId) || null, [apps, manageAppId]);
  const managedAppReconciliation = useMemo(() => reconciliation?.apps.find((item) => item.appId === manageAppId) || null, [manageAppId, reconciliation?.apps]);
  const visibleApps = useMemo(() => apps.filter((app) => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return true;
    }
    return [app.appName, app.category, app.description, app.friendlyStatus].some((value) => value?.toLowerCase().includes(query));
  }).sort((left, right) => appPriority(left, telemetryByAppId[left.appId], accessByAppId[left.appId], healthByAppId[left.appId] || left.healthSnapshot) - appPriority(right, telemetryByAppId[right.appId], accessByAppId[right.appId], healthByAppId[right.appId] || right.healthSnapshot) || left.appName.localeCompare(right.appName)), [accessByAppId, apps, healthByAppId, search, telemetryByAppId]);
  const appSummary = useMemo(() => ({
    installed: apps.length,
    running: apps.filter((app) => displayStatus(app, healthByAppId[app.appId] || app.healthSnapshot) === 'Ready').length,
    stopped: apps.filter((app) => displayStatus(app, healthByAppId[app.appId] || app.healthSnapshot) === 'Paused').length,
    unhealthy: apps.filter((app) => appNeedsAttention(app, telemetryByAppId[app.appId], accessByAppId[app.appId], healthByAppId[app.appId] || app.healthSnapshot)).length,
  }), [accessByAppId, apps, healthByAppId, telemetryByAppId]);
  const updatesByAppId = useMemo(() => Object.fromEntries(updates.map((update) => [update.appId, update])), [updates]);

  const loadApps = useCallback(async ({ background = false, showRefreshing = false }: { background?: boolean; showRefreshing?: boolean } = {}) => {
    if (refreshInFlight.current) {
      return;
    }
    refreshInFlight.current = true;
    if (showRefreshing) {
      setRefreshing(true);
    }
    if (!background) {
      setLoading(true);
      setError(null);
    }
    try {
      const data = await InstalledAppsAPIClient.listAppInstances();
      setApps(data.map(appInstanceToRuntimeView));
      setUpdatedAt(new Date());
      setSelectedId((current) => current && !data.some((app) => app.catalogAppId === current) ? null : current);
    } catch (err) {
      if (!background) {
        setError(errorMessage(err));
      } else {
        console.warn('Unable to refresh installed applications.', err);
      }
    } finally {
      refreshInFlight.current = false;
      if (showRefreshing) {
        setRefreshing(false);
      }
      if (!background) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadApps();
    const interval = window.setInterval(() => {
      loadApps({ background: true });
    }, 1500);
    return () => window.clearInterval(interval);
  }, [loadApps]);

  const loadTelemetry = useCallback(async () => {
    if (telemetryRefreshInFlight.current) {
      return;
    }
    telemetryRefreshInFlight.current = true;
    try {
      const data = await InstalledAppsAPIClient.telemetry();
      setTelemetryByAppId(data);
    } catch (err) {
      console.warn('Unable to refresh app telemetry.', err);
    } finally {
      telemetryRefreshInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    loadTelemetry();
    const interval = window.setInterval(loadTelemetry, 1500);
    return () => window.clearInterval(interval);
  }, [loadTelemetry]);

  const loadAccessChecks = useCallback(async () => {
    if (accessRefreshInFlight.current) {
      return;
    }
    accessRefreshInFlight.current = true;
    try {
      const data = await InstalledAppsAPIClient.accessChecks();
      setAccessByAppId(data);
    } catch (err) {
      console.warn('Unable to refresh app link checks.', err);
    } finally {
      accessRefreshInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    loadAccessChecks();
    const interval = window.setInterval(loadAccessChecks, 5000);
    return () => window.clearInterval(interval);
  }, [loadAccessChecks]);

  const loadHealthSnapshots = useCallback(async () => {
    if (healthRefreshInFlight.current) {
      return;
    }
    healthRefreshInFlight.current = true;
    try {
      const data = await InstalledAppsAPIClient.healthSnapshots();
      setHealthByAppId(data);
    } catch (err) {
      console.warn('Unable to refresh app health snapshots.', err);
    } finally {
      healthRefreshInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    loadHealthSnapshots();
    const interval = window.setInterval(loadHealthSnapshots, 5000);
    return () => window.clearInterval(interval);
  }, [loadHealthSnapshots]);

  const loadReconciliation = useCallback(async () => {
    if (reconciliationRefreshInFlight.current) {
      return;
    }
    reconciliationRefreshInFlight.current = true;
    try {
      const data = await NetworkAPIClient.privateAccessReconciliation();
      setReconciliation(data);
    } catch (err) {
      console.warn('Unable to refresh private access reconciliation.', err);
    } finally {
      reconciliationRefreshInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    loadReconciliation();
    const interval = window.setInterval(loadReconciliation, 5000);
    return () => window.clearInterval(interval);
  }, [loadReconciliation]);

  const loadUpdates = useCallback(async () => {
    if (updatesRefreshInFlight.current) {
      return;
    }
    updatesRefreshInFlight.current = true;
    try {
      setUpdates(await InstalledAppsAPIClient.updates());
    } catch (err) {
      console.warn('Unable to refresh app updates.', err);
    } finally {
      updatesRefreshInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    loadUpdates();
    const interval = window.setInterval(loadUpdates, 30000);
    return () => window.clearInterval(interval);
  }, [loadUpdates]);

  async function runAction(appId: string, action: AppAction) {
    setActionLoading(action);
    setError(null);
    setActionResult(null);
    setUpdateResult(null);
    try {
      const data = await InstalledAppsAPIClient.runAction(appId, action);
      setActionResult(data);
      await Promise.all([
        loadApps({ background: true }),
        loadAccessChecks(),
        loadHealthSnapshots(),
        loadReconciliation(),
      ]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function uninstall(appId: string) {
    setActionLoading('uninstall');
    setError(null);
    setActionResult(null);
    setUpdateResult(null);
    try {
      const data = await InstalledAppsAPIClient.uninstall(appId);
      setActionResult(data);
      await loadApps({ background: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function updateApp(appId: string) {
    setActionLoading('update');
    setError(null);
    setActionResult(null);
    setUpdateResult(null);
    try {
      const data = await InstalledAppsAPIClient.updateApp(appId);
      setUpdateResult(data);
      await Promise.all([loadApps({ background: true }), loadHealthSnapshots(), loadUpdates()]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function rollbackApp(appId: string) {
    setActionLoading('rollback');
    setError(null);
    setActionResult(null);
    setUpdateResult(null);
    try {
      const data = await InstalledAppsAPIClient.rollbackApp(appId);
      setUpdateResult(data);
      await Promise.all([loadApps({ background: true }), loadHealthSnapshots(), loadUpdates()]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function saveSettings(appId: string, settings: InstallSettings) {
    setError(null);
    const data = await InstalledAppsAPIClient.updateSettings(appId, settings);
    setApps((current) => current.map((app) => app.appId === appId ? data : app));
    setActionResult({ message: data.appName + ' settings were saved.' });
    return data;
  }

  return (
    <PageShell>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold leading-none text-white md:text-3xl">My Apps</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">Open apps, review issues, and manage safe repair actions from one place.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RefreshStatus intervalLabel="Auto-updates every 2s" onRefresh={() => loadApps({ background: apps.length > 0, showRefreshing: true })} refreshing={refreshing} updatedAt={updatedAt} />
          <Button asChild className="bg-gradient-to-br from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500">
            <Link to="/discover">Add app</Link>
          </Button>
        </div>
      </div>

      {error && <PageErrorState message={error} onRetry={() => loadApps({ background: apps.length > 0, showRefreshing: true })} />}

      {actionResult && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          <CheckCircle2 className="size-4" />
          {actionResult.message}
        </div>
      )}

      {updateResult && (
        <div className="flex items-center gap-3 rounded-lg border border-sky-400/25 bg-sky-500/10 p-4 text-sm text-sky-100">
          <CheckCircle2 className="size-4" />
          {updateResult.message}
        </div>
      )}

      {loading ? (
        <PageLoadingState label="Loading your apps" sublabel="Checking installed apps, health, private access, and available actions." />
      ) : apps.length === 0 ? (
        <EmptyState />
      ) : (
        <ApplicationsDashboard
          accessByAppId={accessByAppId}
          actionLoading={actionLoading}
          apps={visibleApps}
          onAction={runAction}
          onManage={setManageAppId}
          onSearch={setSearch}
          onSelect={(appId) => setSelectedId((current) => current === appId ? null : appId)}
          onUninstall={uninstall}
          onUpdate={updateApp}
          onRollback={rollbackApp}
          search={search}
          selectedId={selectedId}
          summary={appSummary}
          healthByAppId={healthByAppId}
          reconciliation={reconciliation}
          telemetryByAppId={telemetryByAppId}
          updatesByAppId={updatesByAppId}
        />
      )}

      {managedApp && (
        <ManageAppDialog
          access={accessByAppId[managedApp.appId]}
          app={managedApp}
          health={healthByAppId[managedApp.appId] || managedApp.healthSnapshot}
          onAction={(action) => runAction(managedApp.appId, action)}
          onOpenChange={(open) => !open && setManageAppId(null)}
          onSave={saveSettings}
          open={Boolean(managedApp)}
          reconciliation={managedAppReconciliation}
        />
      )}
    </PageShell>
  );
}

function appInstanceToRuntimeView(instance: AppInstanceView): AppRuntimeView {
  const primaryIssue = instance.issues[0];
  const accessUrl = instance.privateUrl || instance.localUrl || null;
  return {
    appId: instance.catalogAppId,
    appName: instance.name,
    category: instance.category || 'Application',
    description: primaryIssue?.summary || 'Managed by Project OS.',
    version: '',
    image: instance.icon || null,
    friendlyStatus: instance.userStatus,
    technicalStatus: instance.runtimeState,
    healthCheck: instance.runtimeState,
    runtimePath: '',
    composeProject: '',
    accessUrl,
    desiredAccess: null,
    observedAccess: {
      localUrl: instance.localUrl || null,
      privateUrl: instance.privateUrl || null,
      localPort: null,
      protocol: accessUrl?.startsWith('https://') ? 'https' : 'http',
      privateLinkStatus: instance.privateUrl ? 'configured' : 'not_enabled',
      lastAccessCheckAt: instance.updatedAt,
      lastSuccessfulAccessAt: ['local_ready', 'private_ready'].includes(instance.accessState) ? instance.updatedAt : null,
      lastRepairAttemptAt: null,
      lastRepairStatus: null,
    },
    installedAt: instance.updatedAt,
    lastBackup: backupLabelForState(instance.backupState),
    settings: {
      accessUrl: instance.localUrl || null,
      privateAccessUrl: instance.privateUrl || null,
      tailscaleEnabled: Boolean(instance.privateUrl),
      storageSubfolders: {},
      backup: {
        enabled: instance.backupState !== 'backup_disabled',
        frequency: 'daily',
        retention: 7,
      },
    },
    telemetry: null,
    healthSnapshot: null,
    usageGuide: null,
    setupGuide: null,
    appConfiguration: [],
    recentEvents: [],
    canonicalUserStatus: instance.userStatus,
    canonicalRuntimeState: instance.runtimeState,
    canonicalOwnershipState: instance.ownershipState,
    canonicalAccessState: instance.accessState,
    canonicalBackupState: instance.backupState,
    canonicalIssues: instance.issues,
    canonicalActions: instance.actions,
  };
}

function backupLabelForState(state: string) {
  if (state === 'protected_by_restore_point') {
    return 'Protected';
  }
  if (state === 'backup_failed') {
    return 'Backup failed';
  }
  if (state === 'backup_enabled_no_restore_point') {
    return 'No restore point yet';
  }
  return 'Not configured';
}

export default ApplicationsPage;
