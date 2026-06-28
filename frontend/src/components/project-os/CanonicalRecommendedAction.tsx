import { PrimaryActionCard } from '@/components/project-os/ProjectOSComponents';
import { useRecommendedActionQuery } from '@/repositories/recommendedActionRepository';
import { cn } from '@/lib/utils';

type CanonicalRecommendedActionProps = {
  className?: string;
};

export function CanonicalRecommendedAction({ className }: CanonicalRecommendedActionProps) {
  const recommendedActionQuery = useRecommendedActionQuery();
  const recommendedAction = recommendedActionQuery.data ?? null;

  if (!recommendedAction || recommendedAction.id === 'no-action-needed') {
    return null;
  }

  return (
    <div className={cn('mb-5', className)}>
      <PrimaryActionCard
        action={recommendedAction.primaryAction}
        body={recommendedAction.body}
        dismissible={recommendedAction.dismissible}
        severity={recommendedAction.severity}
        title={recommendedAction.title}
      />
    </div>
  );
}
