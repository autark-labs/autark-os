import { httpClient } from './httpClient';

export type AdminSecurityStatus = {
  devMode: boolean;
  claimed: boolean;
  authRequired: boolean;
  message: string;
  setupCodeCommand: string;
  passwordResetCommand: string;
};

export type AdminSecuritySession = {
  authorized: boolean;
  token: string;
  message: string;
  expiresAt: string | null;
  retryAfterSeconds: number | null;
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

  async session() {
    const response = await httpClient.get<AdminSecuritySession>('/api/admin/security/session', {
      validateStatus: (status) => status === 200 || status === 401,
    });
    return response.data.authorized;
  },

  async logout() {
    await httpClient.post('/api/admin/security/logout');
  },
};
