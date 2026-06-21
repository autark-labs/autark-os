import assert from 'node:assert/strict';
import test from 'node:test';
import { appCardPrimaryUrl, linkedServiceCard } from './ApplicationsPage.cardModel.js';

test('linked services get a distinct card model without managed runtime actions', () => {
  const card = linkedServiceCard({
    accessScope: 'LAN',
    category: 'Network',
    id: 'ext_router',
    name: 'Router',
    url: 'http://192.168.1.1',
  });

  assert.equal(card.managementMode, 'linked');
  assert.equal(card.status, 'Linked');
  assert.equal(card.primaryAction, 'Open');
  assert.equal(card.secondaryAction, 'Manage link');
});

test('app cards prefer private links before local links', () => {
  assert.equal(appCardPrimaryUrl({
    accessUrl: 'http://localhost:8080',
    observedAccess: { privateUrl: 'https://vault.tailnet', localUrl: 'http://192.168.1.5:8080' },
    settings: {},
  }), 'https://vault.tailnet');
});
