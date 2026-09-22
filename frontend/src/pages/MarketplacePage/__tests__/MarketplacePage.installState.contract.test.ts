import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const repository = readFileSync(resolve(process.cwd(), 'src/repositories/discoverRepository.ts'), 'utf8');

test('the catalog query key does not depend on application-state poll timestamps', () => {
  assert.match(repository, /queryKey: discoverQueryKeys\.apps/);
  assert.doesNotMatch(repository, /applicationStateUpdatedAt/);
});
