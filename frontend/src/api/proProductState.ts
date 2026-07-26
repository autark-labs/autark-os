import { httpClient } from './httpClient';

/**
 * Generated shape for docs/pro/contracts/pro-product-state-v1.schema.json.
 * Schema SHA-256: 9333c01b96f9843eb46132cfbe2d25f0aaf5b829c2ae6d122c1bf5d0e95f3ca3.
 */
export type ProProductState = {
  schemaVersion: '1';
  overallStatus: 'available' | 'partial' | 'stale' | 'unavailable' | 'retained_use' | 'incompatible' | 'error';
  softwareEntitlement: {
    state: 'absent' | 'activating' | 'active' | 'grace' | 'retained_use' | 'suspended' | 'revoked' | 'invalid' | 'error';
    localUseAllowed: boolean;
    updatesAllowed: boolean;
    updatesThrough: string | null;
    reasonCode: string;
  };
  hostedServices: {
    state: 'unavailable' | 'active' | 'grace' | 'expired' | 'suspended' | 'revoked' | 'error';
    allowed: boolean;
    servicesThrough: string | null;
    lastVerifiedAt: string | null;
    reasonCode: string;
  };
  agent: {
    state: 'not_installed' | 'release_available' | 'installing' | 'active' | 'degraded' | 'retained_use' | 'update_ineligible' | 'removing' | 'error';
    health: 'not_checked' | 'healthy' | 'degraded' | 'failed' | 'stale';
    compatibility: 'compatible' | 'incompatible' | 'unknown';
    componentVersion: string | null;
    digestPrefix: string | null;
    lastTransitionAt: string | null;
    reasonCode: string;
  };
  guardian: {
    state: 'unavailable' | 'idle' | 'scheduled' | 'running' | 'healthy' | 'stale' | 'error';
    schedulerState: 'unavailable' | 'idle' | 'scheduled' | 'running' | 'error';
    latestAnalysisHealth: 'unavailable' | 'healthy' | 'stale' | 'error';
    latestAnalysisAt: string | null;
    nextAnalysisAt: string | null;
    reasonCode: string;
  };
  localMobile: {
    state: 'unavailable' | 'unpaired' | 'paired' | 'stale' | 'error';
    pairedDeviceCount: number;
    reasonCode: string;
  };
  hostedMobile: {
    state: 'unavailable' | 'unlinked' | 'linked' | 'expired' | 'error';
    linkedDeviceCount: number;
    relayState: 'unavailable' | 'online' | 'stale' | 'offline' | 'error';
    lastRelayAt: string | null;
    reasonCode: string;
  };
  localCapabilities: string[];
  hostedCapabilities: string[];
  recommendedAction: {
    id: string;
    reasonCode: string;
  };
  checkedAt: string;
};

export const ProProductStateAPIClient = {
  async current() {
    const response = await httpClient.get<unknown>('/api/v1/pro/product-state');
    return parseProProductState(response.data);
  },
};

const overallStates = new Set(['available', 'partial', 'stale', 'unavailable', 'retained_use', 'incompatible', 'error']);
const softwareStates = new Set(['absent', 'activating', 'active', 'grace', 'retained_use', 'suspended', 'revoked', 'invalid', 'error']);
const hostedStates = new Set(['unavailable', 'active', 'grace', 'expired', 'suspended', 'revoked', 'error']);
const agentStates = new Set(['not_installed', 'release_available', 'installing', 'active', 'degraded', 'retained_use', 'update_ineligible', 'removing', 'error']);
const healthStates = new Set(['not_checked', 'healthy', 'degraded', 'failed', 'stale']);
const compatibilityStates = new Set(['compatible', 'incompatible', 'unknown']);
const guardianStates = new Set(['unavailable', 'idle', 'scheduled', 'running', 'healthy', 'stale', 'error']);
const guardianSchedulerStates = new Set(['unavailable', 'idle', 'scheduled', 'running', 'error']);
const analysisHealthStates = new Set(['unavailable', 'healthy', 'stale', 'error']);
const localMobileStates = new Set(['unavailable', 'unpaired', 'paired', 'stale', 'error']);
const hostedMobileStates = new Set(['unavailable', 'unlinked', 'linked', 'expired', 'error']);
const relayStates = new Set(['unavailable', 'online', 'stale', 'offline', 'error']);
const reasonPattern = /^[a-z][a-z0-9_]{0,63}$/;
const capabilityPattern = /^[a-z][a-z0-9.-]{1,127}$/;

