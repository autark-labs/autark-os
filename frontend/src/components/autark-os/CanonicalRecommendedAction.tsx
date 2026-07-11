import { useDismissRecommendedActionMutation, useRecommendedActionQuery } from '@/repositories/recommendedActionRepository';
import { cn } from '@/lib/utils';
import { RecommendedActionCard } from './RecommendedActionCard';

type CanonicalRecommendedActionProps = {
  className?: string;
};

export function CanonicalRecommendedAction({ className }: CanonicalRecommendedActionProps) {
  const recommendedActionQuery = useRecommendedActionQuery();
  const dismissRecommendedAction = useDismissRecommendedActionMutation();
  const recommendedAction = recommendedActionQuery.data ?? null;

  if (!recommendedAction || recommendedAction.id === 'no-action-needed') {
    return null;
  }

  return (
    <div className={cn('mb-5', className)}>
      <RecommendedActionCard
        model={{
          body: recommendedAction.body,
          dismissible: recommendedAction.dismissible,
          primaryAction: recommendedAction.primaryAction,
          severity: recommendedAction.severity,
          title: recommendedAction.title,
        }}
        dismissing={dismissRecommendedAction.isPending}
        onDismiss={recommendedAction.dismissible ? () => dismissRecommendedAction.mutate(recommendedAction.id) : undefined}
      />
    </div>
  );
}
