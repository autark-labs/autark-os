#!/usr/bin/env node

import {
  createHash,
  generateKeyPairSync,
  sign as signBytes,
  verify as verifyBytes,
} from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

export const SCENARIOS = Object.freeze([
  'active',
  'online-grace',
  'retained-use',
  'revoked',
  'invalid-signature',
  'incompatible-agent',
  'failed-health-check',
  'expired-manifest',
  'digest-mismatch',
  'malformed-agent',
]);

const FIXED_NOW = '2026-07-19T12:00:00Z';
const DEVICE_ID = '11111111-1111-4111-8111-111111111111';
const INSTALLATION_ID = '22222222-2222-4222-8222-222222222222';
const GRANT_ID = '33333333-3333-4333-8333-333333333333';
const FINGERPRINT = `sha256:${'a'.repeat(64)}`;
const FEATURES = Object.freeze([
  'autark-pro.extension',
]);

export function createSimulatorState() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicJwk = publicKey.export({ format: 'jwk' });
  const publicFingerprint = `sha256:${createHash('sha256')
    .update(publicJwk.x, 'utf8')
    .digest('hex')}`;
  return Object.freeze({
    keyId: `dev-simulator-ephemeral-${publicFingerprint.slice(-12)}`,
    privateKey,
    publicKey,
    publicJwk,
    publicFingerprint,
  });
}

export function fixtureFor(scenarioName, state) {
  const scenario = normalizeScenario(scenarioName);
  const grant = {
    schemaVersion: '1',
    grantId: GRANT_ID,
    deviceId: DEVICE_ID,
    installationId: INSTALLATION_ID,
    devicePublicKeyFingerprint: FINGERPRINT,
    plan: 'pro_home',
    features: FEATURES,
    releaseChannel: 'staging',
    issuer: 'autark-pro-development-simulator',
    issuedAt: FIXED_NOW,
    updatesThrough: scenario === 'retained-use'
      ? '2026-07-18T12:00:00Z'
      : '2029-07-19T12:00:00Z',
    localUse: 'perpetual',
    keyId: state.keyId,
  };
  const lease = {
    schemaVersion: '1',
    leaseId: '44444444-4444-4444-8444-444444444444',
    grantId: GRANT_ID,
    deviceId: DEVICE_ID,
    devicePublicKeyFingerprint: FINGERPRINT,
    features: FEATURES,
    services: ['release-check', 'registry', 'compatibility-feed'],
    status: scenario === 'revoked' ? 'revoked' : 'active',
    issuer: 'autark-pro-development-simulator',
    issuedAt: FIXED_NOW,
    renewAfter: '2026-07-20T00:00:00Z',
    expiresAt: scenario === 'online-grace'
      ? '2026-07-18T12:00:00Z'
      : '2026-07-20T12:00:00Z',
    serverTime: FIXED_NOW,
    keyId: state.keyId,
  };
  const manifest = {
    schemaVersion: '1',
    sequence: 7,
    createdAt: FIXED_NOW,
    expiresAt: scenario === 'expired-manifest'
      ? '2026-07-18T12:00:00Z'
      : '2026-07-26T12:00:00Z',
    releaseChannel: 'staging',
    component: 'autark-pro-agent',
    version: '0.1.0',
    repository: 'registry.invalid/autark-pro-agent',
    digest: `sha256:${'c'.repeat(64)}`,
    architecture: 'linux/amd64',
    publishedAt: '2026-07-19T11:30:00Z',
    minimumCoreVersion: '0.1.0',
    maximumCoreVersion: null,
    agentApiRange: '1.x',
    rolloutGroup: 'prototype',
    features: FEATURES,
    signingKeyId: state.keyId,
  };
  const durableProductGrant = signDocument(
    grant,
    'autark-pro-grant+jwt',
    state,
  );
  if (scenario === 'invalid-signature') {
    durableProductGrant.signature = mutateSignature(
      durableProductGrant.signature,
    );
  }
  return {
    schemaVersion: '1',
    scenario,
    now: FIXED_NOW,
    publicKey: state.publicJwk,
    publicKeyFingerprint: state.publicFingerprint,
    entitlementStatus: entitlementStatus(scenario, grant, lease),
    moduleState: moduleState(scenario),
    durableProductGrant,
    onlineServiceLease: signDocument(
      lease,
      'autark-pro-service-lease+jwt',
      state,
    ),
    releaseManifest: signDocument(
      manifest,
      'autark-pro-release-manifest+jwt',
      state,
    ),
    observedDigest: scenario === 'digest-mismatch'
      ? `sha256:${'d'.repeat(64)}`
      : manifest.digest,
    expectedFailureCode: expectedFailureCode(scenario),
  };
}

export function verifySimulatorDocument(envelope, publicKey) {
  return verifyBytes(
    null,
    Buffer.from(`${envelope.protected}.${envelope.payload}`, 'ascii'),
    publicKey,
    Buffer.from(envelope.signature, 'base64url'),
  );
}

