import axios from 'axios';
import { applyAdminAuthHeader } from '@/lib/adminSecuritySession';

export const httpClient = axios.create({
  headers: {
    'Content-Type': 'application/json',
  },
});

httpClient.interceptors.request.use((config) => applyAdminAuthHeader(config));

export function apiErrorMessage(error: unknown, fallback = 'Something went wrong.') {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      const backendUrl = import.meta.env.VITE_PROJECT_OS_BACKEND_URL || 'http://localhost:8082';
      return `Project OS could not reach the local backend. Make sure the backend is running at ${backendUrl}, then try again.`;
    }
    const data = error.response?.data as { message?: string } | undefined;
    return data?.message || error.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}
