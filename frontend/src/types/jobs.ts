export type AutarkOsJobStep = {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped' | string;
  message: string;
  startedAt?: string | null;
  finishedAt?: string | null;
};

export type AutarkOsJobError = {
  code: string;
  message: string;
  advancedDetails: Record<string, string>;
};

export type AutarkOsJob = {
  jobId: string;
  type: 'install_app' | 'repair_app' | 'start_app' | 'stop_app' | 'restart_app' | 'backup' | 'restore' | 'update_app' | 'rollback_app' | string;
  subjectId?: string | null;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | string;
  currentStep?: string | null;
  steps: AutarkOsJobStep[];
  createdAt: string;
  updatedAt: string;
  error?: AutarkOsJobError | null;
};
