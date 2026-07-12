import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackupAPIClient } from '@/api/BackupAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { SystemAPIClient } from '@/api/SystemAPIClient';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import { showActionErrorNotification, showActionNotification } from '@/lib/actionNotifications';
import { copyText } from '@/lib/copyText';
import { useApplicationStateRepository } from '@/repositories/applicationStateRepository';
import { useSystemDoctorQuery } from '@/repositories/systemRepository';
import type { BackupSettingsSummary } from '@/types/backup';
import type { ProjectSettings, ProjectVersionInfo, SystemDoctorStatus, SystemMetrics, SystemSetupStatus } from '@/types/system';
import type { SettingsGroupId } from './SettingsPage.sections';

export type SettingsState = {
  backupRoot: string | null;
  backupSchedule: BackupSettingsSummary | null;
  doctor: SystemDoctorStatus | null;
  metrics: SystemMetrics | null;
  projectSettings: ProjectSettings | null;
  setup: SystemSetupStatus | null;
  version: ProjectVersionInfo | null;
};

const initialSettingsState: SettingsState = {
  backupRoot: null,
  backupSchedule: null,
  doctor: null,
  metrics: null,
  projectSettings: null,
  setup: null,
  version: null,
};

/**
 * Owns the Settings page's draft, durable save workflow, and leave/refresh
 * guards. The page itself can stay focused on composing sections and layout.
 */
export function useSettingsPageController() {
  const navigate = useNavigate();
  const { setProjectSettings } = useProjectSettings();
  const appState = useApplicationStateRepository();
  const doctorQuery = useSystemDoctorQuery();
  const [activeGroup, setActiveGroup] = useState<SettingsGroupId>('general');
  const [state, setState] = useState<SettingsState>(initialSettingsState);
  const [draft, setDraft] = useState<ProjectSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [refreshConfirmationOpen, setRefreshConfirmationOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);
    try {
      const [setup, metrics, projectSettings, version, backupReport] = await Promise.all([
        SystemAPIClient.setupStatus(),
        SystemAPIClient.metrics(),
        SystemAPIClient.settings(),
        SystemAPIClient.version(),
        BackupAPIClient.report().catch((backupError) => {
          console.warn('Unable to load backup destination for Settings.', backupError);
          return null;
        }),
      ]);
      setState((current) => ({
        ...current,
        backupRoot: backupReport?.backupRoot ?? null,
        backupSchedule: backupReport?.settings ?? null,
        metrics,
        projectSettings,
        setup,
        version,
      }));
      setDraft(projectSettings);
    } catch (error) {
      setLoadError(apiErrorMessage(error, 'Settings could not be loaded.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = Boolean(draft && state.projectSettings && JSON.stringify(draft) !== JSON.stringify(state.projectSettings));
  const doctor = doctorQuery.data ?? state.doctor;

  useEffect(() => {
    if (!dirty) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return undefined;
    const guardNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target instanceof Element ? event.target.closest('a[href]') : null) as HTMLAnchorElement | null;
      if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
      const destination = anchor.href;
      if (!destination || destination === window.location.href || destination.startsWith('mailto:') || destination.startsWith('tel:')) return;
      event.preventDefault();
      setPendingNavigation(destination);
    };
    document.addEventListener('click', guardNavigation, true);
    return () => document.removeEventListener('click', guardNavigation, true);
  }, [dirty]);

  const copy = useCallback(async (value: string, id: string) => {
    const result = await copyText(value);
    if (!result.ok) {
      showActionNotification({ ok: false, severity: 'warning', title: 'Copy unavailable', message: result.message }, 'Copy unavailable');
      return;
    }
    setCopied(id);
    showActionNotification({ ok: true, severity: 'success', title: 'Command copied', message: value }, 'Command copied');
    window.setTimeout(() => setCopied(null), 1600);
  }, []);

  const updateDraft = useCallback((update: Partial<ProjectSettings>) => {
    setDraft((current) => (current ? { ...current, ...update } : current));
  }, []);

  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await SystemAPIClient.updateSettings(draft);
      const saved = result.settings;
      setState((current) => ({ ...current, projectSettings: saved }));
      setDraft(saved);
      setProjectSettings(saved);
      if (result.appDefaults.updatedApps > 0) {
        try {
          await appState.refresh();
        } catch (refreshError) {
          console.warn('Settings were saved, but managed apps could not refresh immediately.', refreshError);
        }
      }
      showActionNotification({
        ok: true,
        severity: 'success',
        title: 'Settings saved',
        message: result.appDefaults.message,
      }, 'Settings saved');
    } catch (error) {
      const message = apiErrorMessage(error, 'Settings could not be saved.');
      setSaveError(message);
      showActionErrorNotification(error, 'Settings could not be saved');
    } finally {
      setSaving(false);
    }
  }, [appState, draft, setProjectSettings]);

  const refreshDoctor = useCallback(() => {
    void doctorQuery.refetch();
  }, [doctorQuery]);

  const reload = useCallback(() => {
    void load(true);
    refreshDoctor();
  }, [load, refreshDoctor]);

  const requestRefresh = useCallback(() => {
    if (dirty) {
      setRefreshConfirmationOpen(true);
      return;
    }
    reload();
  }, [dirty, reload]);

  const confirmRefresh = useCallback(() => {
    setRefreshConfirmationOpen(false);
    reload();
  }, [reload]);

  const continueNavigation = useCallback(() => {
    if (!pendingNavigation) return;
    const destination = new URL(pendingNavigation, window.location.origin);
    if (destination.origin === window.location.origin) {
      navigate(destination.pathname + destination.search + destination.hash);
      return;
    }
    window.location.assign(destination.toString());
  }, [navigate, pendingNavigation]);

  return {
    activeGroup,
    appState,
    confirmRefresh,
    continueNavigation,
    copy,
    copied,
    doctor,
    draft,
    dirty,
    load,
    loadError,
    loading,
    pendingNavigation,
    refreshConfirmationOpen,
    refreshing,
    reload,
    requestRefresh,
    save,
    saveError,
    saving,
    setActiveGroup,
    setPendingNavigation,
    setRefreshConfirmationOpen,
    state,
    updateDraft,
  };
}
