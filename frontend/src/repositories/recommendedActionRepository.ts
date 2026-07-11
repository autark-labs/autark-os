import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SystemAPIClient } from '@/api/SystemAPIClient';
import type { RecommendedAction } from '@/types/system';

export const recommendedActionQueryKeys = {
  all: ['recommended-action'] as const,
  current: ['recommended-action', 'current'] as const,
};

export function useRecommendedActionQuery() {
  return useQuery<RecommendedAction>({
    queryKey: recommendedActionQueryKeys.current,
    queryFn: () => SystemAPIClient.recommendedAction(),
    refetchInterval: 30_000,
    staleTime: 30_000,
  });
}

export function useDismissRecommendedActionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (actionId: string) => SystemAPIClient.dismissRecommendedAction(actionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: recommendedActionQueryKeys.all }),
  });
}
