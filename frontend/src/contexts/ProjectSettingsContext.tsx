import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { SystemAPIClient } from '@/api/SystemAPIClient';
import type { ProjectSettings } from '@/types/system';

export type ViewMode = 'basic' | 'advanced';

const viewModeStorageKey = 'autark-os.viewMode';

type ProjectSettingsContextValue = {
  loading: boolean;
  settings: ProjectSettings | null;
  showAdvancedMetrics: boolean;
  viewMode: ViewMode;
  refreshSettings: () => Promise<void>;
  setViewMode: (mode: ViewMode) => void;
  setProjectSettings: (settings: ProjectSettings) => void;
};

const ProjectSettingsContext = createContext<ProjectSettingsContextValue | null>(null);

export function ProjectSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [viewMode, setViewModeState] = useState<ViewMode>(() => storedViewMode() ?? 'basic');
  const [loading, setLoading] = useState(true);

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    window.localStorage.setItem(viewModeStorageKey, mode);
  }, []);

  const refreshSettings = useCallback(async () => {
    setLoading(true);
    try {
      const nextSettings = await SystemAPIClient.settings();
      setSettings(nextSettings);
      if (!storedViewMode()) {
        setViewModeState(nextSettings.showAdvancedMetrics ? 'advanced' : 'basic');
      }
    } catch (error) {
      console.warn('Unable to load Autark-OS settings.', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  const setProjectSettings = useCallback((nextSettings: ProjectSettings) => {
    setSettings(nextSettings);
    setViewMode(nextSettings.showAdvancedMetrics ? 'advanced' : 'basic');
  }, [setViewMode]);

  const value = useMemo<ProjectSettingsContextValue>(() => ({
    loading,
    settings,
    showAdvancedMetrics: viewMode === 'advanced',
    viewMode,
    refreshSettings,
    setViewMode,
    setProjectSettings,
  }), [loading, refreshSettings, setProjectSettings, setViewMode, settings, viewMode]);

  return (
    <ProjectSettingsContext.Provider value={value}>
      {children}
    </ProjectSettingsContext.Provider>
  );
}

export function useProjectSettings() {
  const context = useContext(ProjectSettingsContext);
  if (!context) {
    throw new Error('useProjectSettings must be used within ProjectSettingsProvider');
  }
  return context;
}

function storedViewMode(): ViewMode | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const stored = window.localStorage.getItem(viewModeStorageKey);
  return stored === 'advanced' || stored === 'basic' ? stored : null;
}
