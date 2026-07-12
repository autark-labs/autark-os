import { useEffect, useMemo, useState } from 'react';
import { apiErrorMessage } from '@/api/httpClient';
import {
  latestActiveDiscoverJob,
  useDiscoverJobQuery,
  useDiscoverJobsQuery,
} from '@/repositories/discoverRepository';
import { terminalJob } from '@/repositories/jobRepository';
import type { AutarkOsJob } from '@/types/jobs';

type DiscoverJobTrackingOptions = {
  onError: (message: string) => void;
  onInstallSubjectRecovered: (appId: string) => void;
  refreshDiscover: () => Promise<unknown>;
};

/**
 * Tracks durable Discover jobs independently of the current page instance.
 * A refreshed or reopened page resumes the active install or backup instead
 * of losing user-visible progress.
 */
export function useDiscoverJobTracking({ onError, onInstallSubjectRecovered, refreshDiscover }: DiscoverJobTrackingOptions) {
  const [installJob, setInstallJob] = useState<AutarkOsJob | null>(null);
  const [backupJob, setBackupJob] = useState<AutarkOsJob | null>(null);
  const jobsQuery = useDiscoverJobsQuery();
  const recoveredInstallJob = useMemo(
    () => latestActiveDiscoverJob(jobsQuery.data ?? [], ['install_app']),
    [jobsQuery.data],
  );
  const recoveredBackupJob = useMemo(
    () => latestActiveDiscoverJob(jobsQuery.data ?? [], ['backup']),
    [jobsQuery.data],
  );
  const trackedInstallJob = trackedDiscoverJob(installJob, recoveredInstallJob);
  const trackedBackupJob = trackedDiscoverJob(backupJob, recoveredBackupJob);
  const activeInstallJobId = trackedInstallJob && !terminalJob(trackedInstallJob) ? trackedInstallJob.jobId : null;
  const activeBackupJobId = trackedBackupJob && !terminalJob(trackedBackupJob) ? trackedBackupJob.jobId : null;
  const installJobQuery = useDiscoverJobQuery(activeInstallJobId);
  const backupJobQuery = useDiscoverJobQuery(activeBackupJobId);

  useEffect(() => {
    if (!recoveredInstallJob || (installJob && !terminalJob(installJob))) return;
    setInstallJob(recoveredInstallJob);
    if (recoveredInstallJob.subjectId) onInstallSubjectRecovered(recoveredInstallJob.subjectId);
  }, [installJob, onInstallSubjectRecovered, recoveredInstallJob]);

  useEffect(() => {
    if (!recoveredBackupJob || (backupJob && !terminalJob(backupJob))) return;
    setBackupJob(recoveredBackupJob);
  }, [backupJob, recoveredBackupJob]);

  useEffect(() => {
    if (!installJobQuery.data) return;
    setInstallJob(installJobQuery.data);
    if (terminalJob(installJobQuery.data)) void refreshDiscover();
  }, [installJobQuery.data, refreshDiscover]);

  useEffect(() => {
    if (installJobQuery.error) onError(apiErrorMessage(installJobQuery.error, 'Install progress could not be refreshed.'));
  }, [installJobQuery.error, onError]);

  useEffect(() => {
    if (!backupJobQuery.data) return;
    setBackupJob(backupJobQuery.data);
    if (terminalJob(backupJobQuery.data)) void refreshDiscover();
  }, [backupJobQuery.data, refreshDiscover]);

  useEffect(() => {
    if (backupJobQuery.error) onError(apiErrorMessage(backupJobQuery.error, 'Backup progress could not be refreshed.'));
  }, [backupJobQuery.error, onError]);

  return {
    backupJob,
    installJob,
    setBackupJob,
    setInstallJob,
  };
}

export function trackedDiscoverJob(localJob: AutarkOsJob | null, recoveredJob: AutarkOsJob | null) {
  return localJob && !terminalJob(localJob) ? localJob : recoveredJob ?? localJob;
}
