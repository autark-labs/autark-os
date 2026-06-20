import assert from 'node:assert/strict';
import test from 'node:test';
import { backupPageViewModel } from './BackupsPage.logic.js';

const baseReport = {
  apps: [
    { appId: 'photos', status: 'protected' },
    { appId: 'notes', status: 'not_backed_up' },
  ],
  failedBackups: 0,
  protectedApps: 1,
  recentRestorePoints: [
    { id: 'manual-full', createdAt: '2026-06-20T10:00:00Z', scope: 'full', source: 'manual', status: 'completed' },
    { id: 'routine-full', createdAt: '2026-06-20T11:00:00Z', scope: 'full', source: 'automatic', status: 'completed' },
    { id: 'failed-routine', createdAt: '2026-06-20T12:00:00Z', scope: 'full', source: 'automatic', status: 'failed' },
    { id: 'app-point', createdAt: '2026-06-20T09:00:00Z', scope: 'app', source: 'manual', status: 'completed' },
  ],
  settings: {
    nextRoutineRun: '2026-06-21T03:00:00Z',
  },
  status: 'partial',
  summary: 'One app needs protection.',
  totalApps: 2,
};

test('backupPageViewModel groups restore points and attention apps for page composition', () => {
  const model = backupPageViewModel(baseReport);

  assert.deepEqual(model.needsAttention.map((app) => app.appId), ['notes']);
  assert.deepEqual(model.routineRestorePoints.map((point) => point.id), ['routine-full']);
  assert.deepEqual(model.fullRestorePoints.map((point) => point.id), ['manual-full', 'routine-full']);
  assert.deepEqual(model.appRestorePoints.map((point) => point.id), ['app-point']);
  assert.equal(model.latestRestore.id, 'manual-full');
  assert.equal(model.protectionHero.title, 'Finish backup protection');
});

test('backupPageViewModel explains protected and failed backup hero states', () => {
  const protectedModel = backupPageViewModel({
    ...baseReport,
    status: 'protected',
    protectedApps: 2,
    apps: baseReport.apps.map((app) => ({ ...app, status: 'protected' })),
  });

  assert.equal(protectedModel.protectionHero.title, 'Your data is protected');
  assert.match(protectedModel.protectionHero.summary, /latest restore point/i);

  const failedModel = backupPageViewModel({
    ...baseReport,
    failedBackups: 2,
  });

  assert.equal(failedModel.protectionHero.title, 'Backup protection needs attention');
  assert.match(failedModel.protectionHero.summary, /2 backup runs need attention/i);
});

test('backupPageViewModel handles a missing report without throwing', () => {
  const model = backupPageViewModel(null);

  assert.deepEqual(model.needsAttention, []);
  assert.deepEqual(model.routineRestorePoints, []);
  assert.equal(model.latestRestore, null);
  assert.equal(model.protectionHero.title, 'Protection status is unknown');
});
