import assert from 'node:assert/strict';
import test from 'node:test';
import { poButtonClass, poCardClass, poNavItemClass } from './projectOsStyleKit.js';

test('returns readable named classes for primary actions', () => {
  const className = poButtonClass('primary');

  assert.match(className, /bg-po-brand-gradient/);
  assert.doesNotMatch(className, /bg-gradient-to-br/);
  assert.doesNotMatch(className, /from-violet-600/);
});

test('returns readable named classes for quiet outline actions', () => {
  const className = poButtonClass('quiet');

  assert.match(className, /border-po-border-strong/);
  assert.match(className, /bg-po-surface-inset/);
});

test('supports icon button sizing without duplicating surface tokens', () => {
  const className = poButtonClass('quietIcon');

  assert.match(className, /size-8/);
  assert.match(className, /border-po-border-strong/);
});

test('returns selected and idle nav styles with tokenized backgrounds', () => {
  assert.match(poNavItemClass(true), /bg-po-brand-gradient/);
  assert.match(poNavItemClass(false), /hover:bg-po-surface-hover/);
});

test('returns card surface classes by density', () => {
  assert.match(poCardClass('compact'), /p-3/);
  assert.match(poCardClass('normal'), /p-4/);
});
