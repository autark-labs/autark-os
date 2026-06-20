import { httpClient } from './httpClient';
import type { BackupReport, BackupRunResult, BackupVerificationResult, RestorePlan, RestoreResult } from '@/types/backup';

export const BackupAPIClient = {
  async report() {
    const response = await httpClient.get<BackupReport>('/api/backups');
    return response.data;
  },

  async run(appId: string) {
    const response = await httpClient.post<BackupRunResult>(`/api/backups/apps/${appId}/run`);
    return response.data;
  },

  async runFull() {
    const response = await httpClient.post<BackupRunResult>('/api/backups/full/run');
    return response.data;
  },

  async runRoutine() {
    const response = await httpClient.post<BackupRunResult>('/api/backups/routine/run');
    return response.data;
  },

  async restorePlan(restorePointId: number, appId?: string | null) {
    const response = await httpClient.get<RestorePlan>(`/api/backups/restore-points/${restorePointId}/plan`, { params: appId ? { appId } : undefined });
    return response.data;
  },

  async verify(restorePointId: number) {
    const response = await httpClient.post<BackupVerificationResult>(`/api/backups/restore-points/${restorePointId}/verify`);
    return response.data;
  },

  async restore(restorePointId: number, appId?: string | null) {
    const response = await httpClient.post<RestoreResult>(`/api/backups/restore-points/${restorePointId}/restore`, { appId: appId || null });
    return response.data;
  },
};
