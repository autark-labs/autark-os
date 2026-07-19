import type { AppInstanceView, AppRuntimeView } from '@/types/app';
import type { ObservedServiceView } from '@/types/observedService';
import { catalogAppImageUrl, preferredAppImageUrl } from '@/lib/appImage';

export function managedAppIconUrl(app: AppRuntimeView | AppInstanceView | null | undefined) {
  if (!app) {
    return null;
  }
  return preferredAppImageUrl(
    'icon' in app ? app.icon : null,
    'image' in app ? app.image : null,
    catalogAppImageUrl('catalogAppId' in app ? app.catalogAppId : app.appId),
  );
}

export function observedServiceIconUrl(service: ObservedServiceView | null | undefined) {
  return preferredAppImageUrl(
    explicitServiceIcon(service?.metadata),
    catalogAppImageUrl(service?.catalogAppId),
  );
}

function explicitServiceIcon(metadata: Record<string, string> = {}) {
  return preferredAppImageUrl(
    metadata.iconUrl,
    metadata.icon,
    metadata.appIcon,
    metadata.imageUrl,
    metadata.catalogImage,
  );
}
