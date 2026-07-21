import assert from 'node:assert/strict';
import { request } from 'node:http';
import test from 'node:test';

import {
  SCENARIOS,
  createSimulatorServer,
  createSimulatorState,
  fixtureFor,
  verifySimulatorDocument,
} from './server.mjs';

test('every scenario returns deterministic bounded lifecycle state', () => {
  const state = createSimulatorState();
  for (const scenario of SCENARIOS) {
    const first = fixtureFor(scenario, state);
    assert.deepEqual(first, fixtureFor(scenario, state));
    assert.equal(first.scenario, scenario);
    assert.equal(first.schemaVersion, '1');
    assert.equal(first.publicKey.kty, 'OKP');
    assert.equal(first.publicKey.crv, 'Ed25519');
  }
});

test('test signatures verify only before intentional corruption', () => {
  const state = createSimulatorState();
  const unrelated = createSimulatorState();
  const active = fixtureFor('active', state);
  const invalid = fixtureFor('invalid-signature', state);

  assert.equal(verifySimulatorDocument(active.durableProductGrant, state.publicKey), true);
  assert.equal(verifySimulatorDocument(active.durableProductGrant, unrelated.publicKey), false);
  assert.equal(verifySimulatorDocument(invalid.durableProductGrant, state.publicKey), false);
});

test('unknown scenarios fail with a bounded error', async (t) => {
  const server = createSimulatorServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const { port } = server.address();
  const response = await requestJson(
    port,
    '/control-plane/v1/fixture?scenario=unknown',
    'GET',
  );
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'unknown_scenario');
});

function requestJson(port, path, method, body) {
  return new Promise((resolve, reject) => {
    const outgoing = request({
      host: '127.0.0.1',
      port,
      path,
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
      }));
    });
    outgoing.on('error', reject);
    if (body) outgoing.write(JSON.stringify(body));
    outgoing.end();
  });
}
