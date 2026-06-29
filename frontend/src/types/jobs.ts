export type ProjectOsJobStep = {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped' | string;
  message: string;
  startedAt?: string | null;
  finishedAt?: string | null;
};

export type ProjectOsJobError = {
  code: string;
  message: string;
  advancedDetails: Record<string, string>;
};

export type ProjectOsJob = {
  jobId: string;
  type: 'install_app' | 'repair_app' | 'start_app' | 'stop_app' | 'restart_app' | 'backup' | 'restore' | 'update_app' | string;
  subjectId?: string | null;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | string;
  currentStep?: string | null;
  steps: ProjectOsJobStep[];
  createdAt: string;
  updatedAt: string;
  error?: ProjectOsJobError | null;
};
