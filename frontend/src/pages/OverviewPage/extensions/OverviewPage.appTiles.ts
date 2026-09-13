import type { AppRuntimeView } from '@/types/app';
import { catalogAppImageUrl, preferredAppImageUrl } from '@/lib/appImage';

export function managedAppIconUrl(app: AppRuntimeView | null | undefined) {
  if (!app) {
    return null;
  }
  return preferredAppImageUrl(app.image, catalogAppImageUrl(app.appId));
}
