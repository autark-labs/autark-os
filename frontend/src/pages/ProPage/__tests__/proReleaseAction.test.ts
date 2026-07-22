import { describe, expect, it } from 'vitest';
import { proReleaseAction } from '../proReleaseAction';

describe('Pro release review action', () => {
  it('checks for a signed assignment before initial installation', () => {
    expect(proReleaseAction(true, true, 'NOT_INSTALLED')).toBe('check');
  });

  it('checks for a signed update when an extension is already active', () => {
    expect(proReleaseAction(true, true, 'ACTIVE')).toBe('check');
  });

  it('offers installation only after a release is verified and available', () => {
    expect(proReleaseAction(true, true, 'RELEASE_AVAILABLE')).toBe('install');
  });

  it('offers no release mutation without local-use and update authority', () => {
    expect(proReleaseAction(false, true, 'NOT_INSTALLED')).toBeNull();
    expect(proReleaseAction(true, false, 'RELEASE_AVAILABLE')).toBeNull();
  });
});
