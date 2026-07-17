import axios from 'axios';
import { notifyAdminSessionExpired } from '@/lib/adminSecuritySession';

export const httpClient = axios.create({
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

httpClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401 && !isLoginRequest(error.config?.url)) {
      notifyAdminSessionExpired();
    }
    return Promise.reject(error);
  },
);

function isLoginRequest(url: string | undefined) {
  return Boolean(
    url?.includes('/api/admin/security/status')
    || url?.includes('/api/admin/security/session')
    || url?.includes('/api/admin/security/login')
    || url?.includes('/api/admin/security/claim'),
  );
}

export function apiErrorMessage(error: unknown, fallback = 'Something went wrong.') {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      const backendUrl = import.meta.env.VITE_AUTARK_OS_BACKEND_URL || 'http://localhost:8082';
      return `Autark-OS could not reach the local backend. Make sure the backend is running at ${backendUrl}, then try again.`;
    }
    const data = error.response?.data as { message?: string } | undefined;
    return data?.message || error.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}
