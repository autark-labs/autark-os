import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  marketplaceDetailId,
  marketplaceSearchWithDetail,
  marketplaceSearchWithoutDetail,
} from '../MarketplacePage.detailRoute';

test('adds a detail query while preserving catalog and recovery context', () => {
  const next = marketplaceSearchWithDetail(new URLSearchParams('category=Media&sort=Recommended&app=jellyfin&mode=reinstall'), 'vaultwarden');

  assert.equal(next.toString(), 'category=Media&sort=Recommended&app=jellyfin&mode=reinstall&detail=vaultwarden');
  assert.equal(marketplaceDetailId(next), 'vaultwarden');
});

test('closes detail without changing catalog context and can clear a legacy recovery route', () => {
  const catalog = marketplaceSearchWithoutDetail(new URLSearchParams('category=Media&sort=Recommended&detail=vaultwarden'));
  assert.equal(catalog.toString(), 'category=Media&sort=Recommended');

  const recoveryCatalog = marketplaceSearchWithoutDetail(new URLSearchParams('app=vaultwarden&mode=reinstall&detail=vaultwarden'), true);
  assert.equal(recoveryCatalog.toString(), '');
});
