import type { ActivityLog } from '@/types/activity';

export function shouldShowActivityLogLink(viewMode: string, majorActivity: ActivityLog[] | null | undefined) {
  return viewMode === 'advanced' && Array.isArray(majorActivity) && majorActivity.length > 0;
}
