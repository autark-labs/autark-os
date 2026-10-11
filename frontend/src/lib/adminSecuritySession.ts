const STORAGE_KEY = 'autark-os-admin-token';
export const ADMIN_SESSION_EXPIRED_EVENT = 'autark-os-admin-session-expired';
export type AdminSessionEndReason = 'expired' | 'logout';

type TokenStorage = Pick<Storage, 'removeItem'>;
let expirationNotified = false;
const sessionChannel = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('autark-os-admin-session') : null;

if (sessionChannel) {
  sessionChannel.onmessage = ({ data }: MessageEvent<unknown>) => {
    if (data === 'logout' || data === 'expired') endSession(data, false);
  };
}

export function adminSessionEnded() { return expirationNotified; }

export function clearLegacyAdminToken(storage: TokenStorage | undefined = globalThis.localStorage) {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // A blocked storage API must not prevent cookie-based authentication.
  }
}

export function markAdminSessionActive() {
  expirationNotified = false;
}

export function notifyAdminSessionExpired() {
  endSession('expired');
}

export function notifyAdminLogout() {
  endSession('logout');
}

function endSession(reason: AdminSessionEndReason, broadcast = true) {
  if (expirationNotified && reason !== 'logout') {
    return;
  }
  expirationNotified = true;
  globalThis.dispatchEvent?.(new CustomEvent<AdminSessionEndReason>(ADMIN_SESSION_EXPIRED_EVENT, { detail: reason }));
  if (broadcast) sessionChannel?.postMessage(reason);
}
