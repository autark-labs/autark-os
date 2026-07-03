import type { AppRuntimeView } from '@/types/app';
import type { PrivateAccessReconciliationItem } from '@/types/network';

export function privateAccessUrlForApp(
  app: AppRuntimeView,
  reconciliationItem: PrivateAccessReconciliationItem | null = null,
) {
  if (app.accessRoute?.privateLinkStatus === 'port_conflict') {
    return reconciliationItem?.expectedPrivateUrl || reconciliationItem?.actualPrivateUrl || null;
  }
  return reconciliationItem?.expectedPrivateUrl
    || reconciliationItem?.actualPrivateUrl
    || app.accessRoute?.privateUrl
    || app.settings?.privateAccessUrl
    || app.observedAccess?.privateUrl
    || null;
}
