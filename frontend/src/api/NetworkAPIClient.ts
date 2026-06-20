import { httpClient } from './httpClient';
import type { DeviceAccessReport, DeviceTrustMetadata, DeviceTrustUpdateRequest, NetworkDiagnosticsReport, PrivateAccessReconciliationReport, SystemSetupStatus, TailscaleConnectGuide, TailscaleDevice, TailscaleServeResult, TailscaleStatus } from '@/types/network';

export const NetworkAPIClient = {
  async tailscaleStatus() {
    const response = await httpClient.get<TailscaleStatus>('/api/network/tailscale/status');
    return response.data;
  },

  async tailscaleDevices() {
    const response = await httpClient.get<TailscaleDevice[]>('/api/network/tailscale/devices');
    return response.data;
  },

  async deviceAccessReport() {
    const response = await httpClient.get<DeviceAccessReport>('/api/network/devices/access');
    return response.data;
  },

  async updateDeviceTrust(deviceId: string, request: DeviceTrustUpdateRequest) {
    const response = await httpClient.put<DeviceTrustMetadata>(`/api/network/devices/${encodeURIComponent(deviceId)}/metadata`, request);
    return response.data;
  },

  async diagnostics() {
    const response = await httpClient.get<NetworkDiagnosticsReport>('/api/network/diagnostics');
    return response.data;
  },

  async privateAccessReconciliation() {
    const response = await httpClient.get<PrivateAccessReconciliationReport>('/api/network/private-access/reconciliation');
    return response.data;
  },

  async removeStalePrivateAccess(port: number) {
    const response = await httpClient.delete<TailscaleServeResult>(`/api/network/private-access/stale/${port}`);
    return response.data;
  },

  async connectGuide() {
    const response = await httpClient.get<TailscaleConnectGuide>('/api/network/tailscale/connect-guide');
    return response.data;
  },

  async setupStatus() {
    const response = await httpClient.get<SystemSetupStatus>('/api/system/setup-status');
    return response.data;
  },
};
