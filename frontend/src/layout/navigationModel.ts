import { appRoutes } from '@/appRouteManifest';
import betaScope from '@beta-scope';

export { routeAliases } from '@/appRouteManifest';

export const primaryNavigation = [
  { id: 'home', label: 'Home', to: appRoutes.home, icon: 'home', activePaths: [appRoutes.home, '/overview'] },
  { id: 'apps', label: 'My Apps', to: appRoutes.apps, icon: 'apps', activePaths: [appRoutes.apps, '/applications'] },
  { id: 'discover', label: 'Discover', to: appRoutes.discover, icon: 'discover', activePaths: [appRoutes.discover, '/marketplace'] },
  { id: 'access', label: 'Access', to: appRoutes.access, icon: 'access', activePaths: [appRoutes.access, '/network'] },
  { id: 'backups', label: 'Backups', to: appRoutes.backups, icon: 'backups', activePaths: [appRoutes.backups] },
  { id: 'pro', label: 'Autark Pro', to: appRoutes.pro, icon: 'pro', activePaths: [appRoutes.pro] },
].filter((item) => item.id !== 'pro' || betaScope.proInstallationAvailable);

export const systemNavigation = [
  { id: 'storage', label: 'Storage', to: appRoutes.storage, icon: 'storage', activePaths: [appRoutes.storage, '/files-storage'] },
  { id: 'activity', label: 'Activity Log', to: appRoutes.activity, icon: 'activity', activePaths: [appRoutes.activity, '/monitoring', '/system-activity'] },
  { id: 'diagnostics', label: 'Diagnostics', to: appRoutes.diagnostics, icon: 'diagnostics', activePaths: [appRoutes.diagnostics, '/terminal', '/safe-diagnostics'] },
];

export function navigationGroups() {
  return [
    { label: 'Autark-OS', items: primaryNavigation },
    { label: 'System', items: systemNavigation },
  ];
}
