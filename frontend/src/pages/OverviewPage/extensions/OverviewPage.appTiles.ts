import type { AppInstanceView, AppRuntimeView } from '@/types/app';
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
