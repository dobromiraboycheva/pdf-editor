import { useCallback, useEffect, useState } from 'react';

/**
 * Theme management hook.
 *
 * - `theme` is the user's explicit choice: 'light' | 'dark' | 'system'.
 * - `resolved` is the actual applied theme ('light' | 'dark'), which follows
 *   the OS preference when `theme` is 'system'.
 * - The choice is persisted to localStorage under `pdf-editor.theme`.
 * - The `dark` class is added/removed on <html> so Tailwind `dark:` variants
 *   and the CSS custom properties in index.css react to it.
 */
export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'pdf-editor.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isTheme(stored) ? stored : 'system';
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(DARK_QUERY).matches;
}

function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return theme;
}

function applyResolved(resolved: 'light' | 'dark'): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

export interface UseThemeResult {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolved: 'light' | 'dark';
}

export function useTheme(): UseThemeResult {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => resolveTheme(readStoredTheme()));

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  // Apply the resolved theme whenever the explicit choice changes.
  useEffect(() => {
    const next = resolveTheme(theme);
    setResolved(next);
    applyResolved(next);
  }, [theme]);

  // Follow OS theme changes while in 'system' mode.
  useEffect(() => {
    if (theme !== 'system') return;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => {
      const next: 'light' | 'dark' = media.matches ? 'dark' : 'light';
      setResolved(next);
      applyResolved(next);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  return { theme, setTheme, resolved };
}

export default useTheme;
