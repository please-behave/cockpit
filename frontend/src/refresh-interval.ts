const storageKey = 'cockpit-refresh-interval';

export const refreshIntervals = [10_000, 30_000, 60_000, 120_000, 300_000] as const;
export const defaultRefreshInterval = 300_000;

export function refreshIntervalLabel(interval: number): string {
  const seconds = interval / 1000;
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = seconds / 60;
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

export function isRefreshInterval(value: unknown): value is number {
  return refreshIntervals.some(interval => interval === value);
}

/** The interval the viewer chose for all pages, or the default when it is missing or storage fails. */
export function storedRefreshInterval(): number {
  try {
    const value = Number(window.localStorage.getItem(storageKey));
    return isRefreshInterval(value) ? value : defaultRefreshInterval;
  } catch {
    return defaultRefreshInterval;
  }
}

export function storeRefreshInterval(interval: number) {
  try {
    window.localStorage.setItem(storageKey, String(interval));
  } catch {
    // The choice then applies to this page only.
  }
}
