import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ActivityAPIClient } from '@/api/ActivityAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { SystemAPIClient } from '@/api/SystemAPIClient';
import type { ActivityLog } from '@/types/activity';
import type { RecommendedAction, SystemSummary } from '@/types/system';
import { useRecommendedActionQuery } from './recommendedActionRepository';

export const homeQueryKeys = {
  all: ['home'] as const,
  activity: ['home', 'activity'] as const,
  recommendedAction: ['home', 'recommended-action'] as const,
  summary: ['home', 'summary'] as const,
};

export type HomeRepositoryView = {
  activity: ActivityLog[];
  error: string | null;
  isFetching: boolean;
  isLoading: boolean;
  recommendedAction: RecommendedAction | null;
  refresh: () => Promise<void>;
  summary: SystemSummary | null;
};

export function useHomeSummaryQuery() {
  return useQuery<SystemSummary>({
    queryKey: homeQueryKeys.summary,
    queryFn: () => SystemAPIClient.summary(),
    refetchInterval: 30_000,
    staleTime: 30_000,
  });
}

export function useHomeRecommendedActionQuery() {
  return useRecommendedActionQuery();
}

export function useHomeActivityQuery() {
  return useQuery<ActivityLog[]>({
    queryKey: homeQueryKeys.activity,
    queryFn: () => ActivityAPIClient.recent({ limit: 5 }),
    refetchInterval: 30_000,
    staleTime: 30_000,
  });
}

export function useHomeRepository(): HomeRepositoryView {
  const summaryQuery = useHomeSummaryQuery();
  const recommendedActionQuery = useHomeRecommendedActionQuery();
  const activityQuery = useHomeActivityQuery();
  const refresh = useCallback(async () => {
    await Promise.all([
      summaryQuery.refetch(),
      recommendedActionQuery.refetch(),
      activityQuery.refetch(),
    ]);
  }, [activityQuery.refetch, recommendedActionQuery.refetch, summaryQuery.refetch]);

  return {
    activity: activityQuery.data ?? [],
    error: firstHomeError(summaryQuery.error, recommendedActionQuery.error, activityQuery.error),
    isFetching: summaryQuery.isFetching || recommendedActionQuery.isFetching || activityQuery.isFetching,
    isLoading: summaryQuery.isLoading || recommendedActionQuery.isLoading || activityQuery.isLoading,
    recommendedAction: recommendedActionQuery.data ?? null,
    refresh,
    summary: summaryQuery.data ?? null,
  };
}

function firstHomeError(...errors: unknown[]) {
  const error = errors.find(Boolean);
  return error ? apiErrorMessage(error, 'Home is missing some live data.') : null;
}
