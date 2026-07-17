const STORAGE_KEY = 'autark-os-admin-token';
export const ADMIN_SESSION_EXPIRED_EVENT = 'autark-os-admin-session-expired';
export type AdminSessionEndReason = 'expired' | 'logout';

type TokenStorage = Pick<Storage, 'removeItem'>;
let expirationNotified = false;

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
  if (expirationNotified) {
    return;
  }
  expirationNotified = true;
  globalThis.dispatchEvent?.(new CustomEvent<AdminSessionEndReason>(ADMIN_SESSION_EXPIRED_EVENT, { detail: 'expired' }));
}

export function notifyAdminLogout() {
  expirationNotified = true;
  globalThis.dispatchEvent?.(new CustomEvent<AdminSessionEndReason>(ADMIN_SESSION_EXPIRED_EVENT, { detail: 'logout' }));
}
