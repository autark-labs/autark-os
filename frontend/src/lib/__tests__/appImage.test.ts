import assert from 'node:assert/strict';
import { test } from 'vitest';
import { catalogAppImageUrl, preferredAppImageUrl, renderableAppImageUrl } from '../appImage';

test('uses only renderable image URLs for application artwork', () => {
  assert.equal(renderableAppImageUrl('/app-images/vaultwarden.svg'), '/app-images/vaultwarden.svg');
  assert.equal(renderableAppImageUrl('https://images.example.test/vaultwarden.svg'), 'https://images.example.test/vaultwarden.svg');
  assert.equal(renderableAppImageUrl('vaultwarden/server:1.36.0'), null);
  assert.equal(renderableAppImageUrl('javascript:alert(1)'), null);
});

test('falls back to a valid catalog asset when a runtime image is not renderable', () => {
  assert.equal(catalogAppImageUrl('vaultwarden'), '/app-images/vaultwarden.svg');
  assert.equal(catalogAppImageUrl('homepage'), '/app-images/homepage.svg');
  assert.equal(catalogAppImageUrl('Vaultwarden'), null);
  assert.equal(preferredAppImageUrl('vaultwarden/server:1.36.0', catalogAppImageUrl('vaultwarden')), '/app-images/vaultwarden.svg');
});
