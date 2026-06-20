import { httpClient } from './httpClient';
import type { MonitoringDiagnostics, MonitoringHistory } from '@/types/monitoring';

export const MonitoringAPIClient = {
  async history(windowMinutes = 60) {
    const response = await httpClient.get<MonitoringHistory>('/api/monitoring/history', { params: { windowMinutes } });
    return response.data;
  },

  async diagnostics(windowMinutes = 60) {
    const response = await httpClient.get<MonitoringDiagnostics>('/api/monitoring/diagnostics', { params: { windowMinutes } });
    return response.data;
  },
};
