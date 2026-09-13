import type { ObservedServiceView } from '@/types/observedService';

export function visibleResolveExistingServices(services: ObservedServiceView[] = []) {
  return services
    .filter((service) => ['recoverable', 'managed_elsewhere', 'blocked', 'failed_install'].includes(service.userStatus))
    .sort((left, right) => servicePriority(left) - servicePriority(right) || left.displayName.localeCompare(right.displayName));
}

function servicePriority(service: ObservedServiceView) {
  if (service.userStatus === 'failed_install') return 0;
  if (service.userStatus === 'recoverable') return 0;
  if (service.userStatus === 'managed_elsewhere' || service.userStatus === 'blocked') return 1;
  if (service.userStatus === 'found_on_server') return 2;
  return 3;
}
