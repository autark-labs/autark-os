import type { ProEntitlementStatus, ProModuleStatus } from '@/types/pro';
import type { AutarkOsJob } from '@/types/jobs';
import { httpClient } from './httpClient';

export interface ProStatusResponse {
  schemaVersion: '1';
  entitlement: ProEntitlementStatus;
  device: {
    deviceId: string;
    installationId: string;
    publicKeyFingerprint: string;
    registered: boolean;
  };
  activation: {
    state: 'idle' | 'ready_to_complete' | 'completing';
    activationId: string | null;
    expiresAt: string | null;
  };
  module: ProModuleStatus;
  refresh: {
    inProgress: boolean;
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    nextAttemptAt: string | null;
    lastFailureCategory: string | null;
    consecutiveFailures: number;
  };
}

export interface ProActivationStartResult {
  schemaVersion: '1';
  activationId: string;
  expiresAt: string;
  publicKeyFingerprint: string;
  message: string;
}

export const ProAPIClient = {
  async status() {
    const response = await httpClient.get<unknown>('/api/v1/pro/status');
    return parseProStatusResponse(response.data);
  },

  async startActivation(activationCode: string) {
    const response = await httpClient.post<ProActivationStartResult>(
      '/api/v1/pro/activation/start',
      { activationCode },
    );
    return response.data;
  },

  async completeActivation(activationId: string) {
    const response = await httpClient.post<unknown>(
      '/api/v1/pro/activation/complete',
      { activationId },
    );
    return parseProStatusResponse(response.data);
  },

  async refreshEntitlement() {
    const response = await httpClient.post<unknown>(
      '/api/v1/pro/entitlement/refresh',
    );
    return parseProStatusResponse(response.data);
  },

  async checkModuleRelease() {
    const response = await httpClient.post<AutarkOsJob>('/api/v1/pro/module/check');
    return response.data;
  },

  async installOrUpdateModule() {
    const response = await httpClient.post<AutarkOsJob>('/api/v1/pro/module/install');
    return response.data;
  },

  async removeModule() {
    const response = await httpClient.post<AutarkOsJob>('/api/v1/pro/module/remove');
    return response.data;
  },
};

const entitlementStates = new Set([
  'NOT_ACTIVATED', 'ACTIVATING', 'ACTIVE', 'ONLINE_GRACE', 'RETAINED_USE',
  'SUSPENDED_ONLINE', 'REVOKED', 'INVALID', 'ERROR',
]);
const moduleStates = new Set([
  'NOT_INSTALLED', 'RELEASE_AVAILABLE', 'DOWNLOADING', 'VERIFYING',
  'STARTING_CANDIDATE', 'HEALTH_CHECKING', 'ACTIVE', 'DEGRADED',
  'ROLLING_BACK', 'RETAINED_USE', 'UPDATE_INELIGIBLE', 'REMOVING', 'ERROR',
]);
const healthStates = new Set(['not-checked', 'healthy', 'degraded', 'failed']);
const activationStates = new Set(['idle', 'ready_to_complete', 'completing']);

export function parseProStatusResponse(value: unknown): ProStatusResponse {
  if (!isRecord(value)
    || value.schemaVersion !== '1'
    || !validEntitlement(value.entitlement)
    || !validDevice(value.device)
    || !validActivation(value.activation)
    || !validModule(value.module)
    || !validRefresh(value.refresh)) {
    throw new TypeError('The local extension status is invalid.');
  }
  return value as unknown as ProStatusResponse;
}

function validEntitlement(value: unknown) {
  if (!isRecord(value)
    || value.schemaVersion !== '1'
    || typeof value.state !== 'string'
    || !entitlementStates.has(value.state)
    || !nullableString(value.plan)
    || !Array.isArray(value.features)
    || value.features.length > 64
    || value.features.some((feature) => typeof feature !== 'string'
      || !/^[a-z][a-z0-9.-]{1,127}$/.test(feature))
    || new Set(value.features).size !== value.features.length
    || !nullableString(value.updatesThrough)
    || !nullableString(value.serviceLeaseExpiresAt)
    || !nullableString(value.lastVerifiedServerTime)
    || typeof value.localUseAllowed !== 'boolean'
    || typeof value.updatesAllowed !== 'boolean'
    || typeof value.hostedServicesAllowed !== 'boolean'
    || !nullableString(value.grantFingerprint)
    || typeof value.reasonCode !== 'string'
    || !/^[a-z][a-z0-9_]{0,63}$/.test(value.reasonCode)) return false;
  return true;
}

function validDevice(value: unknown) {
  return isRecord(value)
    && typeof value.deviceId === 'string'
    && typeof value.installationId === 'string'
    && typeof value.publicKeyFingerprint === 'string'
    && typeof value.registered === 'boolean';
}

function validActivation(value: unknown) {
  return isRecord(value)
    && typeof value.state === 'string'
    && activationStates.has(value.state)
    && nullableString(value.activationId)
    && nullableString(value.expiresAt);
}

function validModule(value: unknown) {
  return isRecord(value)
    && typeof value.state === 'string'
    && moduleStates.has(value.state)
    && nullableString(value.componentVersion)
    && nullableString(value.activeDigest)
    && nullableString(value.previousDigest)
    && typeof value.health === 'string'
    && healthStates.has(value.health)
    && nullableString(value.jobId)
    && nullableString(value.errorCode);
}

function validRefresh(value: unknown) {
  return isRecord(value)
    && typeof value.inProgress === 'boolean'
    && nullableString(value.lastAttemptAt)
    && nullableString(value.lastSuccessAt)
    && nullableString(value.nextAttemptAt)
    && nullableString(value.lastFailureCategory)
    && Number.isInteger(value.consecutiveFailures)
    && Number(value.consecutiveFailures) >= 0;
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
