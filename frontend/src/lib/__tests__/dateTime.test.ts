import assert from 'node:assert/strict';
import { test } from 'vitest';
import { formatLocalizedDateTime } from '../dateTime';

test('formats timestamps in the configured time zone across daylight-saving changes', () => {
  const beforeDst = '2026-03-08T07:30:00Z';
  const afterDst = '2026-03-08T08:30:00Z';
  const options = { day: 'numeric', hour: 'numeric', minute: '2-digit', month: 'short', timeZone: 'America/Chicago' } as const;

  assert.equal(formatLocalizedDateTime(beforeDst, 'America/Chicago'), new Intl.DateTimeFormat(undefined, options).format(new Date(beforeDst)));
  assert.equal(formatLocalizedDateTime(afterDst, 'America/Chicago'), new Intl.DateTimeFormat(undefined, options).format(new Date(afterDst)));
  assert.notEqual(formatLocalizedDateTime(beforeDst, 'America/Chicago'), formatLocalizedDateTime(beforeDst, 'UTC'));
});

test('does not expose invalid or raw ISO timestamps in primary UI formatting', () => {
  assert.equal(formatLocalizedDateTime('not-a-date', 'America/Chicago'), 'Not recorded');
  assert.equal(formatLocalizedDateTime(null, 'America/Chicago'), 'Not recorded');
});