export function parseProProductState(value: unknown): ProProductState {
  if (!isRecord(value)
    || !hasOnlyKeys(value, [
      'schemaVersion', 'overallStatus', 'softwareEntitlement', 'hostedServices',
      'agent', 'guardian', 'localMobile', 'hostedMobile', 'localCapabilities',
      'hostedCapabilities', 'recommendedAction', 'checkedAt',
    ])
    || value.schemaVersion !== '1'
    || !stringIn(value.overallStatus, overallStates)
    || !validSoftware(value.softwareEntitlement)
    || !validHosted(value.hostedServices)
    || !validAgent(value.agent)
    || !validGuardian(value.guardian)
    || !validLocalMobile(value.localMobile)
    || !validHostedMobile(value.hostedMobile)
    || !validCapabilities(value.localCapabilities)
    || !validCapabilities(value.hostedCapabilities)
    || !validAction(value.recommendedAction)
    || !validTimestamp(value.checkedAt)) {
    throw new TypeError('The local Pro product state is invalid.');
  }
  return value as unknown as ProProductState;
}

function validSoftware(value: unknown) {
  return isRecord(value)
    && hasOnlyKeys(value, ['state', 'localUseAllowed', 'updatesAllowed', 'updatesThrough', 'reasonCode'])
    && stringIn(value.state, softwareStates)
    && typeof value.localUseAllowed === 'boolean'
    && typeof value.updatesAllowed === 'boolean'
    && nullableTimestamp(value.updatesThrough)
    && validReason(value.reasonCode);
}

function validHosted(value: unknown) {
  return isRecord(value)
    && hasOnlyKeys(value, ['state', 'allowed', 'servicesThrough', 'lastVerifiedAt', 'reasonCode'])
    && stringIn(value.state, hostedStates)
    && typeof value.allowed === 'boolean'
    && nullableTimestamp(value.servicesThrough)
    && nullableTimestamp(value.lastVerifiedAt)
    && validReason(value.reasonCode);
}

function validAgent(value: unknown) {
  return isRecord(value)
    && hasOnlyKeys(value, [
      'state', 'health', 'compatibility', 'componentVersion', 'digestPrefix',
      'lastTransitionAt', 'reasonCode',
    ])
    && stringIn(value.state, agentStates)
    && stringIn(value.health, healthStates)
    && stringIn(value.compatibility, compatibilityStates)
    && nullableBoundedString(value.componentVersion, 64)
    && (value.digestPrefix === null
      || (typeof value.digestPrefix === 'string' && /^sha256:[a-f0-9]{12}$/.test(value.digestPrefix)))
    && nullableTimestamp(value.lastTransitionAt)
    && validReason(value.reasonCode);
}

function validGuardian(value: unknown) {
  return isRecord(value)
    && hasOnlyKeys(value, [
      'state', 'schedulerState', 'latestAnalysisHealth', 'latestAnalysisAt',
      'nextAnalysisAt', 'reasonCode',
    ])
    && stringIn(value.state, guardianStates)
    && stringIn(value.schedulerState, guardianSchedulerStates)
    && stringIn(value.latestAnalysisHealth, analysisHealthStates)
    && nullableTimestamp(value.latestAnalysisAt)
    && nullableTimestamp(value.nextAnalysisAt)
    && validReason(value.reasonCode);
}

function validLocalMobile(value: unknown) {
  return isRecord(value)
    && hasOnlyKeys(value, ['state', 'pairedDeviceCount', 'reasonCode'])
    && stringIn(value.state, localMobileStates)
    && boundedCount(value.pairedDeviceCount)
    && validReason(value.reasonCode);
}

function validHostedMobile(value: unknown) {
  return isRecord(value)
    && hasOnlyKeys(value, ['state', 'linkedDeviceCount', 'relayState', 'lastRelayAt', 'reasonCode'])
    && stringIn(value.state, hostedMobileStates)
    && boundedCount(value.linkedDeviceCount)
    && stringIn(value.relayState, relayStates)
    && nullableTimestamp(value.lastRelayAt)
    && validReason(value.reasonCode);
}

function validCapabilities(value: unknown) {
  return Array.isArray(value)
    && value.length <= 64
    && value.every((item) => typeof item === 'string' && capabilityPattern.test(item))
    && new Set(value).size === value.length;
}

function validAction(value: unknown) {
  return isRecord(value)
    && hasOnlyKeys(value, ['id', 'reasonCode'])
    && typeof value.id === 'string'
    && reasonPattern.test(value.id)
    && validReason(value.reasonCode);
}

function validReason(value: unknown) {
  return typeof value === 'string' && reasonPattern.test(value);
}

function boundedCount(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 64;
}

function stringIn(value: unknown, values: Set<string>): value is string {
  return typeof value === 'string' && values.has(value);
}

function nullableBoundedString(value: unknown, maximumLength: number): value is string | null {
  return value === null || (typeof value === 'string' && value.length <= maximumLength);
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

function nullableTimestamp(value: unknown): value is string | null {
  return value === null || validTimestamp(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]) {
  const allowed = new Set(keys);
  return Object.keys(value).length === keys.length
    && Object.keys(value).every((key) => allowed.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
