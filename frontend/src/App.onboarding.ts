import { canonicalRoutePaths, routeAliases } from './appRouteManifest';

export function setupRedirectTarget(pathname: string, search = '', hash = ''): string {
  const returnTo = `${pathname}${search}${hash}`;
  return `/setup?returnTo=${encodeURIComponent(returnTo)}`;
}

export function safePostSetupPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/setup')) {
    return '/home';
  }
  const pathname = value.split(/[?#]/, 1)[0];
  return [...canonicalRoutePaths, ...Object.keys(routeAliases)].includes(pathname) ? value : '/home';
}
