import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseProProductState, type ProProductState } from '../proProductState';

function fixture() {
  return JSON.parse(readFileSync(resolve(
    process.cwd(),
    '../docs/pro/contracts/examples/pro-product-state-v1.json',
  ), 'utf8')) as ProProductState;
}

describe('canonical Pro product state boundary', () => {
  it('parses the canonical golden fixture unchanged', () => {
    expect(parseProProductState(fixture()).recommendedAction.id).toBe('check_release');
  });

  it('accepts unknown future capabilities and recommended actions', () => {
    const future = fixture();
    future.localCapabilities.push('pro.future');
    future.recommendedAction.id = 'future_action';
    future.recommendedAction.reasonCode = 'future_reason';

    expect(parseProProductState(future).recommendedAction.id).toBe('future_action');
  });

  it('keeps a stale relay distinct from an offline relay', () => {
    const stale = fixture();
    stale.hostedMobile.state = 'linked';
    stale.hostedMobile.relayState = 'stale';
    const offline = fixture();
    offline.hostedMobile.state = 'linked';
    offline.hostedMobile.relayState = 'offline';

    expect(parseProProductState(stale).hostedMobile.relayState).toBe('stale');
    expect(parseProProductState(offline).hostedMobile.relayState).toBe('offline');
  });

  it('rejects full digests, duplicate capabilities, and partial state', () => {
    const fullDigest = fixture();
    fullDigest.agent.digestPrefix = `sha256:${'a'.repeat(64)}`;
    expect(() => parseProProductState(fullDigest)).toThrow(TypeError);

    const duplicate = fixture();
    duplicate.localCapabilities = ['pro.example', 'pro.example'];
    expect(() => parseProProductState(duplicate)).toThrow(TypeError);
    expect(() => parseProProductState({ schemaVersion: '1' })).toThrow(TypeError);
  });

  it('rejects uncontracted fields so lifecycle secrets cannot pass through', () => {
    const unsafe = fixture() as ProProductState & {
      agent: ProProductState['agent'] & { activeDigest?: string };
    };
    unsafe.agent.activeDigest = `sha256:${'b'.repeat(64)}`;

    expect(() => parseProProductState(unsafe)).toThrow(TypeError);
  });
});
