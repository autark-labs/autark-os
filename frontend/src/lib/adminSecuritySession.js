const STORAGE_KEY = 'project-os-admin-token';

export function readAdminToken(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function writeAdminToken(token, storage = globalThis.localStorage) {
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

export function clearAdminToken(storage = globalThis.localStorage) {
  writeAdminToken('', storage);
}

export function applyAdminAuthHeader(config, storage = globalThis.localStorage) {
  const method = String(config?.method || 'get').toLowerCase();
  if (['get', 'head', 'options'].includes(method)) {
    return config;
  }
  const token = readAdminToken(storage);
  if (!token) {
    return config;
  }
  return {
    ...config,
    headers: {
      ...(config.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  };
}
