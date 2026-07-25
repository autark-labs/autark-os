import { describe, expect, it } from 'vitest';
import {
  extensionNavigationState,
  readExtensionNavigationState,
  resolveExtensionNavigation,
} from '../extensionNavigation';

describe('extension navigation boundary', () => {
  it('allows only CE-owned route and action pairs', () => {
    expect(resolveExtensionNavigation('storage', 'review-storage')).toMatchObject({
      actionId: 'review-storage',
      path: '/storage',
      routeId: 'storage',
    });
    expect(resolveExtensionNavigation('storage', 'review-backups')).toBeNull();
    expect(resolveExtensionNavigation('https://example.invalid', 'review-storage')).toBeNull();
    expect(resolveExtensionNavigation('apps', undefined)).toBeNull();
  });

  it('accepts only a state generated from an allowed pair', () => {
    const target = resolveExtensionNavigation('apps', 'review-app');
    expect(target).not.toBeNull();
    const state = extensionNavigationState('autark-pro', target!);

    expect(readExtensionNavigationState(state)).toEqual(state);
    expect(readExtensionNavigationState({ ...state, actionId: 'review-storage' })).toBeNull();
    expect(readExtensionNavigationState({ ...state, source: 'another-extension' })).toBeNull();
  });
});
