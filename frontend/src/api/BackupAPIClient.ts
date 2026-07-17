import { httpClient } from './httpClient';
import type { AutarkOsJob } from '@/types/jobs';
import type { BackupDestination, BackupReport, RestorePlan } from '@/types/backup';

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

  async run(appId: string) {
    const response = await httpClient.post<AutarkOsJob>(`/api/backups/apps/${appId}/run`);
    return response.data;
  },

  async runFull() {
    const response = await httpClient.post<AutarkOsJob>('/api/backups/full/run');
    return response.data;
  },

  async runRoutine() {
    const response = await httpClient.post<AutarkOsJob>('/api/backups/routine/run');
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
