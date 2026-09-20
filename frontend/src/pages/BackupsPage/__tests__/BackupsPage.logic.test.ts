import assert from 'node:assert/strict';
import { test } from 'vitest';
import { activeBackupJobs, backupJobRunningId, backupOperationAvailability, backupOperationForJob, backupStatusLabel, formatBackupDate, selectActiveBackupJob } from '../BackupsPage.logic';

test('backup status labels distinguish backups on from recoverable restore points', () => {
  assert.equal(backupStatusLabel('unprotected'), 'Backups off');
  assert.equal(backupStatusLabel('not_backed_up'), 'No restore point yet');
  assert.equal(backupStatusLabel('recovery_limited'), 'Recovery limited');
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

test('activeBackupJobs recovers only in-progress backup jobs in newest order', () => {
  const jobs = [
    { jobId: 'install-1', type: 'install_app', status: 'running', updatedAt: '2026-06-20T10:00:00Z' },
    { jobId: 'backup-old', type: 'backup', status: 'running', updatedAt: '2026-06-20T10:01:00Z' },
    { jobId: 'verify-done', type: 'backup_verify', status: 'succeeded', updatedAt: '2026-06-20T10:02:00Z' },
    { jobId: 'restore-new', type: 'backup_restore', status: 'queued', updatedAt: '2026-06-20T10:03:00Z' },
    { jobId: 'backup-failed', type: 'backup', status: 'failed', updatedAt: '2026-06-20T10:04:00Z' },
    { jobId: 'cleanup', type: 'storage_cleanup', status: 'running', updatedAt: '2026-06-20T10:05:00Z' },
  ];

  const active = activeBackupJobs(jobs);

  assert.deepEqual(active.map((job) => job.jobId), ['cleanup', 'restore-new', 'backup-old']);
  assert.equal(selectActiveBackupJob(jobs).jobId, 'cleanup');
  assert.equal(backupJobRunningId({ type: 'storage_cleanup', subjectId: 'old-app' }), 'cleanup-old-app');
  assert.equal(backupJobRunningId({ type: 'backup_restore', subjectId: '42:vaultwarden' }), 'restore-42');
  assert.equal(backupJobRunningId({ type: 'backup_verify', subjectId: '42' }), 'verify-42');
  assert.equal(backupJobRunningId({ type: 'backup', subjectId: 'vaultwarden' }), 'app-vaultwarden');
  assert.equal(backupJobRunningId({ type: 'backup', subjectId: '__full__' }), 'full');
});

test('backup operations use one conflict matrix for durable job state', () => {
  assert.equal(backupOperationForJob({ type: 'storage_cleanup', subjectId: 'old-app' }), 'cleanup');
  assert.equal(backupOperationAvailability('app_backup', ['cleanup']).disabled, true);
  assert.equal(backupOperationAvailability('restore', ['cleanup']).disabled, true);
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
