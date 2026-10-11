import { httpClient } from './httpClient';
import type { AutarkOsJob } from '@/types/jobs';
import type { BackupDestination, BackupReport, RestorePlan, BackupPlan, BackupReviewRequest } from '@/types/backup';

export const BackupAPIClient = {
  async report() {
    const response = await httpClient.get<BackupReport>('/api/backups');
    return response.data;
  },

  async destination() {
    const response = await httpClient.get<BackupDestination>('/api/backups/destination');
    return response.data;
  },

  async previewDestination(path: string) {
    const response = await httpClient.post<BackupDestination>('/api/backups/destination/preview', { path });
    return response.data;
  },

  async configureDestination(path: string) {
    const response = await httpClient.post<BackupDestination>('/api/backups/destination', { path });
    return response.data;
  },

  async plan(request: BackupReviewRequest) {
    const response = await httpClient.get<BackupPlan>('/api/backups/plan', { params: request });
    return response.data;
  },

  async run(appId: string, planId: string) {
    const response = await httpClient.post<AutarkOsJob>(`/api/backups/apps/${appId}/run`, { planId });
    return response.data;
  },

  async runFull(planId: string) {
    const response = await httpClient.post<AutarkOsJob>('/api/backups/full/run', { planId });
    return response.data;
  },

  async runRoutine(planId: string) {
    const response = await httpClient.post<AutarkOsJob>('/api/backups/routine/run', { planId });
    return response.data;
  },

  async restorePlan(restorePointId: number, appId?: string | null) {
    const response = await httpClient.get<RestorePlan>(`/api/backups/restore-points/${restorePointId}/plan`, { params: appId ? { appId } : undefined });
    return response.data;
  },

  async verify(restorePointId: number) {
    const response = await httpClient.post<AutarkOsJob>(`/api/backups/restore-points/${restorePointId}/verify`);
    return response.data;
  },

  async restore(restorePointId: number, appId?: string | null) {
    const response = await httpClient.post<AutarkOsJob>(`/api/backups/restore-points/${restorePointId}/restore`, { appId: appId || null });
    return response.data;
  },
};
