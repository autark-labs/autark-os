import { useEffect, useState } from 'react';
import { latestActiveJob, terminalJob, useAutarkOsJobQuery, useAutarkOsJobsQuery } from '@/repositories/jobRepository';
import type { AutarkOsJob } from '@/types/jobs';

type DiscoverJobTrackingOptions = {
  onInstallSubjectRecovered: (appId: string) => void;
  refreshDiscover: () => Promise<unknown>;
};

/** Keep identities locally; the shared job cache owns progress and terminal results. */
export function useDiscoverJobTracking({ onInstallSubjectRecovered, refreshDiscover }: DiscoverJobTrackingOptions) {
  const [installJobId, setInstallJobId] = useState<string | null>(null);
  const [backupJobId, setBackupJobId] = useState<string | null>(null);
  const jobsQuery = useAutarkOsJobsQuery();
  const recoveredInstallJob = latestActiveJob(jobsQuery.data, ['install_app']);
  const recoveredBackupJob = latestActiveJob(jobsQuery.data, ['backup']);
  const installJobQuery = useAutarkOsJobQuery(installJobId ?? recoveredInstallJob?.jobId ?? null, jobsQuery.data);
  const backupJobQuery = useAutarkOsJobQuery(backupJobId ?? recoveredBackupJob?.jobId ?? null, jobsQuery.data);
  const installJob = installJobQuery.data ?? null;
  const backupJob = backupJobQuery.data ?? null;
  const activeInstallId = installJob && !terminalJob(installJob) ? installJob.jobId : recoveredInstallJob?.jobId;
  const activeInstallSubject = installJob && !terminalJob(installJob) ? installJob.subjectId : recoveredInstallJob?.subjectId;
  const activeBackupId = backupJob && !terminalJob(backupJob) ? backupJob.jobId : recoveredBackupJob?.jobId;

  useEffect(() => {
    if (!activeInstallId) return;
    setInstallJobId(activeInstallId);
    if (activeInstallSubject) onInstallSubjectRecovered(activeInstallSubject);
  }, [activeInstallId, activeInstallSubject, onInstallSubjectRecovered]);

  useEffect(() => {
    if (activeBackupId) setBackupJobId(activeBackupId);
  }, [activeBackupId]);

  const completedInstallId = installJob && terminalJob(installJob) ? installJob.jobId : null;
  const completedBackupId = backupJob && terminalJob(backupJob) ? backupJob.jobId : null;
  useEffect(() => {
    if (completedInstallId || completedBackupId) void refreshDiscover();
  }, [completedInstallId, completedBackupId, refreshDiscover]);

  return {
    progressError: installJobQuery.error || backupJobQuery.error || jobsQuery.error,
    retryProgress: () => Promise.all([jobsQuery.refetch(),
      ...(installJobId && !jobsQuery.data?.some(job => job.jobId === installJobId) ? [installJobQuery.refetch()] : []),
      ...(backupJobId && !jobsQuery.data?.some(job => job.jobId === backupJobId) ? [backupJobQuery.refetch()] : []),
    ]),
    backupJob,
    installJob,
    setBackupJob: (job: AutarkOsJob) => setBackupJobId(job.jobId),
    setInstallJob: (job: AutarkOsJob) => setInstallJobId(job.jobId),
  };
}
