export const serverOnlyAccessReason = 'This dashboard is server-only. Open Autark-OS using localhost in a browser on the server, or enable private access in Access.';

/** Browser location is relevant only to using a server-local link, not app health. */
export function appBrowserAccessReason(value?: string | null, browserHostname = typeof window === 'undefined' ? 'localhost' : window.location.hostname): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const loopback = (host: string) => host === 'localhost' || host === '[::1]' || host === '::1' || /^127\./.test(host);
    return loopback(url.hostname) && !loopback(browserHostname) ? serverOnlyAccessReason : null;
  } catch {
    return null;
  }
}
