import type { AppRuntimeView, InstallSettings } from '@/types/app';
import type { EditableSettings, StorageRow } from './ApplicationsPage.types';

export function settingsFromApp(app: AppRuntimeView): EditableSettings {
  return {
    accessUrl: app.settings?.accessUrl || app.accessUrl || '',
    privateAccessUrl: app.settings?.privateAccessUrl || '',
    tailscaleEnabled: Boolean(app.settings?.tailscaleEnabled),
    autoRepairEnabled: app.settings?.autoRepairEnabled ?? true,
    backup: {
      enabled: app.settings?.backup?.enabled ?? true,
      frequency: app.settings?.backup?.frequency || 'daily',
      retention: app.settings?.backup?.retention ?? 7,
    },
  };
}

export function storageRowsFromSettings(settings?: InstallSettings | null): StorageRow[] {
  return Object.entries(settings?.storageSubfolders ?? {}).map(([key, value]) => ({ key, value }));
}

export function settingsPayload(settings: EditableSettings, storageRows: StorageRow[]): InstallSettings {
  const storageSubfolders = storageRows.reduce<Record<string, string>>((folders, row) => {
    const key = row.key.trim();
    const value = row.value.trim();
    if (key && value) {
      folders[key] = value;
    }
    return folders;
  }, {});

  return {
    accessUrl: settings.accessUrl.trim(),
    privateAccessUrl: settings.privateAccessUrl.trim() || null,
    tailscaleEnabled: settings.tailscaleEnabled,
    autoRepairEnabled: settings.autoRepairEnabled,
    storageSubfolders,
    backup: {
      enabled: settings.backup.enabled,
      frequency: settings.backup.frequency,
      retention: Number(settings.backup.retention),
    },
  };
}
