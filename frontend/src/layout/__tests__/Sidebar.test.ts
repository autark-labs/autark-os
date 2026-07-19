import { describe, expect, it } from 'vitest';
import { sidebarUpdateIndicator } from '../Sidebar';

describe('sidebarUpdateIndicator', () => {
  it('does not claim an update exists when the release channel has not been checked', () => {
    expect(sidebarUpdateIndicator('check_required')).toEqual({
      label: 'Run autark-os update',
      tone: 'check',
    });
  });

  it('distinguishes current and available releases', () => {
    expect(sidebarUpdateIndicator('current').label).toBe('Up to date');
    expect(sidebarUpdateIndicator('available')).toEqual({
      label: 'Update available',
      tone: 'available',
    });
  });
});
