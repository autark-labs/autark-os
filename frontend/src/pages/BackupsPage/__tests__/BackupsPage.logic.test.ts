import assert from 'node:assert/strict';
import { test } from 'vitest';
import { activeBackupJobs, backupJobBannerTitle, backupJobCompletedMessage, backupJobRunningId, backupJobStartedMessage, backupOperationAvailability, backupOperationForJob, backupPageViewModel, backupStatusLabel, formatBackupDate, selectActiveBackupJob } from '../BackupsPage.logic';

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

  assert.equal(protectedModel.protectionHero.title, 'Protected by restore point');
  assert.match(protectedModel.protectionHero.summary, /latest restore point/i);

  const configuredWithoutRestorePoint = backupPageViewModel({
    ...baseReport,
    status: 'protected',
    protectedApps: 2,
    recentRestorePoints: [],
  });

  assert.equal(configuredWithoutRestorePoint.protectionHero.title, 'Create the first restore point');
  assert.doesNotMatch(configuredWithoutRestorePoint.protectionHero.summary, /protected/i);

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

test('backup status labels distinguish backups on from recoverable restore points', () => {
  assert.equal(backupStatusLabel('unprotected'), 'Backups off');
  assert.equal(backupStatusLabel('not_backed_up'), 'No restore point yet');
  assert.equal(backupStatusLabel('protected'), 'Protected by restore point');
});

test('formats scheduled backup times in the configured time zone', () => {
  const scheduledAt = '2026-01-15T02:00:00Z';

  assert.equal(
    formatBackupDate(scheduledAt, 'America/New_York'),
    new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }).format(new Date(scheduledAt)),
  );
  assert.notEqual(formatBackupDate(scheduledAt, 'America/New_York'), formatBackupDate(scheduledAt, 'UTC'));
});

test('backup job copy distinguishes backup, verification, and restore jobs', () => {
  assert.equal(backupJobBannerTitle({ type: 'backup' }), 'Backup in progress');
  assert.equal(backupJobBannerTitle({ type: 'backup_verify' }), 'Verification in progress');
  assert.equal(backupJobBannerTitle({ type: 'backup_restore' }), 'Restore in progress');

  assert.equal(backupJobStartedMessage({ type: 'backup' }), 'Backup job started. Autark-OS will update restore points when it finishes.');
  assert.equal(backupJobStartedMessage({ type: 'backup_verify' }), 'Verification job started. Autark-OS will update the restore point when it finishes.');
  assert.equal(backupJobStartedMessage({ type: 'backup_restore' }), 'Restore job started. Autark-OS will update app and backup state when it finishes.');

  assert.equal(backupJobCompletedMessage({ type: 'backup' }), 'Backup job completed.');
  assert.equal(backupJobCompletedMessage({ type: 'backup_verify' }), 'Verification job completed.');
  assert.equal(backupJobCompletedMessage({ type: 'backup_restore' }), 'Restore job completed.');
});

test('activeBackupJobs recovers only in-progress backup jobs in newest order', () => {
  const jobs = [
    { jobId: 'install-1', type: 'install_app', status: 'running', updatedAt: '2026-06-20T10:00:00Z' },
    { jobId: 'backup-old', type: 'backup', status: 'running', updatedAt: '2026-06-20T10:01:00Z' },
    { jobId: 'verify-done', type: 'backup_verify', status: 'succeeded', updatedAt: '2026-06-20T10:02:00Z' },
    { jobId: 'restore-new', type: 'backup_restore', status: 'queued', updatedAt: '2026-06-20T10:03:00Z' },
    { jobId: 'backup-failed', type: 'backup', status: 'failed', updatedAt: '2026-06-20T10:04:00Z' },
  ];

  const active = activeBackupJobs(jobs);

  assert.deepEqual(active.map((job) => job.jobId), ['restore-new', 'backup-old']);
  assert.equal(selectActiveBackupJob(jobs).jobId, 'restore-new');
  assert.equal(backupJobRunningId({ type: 'backup_restore', subjectId: '42:vaultwarden' }), 'restore-42');
  assert.equal(backupJobRunningId({ type: 'backup_verify', subjectId: '42' }), 'verify-42');
  assert.equal(backupJobRunningId({ type: 'backup', subjectId: 'vaultwarden' }), 'app-vaultwarden');
  assert.equal(backupJobRunningId({ type: 'backup', subjectId: '__full__' }), 'full');
});

test('backup operations use one conflict matrix for durable job state', () => {
  assert.equal(backupOperationForJob({ type: 'backup_restore', subjectId: '12:vaultwarden' }), 'restore');
  assert.equal(backupOperationForJob({ type: 'backup_verify', subjectId: '12' }), 'verify');
  assert.equal(backupOperationForJob({ type: 'backup', subjectId: '__routine__' }), 'routine_backup');
  assert.equal(backupOperationForJob({ type: 'backup', subjectId: 'vaultwarden' }), 'app_backup');

  const duringRestore = backupOperationAvailability('app_backup', ['restore']);
  assert.equal(duringRestore.disabled, true);
  assert.match(duringRestore.reason, /restore/i);
  assert.equal(backupOperationAvailability('verify', ['full_backup']).disabled, true);
  assert.equal(backupOperationAvailability('cleanup', []).disabled, false);
});
