/**
 * @param {any} app
 * @param {any} reconciliationItem
 * @returns {string | null}
 */
export function privateAccessUrlForApp(app, reconciliationItem = null) {
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
