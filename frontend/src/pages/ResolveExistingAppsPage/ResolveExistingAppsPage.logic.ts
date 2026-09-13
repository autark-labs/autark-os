import type { ApplicationView } from '@/types/applicationState';

export function visibleRecoveryApplications(applications: ApplicationView[] = []) {
  return applications
    .filter((application) => Boolean(application.evidence) && (application.relationship === 'recovery_required' || application.relationship === 'blocked'))
    .sort((left, right) => relationshipPriority(left) - relationshipPriority(right) || left.name.localeCompare(right.name));
}

function relationshipPriority(application: ApplicationView) {
  return application.relationship === 'recovery_required' ? 0 : 1;
}
