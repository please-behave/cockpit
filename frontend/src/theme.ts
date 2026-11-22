export type Theme = 'light' | 'dark';

const storageKey = 'cockpit-theme';
const darkQuery = '(prefers-color-scheme: dark)';

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

export function storedTheme(): Theme | undefined {
  try {
    const value = window.localStorage.getItem(storageKey);
    return isTheme(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function systemTheme(): Theme {
  return window.matchMedia?.(darkQuery).matches ? 'dark' : 'light';
}

export function effectiveTheme(): Theme {
  const chosen = document.documentElement.dataset.theme;
  return isTheme(chosen) ? chosen : systemTheme();
}

export function watchSystemTheme(listener: () => void): () => void {
  const query = window.matchMedia?.(darkQuery);
  query?.addEventListener('change', listener);
  return () => query?.removeEventListener('change', listener);
}

/** Sets `data-theme` for a stored choice and leaves the system theme in charge otherwise. */
export function applyStoredTheme() {
  const theme = storedTheme();
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

export function chooseTheme(theme: Theme) {
  try {
    window.localStorage.setItem(storageKey, theme);
  } catch {
    // The choice then applies to this page only.
  }
  document.documentElement.dataset.theme = theme;
}
