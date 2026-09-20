import { httpClient } from './httpClient';
import type { ActivityFilters, ActivityLog } from '@/types/activity';
import type { AutarkOsAction } from '@/types/app';

export const ActivityAPIClient = {
  async recordNotification(notification: { id: string; severity: string; title: string; message?: string; nextAction?: AutarkOsAction | null }) {
    const response = await httpClient.post<ActivityLog>('/api/activity/notifications', notification);
    return response.data;
  },
  async recent(filters: ActivityFilters = {}) {
    const response = await httpClient.get<ActivityLog[]>('/api/activity', {
      params: {
        limit: filters.limit ?? 100,
        level: filters.level || undefined,
        category: filters.category || undefined,
        outcome: filters.outcome || undefined,
        appId: filters.appId || undefined,
      },
    });
    return response.data;
  },
};
