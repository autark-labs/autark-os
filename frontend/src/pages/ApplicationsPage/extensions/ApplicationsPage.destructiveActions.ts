import type { UninstallPlan } from '@/types/app';

export type DestructiveActionPlan = {
  title: string;
  summary: string;
  severity: 'warning' | 'danger';
  preservesDataByDefault: boolean;
  requiresTextConfirmation?: string;
  steps: string[];
  warnings: string[];
  blockedReasons: string[];
  runLabel: string;
};

export function mapUninstallPlanToDestructiveActionPlan(plan: UninstallPlan): DestructiveActionPlan {
  const confirmationItems = plan.needsConfirmation ?? [];
  const warnings = [
    ...confirmationItems,
    ...(plan.safetyCheckpointMessage ? [plan.safetyCheckpointMessage] : []),
  ];

  return {
    title: `Uninstall ${plan.appName}`,
    summary: plan.headline,
    severity: 'danger',
    preservesDataByDefault: true,
    steps: [
      ...plan.willStop.map((step) => `Stop ${step}`),
      ...plan.willKeep.map((step) => `Preserve ${step}`),
      'Remove the Project OS app record',
      'Refresh app state',
    ],
    warnings,
    blockedReasons: [],
    requiresTextConfirmation: confirmationItems.length > 0 ? 'UNINSTALL' : undefined,
    runLabel: 'Keep data and uninstall',
  };
}
