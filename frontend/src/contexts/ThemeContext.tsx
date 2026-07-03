import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  applyThemeToDocument,
  defaultThemeId,
  autarkOsThemes,
  readStoredTheme,
  resolveThemeId,
  storeTheme,
} from '@/lib/themeModel';

export type AutarkOsThemeId = 'project-slate' | 'harbor' | 'forest' | 'ember';

type ThemeContextValue = {
  theme: AutarkOsThemeId;
  themes: typeof autarkOsThemes;
  setTheme: (theme: AutarkOsThemeId) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AutarkOsThemeId>(() => {
    if (typeof window === 'undefined') {
      return defaultThemeId as AutarkOsThemeId;
    }
    return (readStoredTheme(window.localStorage) ?? defaultThemeId) as AutarkOsThemeId;
  });

  useEffect(() => {
    applyThemeToDocument(document, theme);
  }, [theme]);

  const setTheme = useCallback((nextTheme: AutarkOsThemeId) => {
    const resolved = resolveThemeId(nextTheme) as AutarkOsThemeId;
    setThemeState(resolved);
    if (typeof window !== 'undefined') {
      storeTheme(resolved, window.localStorage);
    }
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    themes: autarkOsThemes,
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
