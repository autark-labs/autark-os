import { httpClient } from './httpClient';

export type AdminSecurityStatus = {
  devMode: boolean;
  claimed: boolean;
  authRequired: boolean;
  message: string;
  setupCode: string;
};

export type AdminSecuritySession = {
  authorized: boolean;
  token: string;
  message: string;
};

export const AdminSecurityAPIClient = {
  async status() {
    const response = await httpClient.get<AdminSecurityStatus>('/api/admin/security/status');
    return response.data;
  },

  async claim(setupCode: string, password: string) {
    const response = await httpClient.post<AdminSecuritySession>('/api/admin/security/claim', { setupCode, password });
    return response.data;
  },

  async login(password: string) {
    const response = await httpClient.post<AdminSecuritySession>('/api/admin/security/login', { password });
    return response.data;
  },
};
