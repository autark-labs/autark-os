import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { JobsAPIClient } from '@/api/JobsAPIClient';
import type { AutarkOsJob } from '@/types/jobs';
import {
  JOB_FAMILIES,
  jobListRefetchInterval,
  activeJobs,
  activeJobsByFamily,
  currentJobStep,
  currentJobStepText,
  jobProgressPercent,
  jobTypeLabel,
  latestActiveJob,
  queuedJobText,
  terminalJob,
} from './jobRepository.logic';

export {
  JOB_FAMILIES,
  jobListRefetchInterval,
  activeJobs,
  activeJobsByFamily,
  currentJobStep,
  currentJobStepText,
  jobProgressPercent,
  jobTypeLabel,
  latestActiveJob,
  queuedJobText,
  terminalJob,
};

export const jobQueryKeys = {
  all: ['jobs'] as const,
  job: (jobId: string | null) => ['jobs', 'job', jobId] as const,
};

export function useAutarkOsJobsQuery() {
  return useQuery<AutarkOsJob[]>({
    queryKey: jobQueryKeys.all,
    queryFn: () => JobsAPIClient.list(),
    refetchInterval: (query) => jobListRefetchInterval(query.state.data),
    staleTime: 1_200,
  });
}

export function useAutarkOsJobQuery(jobId: string | null) {
  return useQuery<AutarkOsJob>({
    queryKey: jobQueryKeys.job(jobId),
    queryFn: () => JobsAPIClient.get(jobId || ''),
    enabled: Boolean(jobId),
    refetchInterval: 1_200,
  });
}

export function useActiveAutarkOsJob(types: string[] = []) {
  const jobsQuery = useAutarkOsJobsQuery();
  const activeJob = latestActiveJob(jobsQuery.data ?? [], types) as AutarkOsJob | null;
  return {
    ...jobsQuery,
    activeJob,
    activeJobs: activeJobs(jobsQuery.data ?? [], types) as AutarkOsJob[],
  };
}

export function useGlobalActiveAutarkOsJob() {
  return useActiveAutarkOsJob([
    ...JOB_FAMILIES.appLifecycle,
    ...JOB_FAMILIES.backup,
  ]);
}

export function setAutarkOsJobCache(queryClient: QueryClient, job?: AutarkOsJob | null) {
  if (!job) {
    return;
  }
  queryClient.setQueryData(jobQueryKeys.job(job.jobId), job);
  queryClient.setQueryData<AutarkOsJob[] | undefined>(jobQueryKeys.all, (current) => upsertJob(current, job));
}

export function invalidateAutarkOsJobs(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: jobQueryKeys.all });
}

export function useAutarkOsJobCache() {
  const queryClient = useQueryClient();
  return {
    invalidateJobs: () => invalidateAutarkOsJobs(queryClient),
    setJob: (job?: AutarkOsJob | null) => setAutarkOsJobCache(queryClient, job),
  };
}

function upsertJob(current: AutarkOsJob[] | undefined, job: AutarkOsJob) {
  const jobs = current ?? [];
  const found = jobs.some((candidate) => candidate.jobId === job.jobId);
  if (!found) {
    return [job, ...jobs];
  }
  return jobs.map((candidate) => candidate.jobId === job.jobId ? job : candidate);
}
