import type { QueryClient } from '@tanstack/react-query';
import type { ApplicationState } from '@/types/applicationState';
import type { AutarkOsJob } from '@/types/jobs';
import {
  invalidateApplicationState,
  setApplicationStateFromActionResultCache,
} from './applicationStateRepository';
import { invalidateAutarkOsJobs, setAutarkOsJobCache } from './jobRepository';

export type CanonicalAppMutationResult = {
  applicationState?: ApplicationState | null;
  currentStep?: string | null;
  jobId?: string | null;
  status?: string | null;
  steps?: unknown[];
  type?: string | null;
};

export function syncCanonicalAppMutationResult(queryClient: QueryClient, result?: CanonicalAppMutationResult | null) {
  const stateUpdated = setApplicationStateFromActionResultCache(queryClient, result);
  const jobUpdated = syncJobResult(queryClient, result);

  if (jobUpdated) {
    void invalidateAutarkOsJobs(queryClient);
  }

  void invalidateApplicationState(queryClient);

  return {
    jobUpdated,
    stateUpdated,
  };
}

function syncJobResult(queryClient: QueryClient, result?: CanonicalAppMutationResult | null) {
  if (!isAutarkOsJob(result)) {
    return false;
  }

  setAutarkOsJobCache(queryClient, result);
  return true;
}

function isAutarkOsJob(result?: CanonicalAppMutationResult | null): result is AutarkOsJob {
  return Boolean(result?.jobId && result.type && Array.isArray(result.steps));
}
