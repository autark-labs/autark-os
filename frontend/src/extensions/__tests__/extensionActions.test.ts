import { afterEach, describe, expect, it, vi } from 'vitest';
import { extensionAction } from '../extensionActions';

afterEach(() => vi.unstubAllGlobals());

describe('installed private actions', () => {
  it('sends opaque intents through the authenticated same-origin host route', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ schemaVersion: '1', outcome: 'conflict', payload: {} })));
    vi.stubGlobal('fetch', fetch);
    const payload = { opaque: 'owner-intent' };
    const result = await extensionAction('/api/v1/extensions/autark-pro', 'pro.dashboard', 'private.intent', payload);
    expect(result.outcome).toBe('conflict');
    const [url, request] = fetch.mock.calls[0];
    expect(url).toBe('/api/v1/extensions/autark-pro/actions');
    expect(request.credentials).toBe('same-origin');
    expect(request.method).toBe('POST');
    expect(request.headers['X-Autark-Extension-Action']).toBe('1');
    expect(JSON.parse(request.body)).toEqual({ schemaVersion: '1', surface: 'pro.dashboard', actionId: 'private.intent', payload });
  });

  it('does not retry uncertain mutations or expose raw server errors', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('private backend detail', { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    await expect(extensionAction('/api/v1/extensions/autark-pro', 'pro.dashboard', 'private.intent', {}))
      .rejects.toThrow('Private guidance is temporarily unavailable');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized requests and incompatible responses', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ schemaVersion: '2', outcome: 'completed', payload: {} })));
    vi.stubGlobal('fetch', fetch);
    await expect(extensionAction('/api/v1/extensions/autark-pro', 'pro.dashboard', 'private.intent', { value: 'é'.repeat(9000) }))
      .rejects.toThrow('too large');
    expect(fetch).not.toHaveBeenCalled();
    await expect(extensionAction('/api/v1/extensions/autark-pro', 'pro.dashboard', 'private.intent', {}))
      .rejects.toThrow('compatible update');
  });
});
