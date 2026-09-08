import axios from 'axios';
import { httpClient } from './httpClient';
import type { AppAccessCheck, AppActionResult, AppHealthSnapshot, AppInstanceView, AppReliabilitySummary, AppRuntimeView, AppSettingsChangePlan, AppTelemetry, AppUpdatePlan, InstallSettings, UninstallPlan } from '@/types/app';
import type { AutarkOsJob } from '@/types/jobs';

export type InstalledAppLifecycleAction = 'start' | 'stop' | 'restart';
export type InstalledAppAction = InstalledAppLifecycleAction | 'repair';

export class AppUpdatePlanChangedError extends Error {
  constructor(readonly plan: AppUpdatePlan) {
    super(plan.summary || 'The app release plan changed.');
    this.name = 'AppUpdatePlanChangedError';
  }
}

export const InstalledAppsAPIClient = {
  async listApps() {
    const response = await httpClient.get<AppRuntimeView[]>('/api/apps');
    return response.data;
  },

  async listAppInstances() {
    const response = await httpClient.get<AppInstanceView[]>('/api/app-instances');
    return response.data;
  },

  async accessChecks() {
    const response = await httpClient.get<Record<string, AppAccessCheck>>('/api/apps/access');
    return response.data;
  },

  async telemetry() {
    const response = await httpClient.get<Record<string, AppTelemetry>>('/api/apps/telemetry');
    return response.data;
  },

  async healthSnapshots() {
    const response = await httpClient.get<Record<string, AppHealthSnapshot>>('/api/apps/health');
    return response.data;
  },

  async reliabilitySummary() {
    const response = await httpClient.get<AppReliabilitySummary>('/api/apps/reliability');
    return response.data;
  },

  async appTelemetry(appId: string) {
    const response = await httpClient.get<AppTelemetry>(`/api/apps/${appId}/telemetry`);
    return response.data;
  },

  async appHealthSnapshot(appId: string) {
    const response = await httpClient.get<AppHealthSnapshot>(`/api/apps/${appId}/health`);
    return response.data;
  },

  async uninstallPlan(appId: string) {
    const response = await httpClient.get<UninstallPlan>(`/api/apps/${appId}/uninstall-plan`);
    return response.data;
  },

  async updatePlan(appId: string) {
    const response = await httpClient.get<AppUpdatePlan>(`/api/apps/${appId}/update-plan`);
    return response.data;
  },

  async rollbackPlan(appId: string) {
    const response = await httpClient.get<AppUpdatePlan>(`/api/apps/${appId}/rollback-plan`);
    return response.data;
  },

  async update(appId: string, planId: string) {
    try {
      const response = await httpClient.post<AutarkOsJob>(`/api/apps/${appId}/update`, { planId });
      return response.data;
    } catch (error) {
      throwUpdatePlanConflict(error);
    }
  },

  async rollback(appId: string, planId: string) {
    try {
      const response = await httpClient.post<AutarkOsJob>(`/api/apps/${appId}/rollback`, { planId });
      return response.data;
    } catch (error) {
      throwUpdatePlanConflict(error);
    }
  },

  async runAction(appId: string, action: InstalledAppLifecycleAction) {
    const response = await httpClient.post<AutarkOsJob>(`/api/apps/${appId}/${action}`);
    return response.data;
  },

  async repair(appId: string) {
    const response = await httpClient.post<AutarkOsJob>(`/api/apps/${appId}/repair`);
    return response.data;
  },

  async enablePrivateAccess(appId: string) {
    const response = await httpClient.post<AppActionResult>(`/api/apps/${appId}/private-access/enable`);
    return response.data;
  },

  async repairPrivateAccess(appId: string) {
    const response = await httpClient.post<AppActionResult>(`/api/apps/${appId}/private-access/repair`);
    return response.data;
  },

  async disablePrivateAccess(appId: string) {
    const response = await httpClient.post<AppActionResult>(`/api/apps/${appId}/private-access/disable`);
    return response.data;
  },

  async updateSettings(appId: string, settings: InstallSettings) {
    const response = await httpClient.put<AutarkOsJob>(`/api/apps/${appId}/settings`, settings);
    return response.data;
  },

  async settingsChangePlan(appId: string, settings: InstallSettings) {
    const response = await httpClient.post<AppSettingsChangePlan>(`/api/apps/${appId}/settings-plan`, settings);
    return response.data;
  },

  async uninstall(appId: string) {
    const response = await httpClient.post<AutarkOsJob>(`/api/apps/${appId}/uninstall`);
    return response.data;
  },
};

function throwUpdatePlanConflict(error: unknown): never {
  if (axios.isAxiosError(error) && error.response?.status === 409 && isAppUpdatePlan(error.response.data)) {
    throw new AppUpdatePlanChangedError(error.response.data);
  }
  throw error;
}

function isAppUpdatePlan(value: unknown): value is AppUpdatePlan {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const plan = value as Partial<AppUpdatePlan>;
  return typeof plan.appId === 'string'
    && (plan.operation === 'update' || plan.operation === 'rollback')
    && typeof plan.canApply === 'boolean'
    && typeof plan.headline === 'string'
    && typeof plan.summary === 'string'
    && Array.isArray(plan.blockedReasons)
    && typeof plan.guardianAdvice === 'object'
    && plan.guardianAdvice !== null;
}
