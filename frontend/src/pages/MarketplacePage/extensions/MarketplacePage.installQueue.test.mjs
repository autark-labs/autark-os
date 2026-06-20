import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activeInstallMessage,
  canStartInstall,
  completeInstallJob,
  failInstallJob,
  installJobReducer,
  startInstallJob,
} from './MarketplacePage.installQueue.js';

test('starts one active install job from idle state', () => {
  const state = startInstallJob({ status: 'idle' }, { appId: 'vaultwarden', appName: 'Vaultwarden', mode: 'install' });

  assert.equal(state.status, 'active');
  assert.equal(state.active.appId, 'vaultwarden');
  assert.equal(state.active.mode, 'install');
  assert.equal(canStartInstall(state, 'vaultwarden'), true);
});

test('blocks a different app while an install is active', () => {
  const state = startInstallJob({ status: 'idle' }, { appId: 'vaultwarden', appName: 'Vaultwarden', mode: 'install' });

  assert.equal(canStartInstall(state, 'jellyfin'), false);
  assert.match(activeInstallMessage(state, 'jellyfin'), /Vaultwarden is installing/);
});

test('records completed job and clears active lock', () => {
  const active = startInstallJob({ status: 'idle' }, { appId: 'vaultwarden', appName: 'Vaultwarden', mode: 'install' });
  const completed = completeInstallJob(active, { appId: 'vaultwarden', status: 'installed', message: 'Installed.' });

  assert.equal(completed.status, 'completed');
  assert.equal(completed.completed.appId, 'vaultwarden');
  assert.equal(canStartInstall(completed, 'jellyfin'), true);
});

test('records failed job and clears active lock', () => {
  const active = startInstallJob({ status: 'idle' }, { appId: 'vaultwarden', appName: 'Vaultwarden', mode: 'install' });
  const failed = failInstallJob(active, { appId: 'vaultwarden', message: 'Docker is unavailable.' });

  assert.equal(failed.status, 'failed');
  assert.equal(failed.failed.message, 'Docker is unavailable.');
  assert.equal(canStartInstall(failed, 'jellyfin'), true);
});

test('ignores completion for stale active app', () => {
  const active = startInstallJob({ status: 'idle' }, { appId: 'vaultwarden', appName: 'Vaultwarden', mode: 'install' });
  const unchanged = completeInstallJob(active, { appId: 'jellyfin', status: 'installed', message: 'Installed.' });

  assert.equal(unchanged.status, 'active');
  assert.equal(unchanged.active.appId, 'vaultwarden');
});

test('reducer applies active, completed, and failed actions', () => {
  const active = installJobReducer({ status: 'idle' }, { type: 'start', appId: 'vaultwarden', appName: 'Vaultwarden', mode: 'reinstall' });
  const failed = installJobReducer(active, { type: 'fail', appId: 'vaultwarden', message: 'Install failed.' });
  const nextActive = installJobReducer(failed, { type: 'start', appId: 'jellyfin', appName: 'Jellyfin', mode: 'install' });
  const completed = installJobReducer(nextActive, { type: 'complete', appId: 'jellyfin', status: 'installed', message: 'Installed.' });

  assert.equal(active.active.mode, 'reinstall');
  assert.equal(failed.status, 'failed');
  assert.equal(nextActive.active.appId, 'jellyfin');
  assert.equal(completed.status, 'completed');
});
