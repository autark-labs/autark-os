import type { InternalAxiosRequestConfig } from 'axios';

const STORAGE_KEY = 'autark-os-admin-token';
export const ADMIN_SESSION_EXPIRED_EVENT = 'autark-os-admin-session-expired';

type TokenStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

export function readAdminToken(storage: TokenStorage | undefined = globalThis.localStorage) {
  try {
    return storage?.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function writeAdminToken(token: string, storage: TokenStorage | undefined = globalThis.localStorage) {
  try {
    if (token) {
      storage?.setItem(STORAGE_KEY, token);
    } else {
      storage?.removeItem(STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures; the current request can still continue.
  }
}

export function clearAdminToken(storage: TokenStorage | undefined = globalThis.localStorage) {
  writeAdminToken('', storage);
}

export function applyAdminAuthHeader(config: InternalAxiosRequestConfig, storage: TokenStorage | undefined = globalThis.localStorage) {
  const token = readAdminToken(storage);
  if (!token) {
    return config;
  }
  if (typeof config.headers.set === 'function') {
    config.headers.set('Authorization', `Bearer ${token}`);
    return config;
  }
  config.headers = {
    ...config.headers,
    Authorization: `Bearer ${token}`,
  } as InternalAxiosRequestConfig['headers'];
  return config;
}
