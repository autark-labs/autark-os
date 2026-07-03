import assert from 'node:assert/strict';
import { test } from 'vitest';
import { shouldShowActivityLogLink } from '../OverviewPage.activityLink';

test('Home hides Activity Log link in Basic mode even when activity exists', () => {
  assert.equal(shouldShowActivityLogLink('basic', [{ id: 'event-1' }]), false);
});

test('Home only shows Activity Log link in Advanced mode when useful activity exists', () => {
  assert.equal(shouldShowActivityLogLink('advanced', []), false);
  assert.equal(shouldShowActivityLogLink('advanced', [{ id: 'event-1' }]), true);
});
