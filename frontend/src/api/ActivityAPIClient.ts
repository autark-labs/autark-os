import { httpClient } from './httpClient';
import type { ActivityFilters, ActivityLog } from '@/types/activity';

export const ActivityAPIClient = {
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
