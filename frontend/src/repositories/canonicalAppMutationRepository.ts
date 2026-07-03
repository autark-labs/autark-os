import type { QueryClient } from '@tanstack/react-query';
import type { AppRuntimeView } from '@/types/app';
import type { ApplicationState } from '@/types/applicationState';
import type { ProjectOsJob } from '@/types/jobs';
import {
  invalidateApplicationState,
  setApplicationStateFromActionResultCache,
  setProjectOsJobInApplicationStateCache,
  setRuntimeAppInApplicationStateCache,
} from './applicationStateRepository';
import { invalidateProjectOsJobs, setProjectOsJobCache } from './jobRepository';

export type CanonicalAppMutationResult = {
  applicationState?: ApplicationState | null;
  app?: AppRuntimeView | null;
  currentStep?: string | null;
  jobId?: string | null;
  status?: string | null;
  steps?: unknown[];
  type?: string | null;
};

export function syncCanonicalAppMutationResult(queryClient: QueryClient, result?: CanonicalAppMutationResult | null) {
  const stateUpdated = setApplicationStateFromActionResultCache(queryClient, result);
  const jobUpdated = syncJobResult(queryClient, result);
  const appUpdated = syncAppResult(queryClient, result);

  if (jobUpdated) {
    void invalidateProjectOsJobs(queryClient);
  }

  void invalidateApplicationState(queryClient);

  return {
    appUpdated,
    jobUpdated,
    stateUpdated,
  };
}

function syncJobResult(queryClient: QueryClient, result?: CanonicalAppMutationResult | null) {
  if (!isProjectOsJob(result)) {
    return false;
  }

  setProjectOsJobCache(queryClient, result);
  setProjectOsJobInApplicationStateCache(queryClient, result);
  return true;
}

function syncAppResult(queryClient: QueryClient, result?: CanonicalAppMutationResult | null) {
  if (!result?.app) {
    return false;
  }

  setRuntimeAppInApplicationStateCache(queryClient, result.app);
  return true;
}

function isProjectOsJob(result?: CanonicalAppMutationResult | null): result is ProjectOsJob {
  return Boolean(result?.jobId && result.type && Array.isArray(result.steps));
}
