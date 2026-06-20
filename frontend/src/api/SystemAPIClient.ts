import { httpClient } from './httpClient';
import type { OnboardingState, OnboardingUpdateRequest, ProjectSettings, ProjectVersionInfo, RuntimeMigrationPlan, RuntimeMigrationPlanRequest, StorageCleanupResult, StorageReport, SupportBundle, SupportLogLine, SupportSummary, SystemDoctorStatus, SystemMetrics, SystemSetupStatus } from '@/types/system';

export const SystemAPIClient = {
  async setupStatus() {
    const response = await httpClient.get<SystemSetupStatus>('/api/system/setup-status');
    return response.data;
  },

  async doctor() {
    const response = await httpClient.get<SystemDoctorStatus>('/api/system/doctor');
    return response.data;
  },

  async repairSupported() {
    const response = await httpClient.post<SystemDoctorStatus>('/api/system/doctor/repair-supported');
    return response.data;
  },

  async onboarding() {
    const response = await httpClient.get<OnboardingState>('/api/system/onboarding');
    return response.data;
  },

  async updateOnboarding(request: OnboardingUpdateRequest) {
    const response = await httpClient.put<OnboardingState>('/api/system/onboarding', request);
    return response.data;
  },

  async completeOnboarding() {
    const response = await httpClient.post<OnboardingState>('/api/system/onboarding/complete');
    return response.data;
  },

  async metrics() {
    const response = await httpClient.get<SystemMetrics>('/api/system/metrics');
    return response.data;
  },

  async storage() {
    const response = await httpClient.get<StorageReport>('/api/system/storage');
    return response.data;
  },

  async cleanupOrphan(name: string) {
    const response = await httpClient.post<StorageCleanupResult>(`/api/system/storage/orphans/${encodeURIComponent(name)}/cleanup`);
    return response.data;
  },

  async runtimeMigrationPlan(request: RuntimeMigrationPlanRequest) {
    const response = await httpClient.post<RuntimeMigrationPlan>('/api/system/storage/migration/plan', request);
    return response.data;
  },

  async settings() {
    const response = await httpClient.get<ProjectSettings>('/api/system/settings');
    return response.data;
  },

  async version() {
    const response = await httpClient.get<ProjectVersionInfo>('/api/system/version');
    return response.data;
  },

  async updateSettings(settings: ProjectSettings) {
    const response = await httpClient.put<ProjectSettings>('/api/system/settings', settings);
    return response.data;
  },

  async supportSummary() {
    const response = await httpClient.get<SupportSummary>('/api/system/support/summary');
    return response.data;
  },

  async supportLogs(limit = 120) {
    const response = await httpClient.get<SupportLogLine[]>('/api/system/support/logs', { params: { limit } });
    return response.data;
  },

  async supportBundle() {
    const response = await httpClient.get<SupportBundle>('/api/system/support/bundle');
    return response.data;
  },
};
