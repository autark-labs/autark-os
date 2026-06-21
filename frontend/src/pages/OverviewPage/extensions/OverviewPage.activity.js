const MAJOR_ACTIVITY_ACTIONS = new Set([
  'install_app',
  'recover_found_app',
  'cleanup_container',
  'delete_found_data',
  'uninstall_app',
  'restart_app',
  'backup_created',
  'restore_completed',
  'update_app',
  'tailscale_signed_in',
  'tailscale_signed_out',
  'setup_completed',
  'access_mode_changed',
]);

const MAJOR_ACTIVITY_CATEGORIES = new Set(['install', 'marketplace', 'backup', 'restore', 'update', 'access', 'setup']);
const NOISY_ACTION_PARTS = ['refresh', 'poll', 'sync', 'diagnostic', 'health_check', 'status_check', 'auto_repair_check'];

export function homeMajorActivity(items, limit = 5) {
  return (items || [])
    .filter((item) => isMajorHomeActivity(item))
    .slice(0, limit);
}

export function isMajorHomeActivity(item) {
  const action = clean(item?.action);
  const category = clean(item?.category);
  const title = clean(item?.title);
  if (!action && !category && !title) {
    return false;
  }
  if (MAJOR_ACTIVITY_ACTIONS.has(action)) {
    return true;
  }
  if (NOISY_ACTION_PARTS.some((part) => action.includes(part) || title.includes(part))) {
    return false;
  }
  if (category === 'health' || category === 'api' || category === 'diagnostics') {
    return false;
  }
  return MAJOR_ACTIVITY_CATEGORIES.has(category) && item?.outcome !== 'failed_background';
}

function clean(value) {
  return String(value || '').trim().toLowerCase().replaceAll(' ', '_');
}
