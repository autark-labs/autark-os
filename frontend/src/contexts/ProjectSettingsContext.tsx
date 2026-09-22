import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { SystemAPIClient } from '@/api/SystemAPIClient';
import type { ProjectSettings } from '@/types/system';

type ProjectSettingsContextValue = {
  loading: boolean;
  settings: ProjectSettings | null;
  refreshSettings: () => Promise<void>;
  setProjectSettings: (settings: ProjectSettings) => void;
};

const ProjectSettingsContext = createContext<ProjectSettingsContextValue | null>(null);

export function ProjectSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSettings = useCallback(async () => {
    setLoading(true);
    try {
      const nextSettings = await SystemAPIClient.settings();
      setSettings(nextSettings);
    } catch (error) {
      console.warn('Unable to load Autark-OS settings.', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  const value = useMemo<ProjectSettingsContextValue>(() => ({
    loading,
    settings,
    refreshSettings,
    setProjectSettings: setSettings,
  }), [loading, refreshSettings, settings]);

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
