export const primaryNavigation = [
  { id: 'home', label: 'Home', to: '/home', icon: 'home', activePaths: ['/home', '/overview'] },
  { id: 'apps', label: 'My Apps', to: '/apps', icon: 'apps', activePaths: ['/apps', '/applications'] },
  { id: 'discover', label: 'Discover', to: '/discover', icon: 'discover', activePaths: ['/discover', '/marketplace'] },
  { id: 'access', label: 'Access', to: '/access', icon: 'access', activePaths: ['/access', '/network'] },
  { id: 'backups', label: 'Backups', to: '/backups', icon: 'backups', activePaths: ['/backups'] },
];

export const advancedNavigation = [
  { id: 'storage', label: 'Storage', to: '/storage', icon: 'storage', activePaths: ['/storage', '/files-storage'] },
  { id: 'settings', label: 'Settings', to: '/settings', icon: 'settings', activePaths: ['/settings'] },
  { id: 'diagnostics', label: 'Diagnostics', to: '/diagnostics', icon: 'diagnostics', activePaths: ['/diagnostics', '/terminal', '/safe-diagnostics'] },
  { id: 'activity', label: 'Activity Log', to: '/activity', icon: 'activity', activePaths: ['/activity', '/monitoring', '/system-activity'] },
];

export const routeAliases = {
  '/overview': '/home',
  '/applications': '/apps',
  '/marketplace': '/discover',
  '/network': '/access',
  '/files-storage': '/storage',
  '/terminal': '/diagnostics',
  '/safe-diagnostics': '/diagnostics',
  '/monitoring': '/activity',
  '/system-activity': '/activity',
};

export function navigationGroups(viewMode = 'basic') {
  const groups = [
    { label: 'Autark-OS', items: primaryNavigation },
  ];
  if (viewMode === 'advanced') {
    groups.push({ label: 'Advanced', items: advancedNavigation });
  }
  return groups;
}
