import { describe, it, expect } from 'vitest';
import { appBrowserAccessReason, serverOnlyAccessReason } from '../appBrowserAccess';

describe('application browser access', () => {
  it('prevents another device from opening its own loopback address', () => {
    for (const url of ['http://localhost:18384', 'http://127.0.0.1:18384', 'http://[::1]:18384']) {
      expect(appBrowserAccessReason(url, '192.168.68.55')).toBe(serverOnlyAccessReason);
    }
  });
  it('allows server-local browsers, LAN addresses, and verified private links', () => {
    expect(appBrowserAccessReason('http://localhost:18384', 'localhost')).toBeNull();
    expect(appBrowserAccessReason('http://192.168.68.55:18384', '192.168.68.55')).toBeNull();
    expect(appBrowserAccessReason('https://server.example.ts.net:18384', 'server.example.ts.net')).toBeNull();
    expect(appBrowserAccessReason('/apps', '192.168.68.55')).toBeNull();
  });
});
