import { httpClient } from './httpClient';
import type { HostInventoryActionResult, HostInventoryResource } from '@/types/host';

export const HostInventoryAPIClient = {
  async list(includeIgnored = false) {
    const response = await httpClient.get<HostInventoryResource[]>('/api/host/inventory', { params: { includeIgnored } });
    return response.data;
  },

  async fixture() {
    const response = await httpClient.get<HostInventoryResource[]>('/api/dev/host-inventory-fixture');
    return response.data;
  },

  async ignore(resourceId: string) {
    const response = await httpClient.post<HostInventoryActionResult>(`/api/host/inventory/${encodeURIComponent(resourceId)}/ignore`);
    return response.data;
  },

  async unignore(resourceId: string) {
    const response = await httpClient.delete<HostInventoryActionResult>(`/api/host/inventory/${encodeURIComponent(resourceId)}/ignore`);
    return response.data;
  },
};
