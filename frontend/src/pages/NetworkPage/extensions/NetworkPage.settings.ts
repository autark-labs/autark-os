import type { AppRuntimeView, InstallSettings } from '@/types/app';

export function privateAccessSettings(app: AppRuntimeView, enabled: boolean): InstallSettings {
  const current = app.settings;
  return {
    accessUrl: current?.accessUrl || app.accessUrl,
    privateAccessUrl: enabled ? current?.privateAccessUrl || null : null,
    tailscaleEnabled: enabled,
    storageSubfolders: current?.storageSubfolders || {},
    backup: current?.backup || {
      enabled: false,
      frequency: 'daily',
      retention: 7,
    },
  };
}
