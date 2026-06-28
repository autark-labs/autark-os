import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { JobsAPIClient } from '@/api/JobsAPIClient';
import type { ProjectOsJob } from '@/types/jobs';
import {
  JOB_FAMILIES,
  activeJobs,
  activeJobsByFamily,
  currentJobStep,
  currentJobStepText,
  jobProgressPercent,
  jobTypeLabel,
  latestActiveJob,
  terminalJob,
} from './jobRepository.logic';

export {
  JOB_FAMILIES,
  activeJobs,
  activeJobsByFamily,
  currentJobStep,
  currentJobStepText,
  jobProgressPercent,
  jobTypeLabel,
  latestActiveJob,
  terminalJob,
};

export const jobQueryKeys = {
  all: ['jobs'] as const,
  job: (jobId: string | null) => ['jobs', 'job', jobId] as const,
};

export function useProjectOsJobsQuery() {
  return useQuery<ProjectOsJob[]>({
    queryKey: jobQueryKeys.all,
    queryFn: () => JobsAPIClient.list(),
    refetchInterval: 1_200,
    staleTime: 1_200,
  });
}

export function useProjectOsJobQuery(jobId: string | null) {
  return useQuery<ProjectOsJob>({
    queryKey: jobQueryKeys.job(jobId),
    queryFn: () => JobsAPIClient.get(jobId || ''),
    enabled: Boolean(jobId),
    refetchInterval: 1_200,
  });
}

export function useActiveProjectOsJob(types: string[] = []) {
  const jobsQuery = useProjectOsJobsQuery();
  const activeJob = latestActiveJob(jobsQuery.data ?? [], types) as ProjectOsJob | null;
  return {
    ...jobsQuery,
    activeJob,
    activeJobs: activeJobs(jobsQuery.data ?? [], types) as ProjectOsJob[],
  };
}

export function useGlobalActiveProjectOsJob() {
  return useActiveProjectOsJob([
    ...JOB_FAMILIES.appLifecycle,
    ...JOB_FAMILIES.backup,
  ]);
}

export function setProjectOsJobCache(queryClient: QueryClient, job?: ProjectOsJob | null) {
  if (!job) {
    return;
  }
  queryClient.setQueryData(jobQueryKeys.job(job.jobId), job);
  queryClient.setQueryData<ProjectOsJob[] | undefined>(jobQueryKeys.all, (current) => upsertJob(current, job));
}

export function invalidateProjectOsJobs(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: jobQueryKeys.all });
}

export function useProjectOsJobCache() {
  const queryClient = useQueryClient();
  return {
    invalidateJobs: () => invalidateProjectOsJobs(queryClient),
    setJob: (job?: ProjectOsJob | null) => setProjectOsJobCache(queryClient, job),
  };
}

function upsertJob(current: ProjectOsJob[] | undefined, job: ProjectOsJob) {
  const jobs = current ?? [];
  const found = jobs.some((candidate) => candidate.jobId === job.jobId);
  if (!found) {
    return [job, ...jobs];
  }
  return jobs.map((candidate) => candidate.jobId === job.jobId ? job : candidate);
}
