import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  applyThemeToDocument,
  defaultThemeId,
  projectOsThemes,
  readStoredTheme,
  resolveThemeId,
  storeTheme,
} from '@/lib/themeModel';

export type ProjectOsThemeId = 'project-slate' | 'harbor' | 'forest' | 'ember';

type ThemeContextValue = {
  theme: ProjectOsThemeId;
  themes: typeof projectOsThemes;
  setTheme: (theme: ProjectOsThemeId) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ProjectOsThemeId>(() => {
    if (typeof window === 'undefined') {
      return defaultThemeId as ProjectOsThemeId;
    }
    return (readStoredTheme(window.localStorage) ?? defaultThemeId) as ProjectOsThemeId;
  });

  useEffect(() => {
    applyThemeToDocument(document, theme);
  }, [theme]);

  const setTheme = useCallback((nextTheme: ProjectOsThemeId) => {
    const resolved = resolveThemeId(nextTheme) as ProjectOsThemeId;
    setThemeState(resolved);
    if (typeof window !== 'undefined') {
      storeTheme(resolved, window.localStorage);
    }
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    themes: projectOsThemes,
    setTheme,
  }), [setTheme, theme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
