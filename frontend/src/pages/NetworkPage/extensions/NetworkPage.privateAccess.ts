import type { AppRuntimeView } from '@/types/app';
import type { PrivateAccessReconciliationItem } from '@/types/network';

export function privateAccessUrlForApp(
  app: AppRuntimeView,
  reconciliationItem: PrivateAccessReconciliationItem | null = null,
) {
  if (reconciliationItem && reconciliationItem.status !== 'healthy') {
    return null;
  }
  return reconciliationItem?.actualPrivateUrl
    || (reconciliationItem?.status === 'healthy' ? reconciliationItem.expectedPrivateUrl : null)
    || (app.accessRoute?.privateLinkStatus === 'verified' ? app.accessRoute.privateUrl : null)
    || (app.observedAccess?.privateLinkStatus === 'verified' ? app.observedAccess.privateUrl : null)
    || null;
}