export function createSimulatorServer({ state = createSimulatorState() } = {}) {
  return createServer(async (request, response) => {
    try {
      setSafeHeaders(response);
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const scenario = normalizeScenario(
        url.searchParams.get('scenario') ?? 'active',
      );
      if (request.method === 'GET' && url.pathname === '/v1/scenarios') {
        return json(response, 200, {
          schemaVersion: '1',
          scenarios: SCENARIOS,
        });
      }
      if (request.method === 'GET'
        && url.pathname === '/control-plane/v1/fixture') {
        return json(response, 200, fixtureFor(scenario, state));
      }
      if (request.method === 'POST'
        && url.pathname === '/control-plane/v1/registry/token') {
        await readJson(request, 16 * 1024);
        if (scenario !== 'active') {
          return error(
            response,
            403,
            expectedFailureCode(scenario) ?? 'registry_token_denied',
          );
        }
        return json(response, 200, {
          schemaVersion: '1',
          credentialId: '88888888-8888-4888-8888-888888888888',
          username: 'dev-simulator',
          secret: 'dev_registry_placeholder_not_valid_for_any_registry',
          expiresAt: '2026-07-19T12:05:00Z',
        });
      }
      return error(response, 404, 'not_found');
    } catch (cause) {
      if (cause instanceof RequestError) {
        return error(response, cause.status, cause.code);
      }
      return error(response, 500, 'simulator_error');
    }
  });
}

function signDocument(payload, type, state) {
  const protectedHeader = Buffer.from(JSON.stringify({
    alg: 'EdDSA',
    kid: state.keyId,
    typ: type,
  })).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload))
    .toString('base64url');
  return {
    payload: encodedPayload,
    protected: protectedHeader,
    signature: signBytes(
      null,
      Buffer.from(`${protectedHeader}.${encodedPayload}`, 'ascii'),
      state.privateKey,
    ).toString('base64url'),
  };
}

function entitlementStatus(scenario, grant, lease) {
  const state = {
    active: 'ACTIVE',
    'online-grace': 'ONLINE_GRACE',
    'retained-use': 'RETAINED_USE',
    revoked: 'REVOKED',
    'invalid-signature': 'INVALID',
  }[scenario] ?? 'ACTIVE';
  const active = state === 'ACTIVE';
  return {
    schemaVersion: '1',
    state,
    plan: grant.plan,
    features: grant.features,
    updatesThrough: grant.updatesThrough,
    serviceLeaseExpiresAt: lease.expiresAt,
    lastVerifiedServerTime: lease.serverTime,
    localUseAllowed: !['REVOKED', 'INVALID'].includes(state),
    updatesAllowed: active,
    hostedServicesAllowed: active,
    grantFingerprint: `sha256:${'b'.repeat(64)}`,
    reasonCode: {
      ONLINE_GRACE: 'lease_expired',
      RETAINED_USE: 'maintenance_ended',
      REVOKED: 'grant_revoked',
      INVALID: 'invalid_signature',
    }[state] ?? 'none',
  };
}

function moduleState(scenario) {
  if (scenario === 'retained-use') return 'RETAINED_USE';
  if (scenario === 'incompatible-agent') return 'DEGRADED';
  if (scenario === 'failed-health-check') return 'ROLLING_BACK';
  if (scenario === 'expired-manifest') return 'UPDATE_INELIGIBLE';
  if (['digest-mismatch', 'invalid-signature', 'malformed-agent'].includes(scenario)) {
    return 'ERROR';
  }
  return 'ACTIVE';
}

function expectedFailureCode(scenario) {
  return {
    'invalid-signature': 'invalid_signature',
    'incompatible-agent': 'agent_incompatible',
    'failed-health-check': 'health_check_failed',
    'expired-manifest': 'manifest_expired',
    'digest-mismatch': 'digest_mismatch',
    'malformed-agent': 'agent_response_invalid',
    revoked: 'grant_revoked',
  }[scenario] ?? null;
}

function normalizeScenario(value) {
  if (!SCENARIOS.includes(value)) {
    throw new RequestError(400, 'unknown_scenario');
  }
  return value;
}

function mutateSignature(signature) {
  return `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
}

async function readJson(request, maximum) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximum) throw new RequestError(413, 'request_too_large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RequestError(400, 'invalid_json');
  }
}

function setSafeHeaders(response) {
  response.setHeader('cache-control', 'no-store');
  response.setHeader('x-content-type-options', 'nosniff');
}

function json(response, statusCode, body) {
  return raw(response, statusCode, JSON.stringify(body));
}

function error(response, statusCode, code) {
  return json(response, statusCode, {
    error: { code, message: 'Development simulator request failed.' },
  });
}

function raw(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json');
  response.end(body);
}

class RequestError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number.parseInt(process.env.PORT ?? '4177', 10);
  createSimulatorServer().listen(port, '127.0.0.1', () => {
    process.stdout.write(`Autark Pro development simulator listening on 127.0.0.1:${port}\n`);
  });
}
