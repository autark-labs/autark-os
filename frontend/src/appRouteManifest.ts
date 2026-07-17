import manifest from '@spa-route-manifest';

export const appRoutes = manifest.routes;
export const specialRoutes = manifest.specialRoutes;
export const routeAliases = manifest.aliases;

export const canonicalRoutePaths = Object.values(appRoutes);
export const directRoutePaths = [
  specialRoutes.root,
  specialRoutes.setup,
  specialRoutes.foundApps,
  specialRoutes.resolveExistingApps,
  ...canonicalRoutePaths,
];
