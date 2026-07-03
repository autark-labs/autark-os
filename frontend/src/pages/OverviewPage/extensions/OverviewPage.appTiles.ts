import type { AppInstanceView, AppRuntimeView } from '@/types/app';
import type { ObservedServiceView } from '@/types/observedService';

export function managedAppIconUrl(app: AppRuntimeView | AppInstanceView | null | undefined) {
  if (!app) {
    return null;
  }
  return nonBlank('icon' in app ? app.icon : null) || nonBlank('image' in app ? app.image : null) || null;
}

export function observedServiceIconUrl(service: ObservedServiceView | null | undefined) {
  return explicitServiceIcon(service?.metadata)
    || catalogIconUrl(service?.catalogAppId)
    || null;
}

function explicitServiceIcon(metadata: Record<string, string> = {}) {
  return nonBlank(metadata.iconUrl)
    || nonBlank(metadata.icon)
    || nonBlank(metadata.appIcon)
    || nonBlank(metadata.imageUrl)
    || nonBlank(metadata.catalogImage)
    || null;
}

function catalogIconUrl(catalogAppId: string | null | undefined) {
  const appId = nonBlank(catalogAppId);
  if (!appId || !/^[a-z0-9][a-z0-9-]*$/.test(appId)) {
    return null;
  }
  return `/app-images/${appId}.svg`;
}

function nonBlank(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
