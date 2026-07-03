import assert from 'node:assert/strict';
import { test } from 'vitest';
import { actionNotificationFromError, actionNotificationFromJob, actionNotificationFromResult, notificationToastMethod } from '../actionNotifications.logic';

test('maps completed app action results to concise success notifications', () => {
  const notification = actionNotificationFromResult({
    action: 'restart',
    status: 'completed',
    message: 'Vaultwarden restarted.',
  }, 'App action finished');

  assert.equal(notification.severity, 'success');
  assert.equal(notification.title, 'App action finished');
  assert.equal(notification.message, 'Vaultwarden restarted.');
  assert.equal(notification.sticky, false);
});

test('maps skipped app action results to info notifications', () => {
  const notification = actionNotificationFromResult({
    action: 'repair',
    status: 'skipped',
    message: 'Vaultwarden already looks ready. No repair was needed.',
  }, 'Repair finished');

  assert.equal(notification.severity, 'info');
  assert.equal(notification.title, 'Repair finished');
  assert.equal(notification.sticky, false);
});

test('maps warning action results to sticky warning notifications', () => {
  const notification = actionNotificationFromResult({
    ok: false,
    severity: 'warning',
    title: 'Confirmation required',
    message: 'Type the confirmation text exactly before Autark-OS takes control.',
  }, 'Service action finished');

  assert.equal(notification.severity, 'warning');
  assert.equal(notification.title, 'Confirmation required');
  assert.equal(notification.sticky, true);
});

test('maps failed action results to sticky error notifications', () => {
  const notification = actionNotificationFromResult({
    action: 'restart',
    status: 'failed',
    message: 'Vaultwarden could not restart because Docker is unavailable.',
  }, 'App action failed');

  assert.equal(notification.severity, 'error');
  assert.equal(notification.title, 'App action failed');
  assert.equal(notification.sticky, true);
});

test('maps severities to sonner toast methods', () => {
  assert.equal(notificationToastMethod('success'), 'success');
  assert.equal(notificationToastMethod('info'), 'info');
  assert.equal(notificationToastMethod('warning'), 'warning');
  assert.equal(notificationToastMethod('error'), 'error');
  assert.equal(notificationToastMethod('critical'), 'error');
});

test('maps running backup jobs to non-sticky progress notifications', () => {
  const notification = actionNotificationFromJob({
    jobId: 'job-1',
    type: 'backup',
    subjectId: 'vaultwarden',
    status: 'running',
    currentStep: 'archive',
    steps: [{ id: 'archive', label: 'Archive app data', status: 'running', message: 'Archiving Vaultwarden data.' }],
  });

  assert.equal(notification.severity, 'info');
  assert.equal(notification.title, 'Backup started');
  assert.equal(notification.message, 'Archiving Vaultwarden data.');
  assert.equal(notification.sticky, false);
});

test('maps succeeded backup jobs to concise success notifications', () => {
  const notification = actionNotificationFromJob({
    jobId: 'job-2',
    type: 'backup_restore',
    subjectId: 'vaultwarden',
    status: 'succeeded',
    steps: [],
  });

  assert.equal(notification.severity, 'success');
  assert.equal(notification.title, 'Restore completed');
  assert.equal(notification.sticky, false);
});

test('maps failed backup jobs to sticky user-actionable errors', () => {
  const notification = actionNotificationFromJob({
    jobId: 'job-3',
    type: 'backup_verify',
    subjectId: 'vaultwarden',
    status: 'failed',
    steps: [],
    error: { message: 'Restore point archive is missing.', code: 'missing_archive', advancedDetails: {} },
  });

  assert.equal(notification.severity, 'error');
  assert.equal(notification.title, 'Backup verification failed');
  assert.equal(notification.message, 'Restore point archive is missing.');
  assert.equal(notification.sticky, true);
});


test('maps thrown errors to sticky action notifications', () => {
  const notification = actionNotificationFromError(new Error('Docker is not running.'), 'App action failed');

  assert.equal(notification.severity, 'error');
  assert.equal(notification.title, 'App action failed');
  assert.equal(notification.message, 'Docker is not running.');
  assert.equal(notification.sticky, true);
  assert.deepEqual(notification.nextAction, { label: 'Review diagnostics', href: '/diagnostics' });
});
