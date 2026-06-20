import type { InstallOptions, MarketplaceApp } from '@/types/marketplace';

export type InstallOptionsUpdater = (options: InstallOptions) => InstallOptions;

export function defaultInstallOptions(app: MarketplaceApp): InstallOptions {
  return {
    ports: { hostPort: null },
    access: { tailscaleEnabled: false },
    storage: { subfolders: storageDefaults(app) },
    backup: { enabled: true, frequency: 'daily', retention: 7 },
    reinstall: false,
  };
}

export function defaultHostPort(app: MarketplaceApp) {
  return app.runtime?.ports?.[0]?.split(':')[0] ?? 'auto';
}

export function storageDefaults(app: MarketplaceApp) {
  const runtimeRoot = app.runtime?.runtimeRoot ?? '';
  return Object.fromEntries((app.runtime?.volumes ?? []).map((volume) => {
    const hostPath = volume.split(':')[0] ?? '';
    let relative = hostPath.replace(runtimeRoot, '');
    while (relative.startsWith('/')) {
      relative = relative.slice(1);
    }
    return [relative, relative];
  }).filter(([relative]) => relative));
}
