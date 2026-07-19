import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  JOB_FAMILIES,
  activeJobs,
  activeJobsByFamily,
  currentJobStepText,
  jobListRefetchInterval,
  jobProgressPercent,
  jobTypeLabel,
  latestActiveJob,
  queuedJobText,
  terminalJob,
} from '../jobRepository.logic';

test('latestActiveJob restores the newest non-terminal job for requested types', () => {
  const jobs = [
    job('old-install', 'install_app', 'vaultwarden', 'running', '2026-06-21T12:00:00Z'),
    job('finished-install', 'install_app', 'homepage', 'succeeded', '2026-06-21T12:04:00Z'),
    job('new-backup', 'backup', 'jellyfin', 'queued', '2026-06-21T12:05:00Z'),
    job('unrelated', 'support_bundle', 'system', 'running', '2026-06-21T12:10:00Z'),
  ];

  assert.equal(latestActiveJob(jobs, JOB_FAMILIES.discover).jobId, 'new-backup');
  assert.equal(latestActiveJob(jobs, JOB_FAMILIES.install).jobId, 'old-install');
  assert.equal(latestActiveJob(jobs, ['support_bundle']).jobId, 'unrelated');
});

test('activeJobs ignores terminal jobs and sorts by newest update', () => {
  const jobs = [
    job('cancelled', 'backup', 'vaultwarden', 'cancelled', '2026-06-21T12:04:00Z'),
    job('new', 'backup', 'vaultwarden', 'running', '2026-06-21T12:05:00Z'),
    job('old', 'backup', 'homepage', 'queued', '2026-06-21T12:01:00Z'),
    job('failed', 'backup', 'jellyfin', 'failed', '2026-06-21T12:07:00Z'),
  ];

  assert.deepEqual(activeJobs(jobs, JOB_FAMILIES.backup).map((candidate) => candidate.jobId), ['new', 'old']);
  assert.equal(terminalJob(jobs[0]), true);
  assert.equal(terminalJob(jobs[1]), false);
});

test('activeJobsByFamily groups app lifecycle and backup work', () => {
  const families = activeJobsByFamily([
    job('install', 'install_app', 'vaultwarden', 'running', '2026-06-21T12:00:00Z'),
    job('repair', 'repair_app', 'homepage', 'running', '2026-06-21T12:01:00Z'),
    job('uninstall', 'uninstall_app', 'memos', 'queued', '2026-06-21T12:03:00Z'),
    job('restore', 'backup_restore', '42:vaultwarden', 'queued', '2026-06-21T12:02:00Z'),
  ]);

  assert.deepEqual(families.appLifecycle.map((candidate) => candidate.jobId), ['uninstall', 'repair', 'install']);
  assert.deepEqual(families.backup.map((candidate) => candidate.jobId), ['restore']);
  assert.deepEqual(families.install.map((candidate) => candidate.jobId), ['install']);
});

test('job list polling stays responsive during work and relaxes while idle', () => {
  assert.equal(jobListRefetchInterval(undefined), 15_000);
  assert.equal(jobListRefetchInterval([]), 15_000);
  assert.equal(jobListRefetchInterval([
    job('finished', 'backup', 'vaultwarden', 'succeeded', '2026-06-21T12:04:00Z'),
  ]), 15_000);
  assert.equal(jobListRefetchInterval([
    job('active', 'install_app', 'vaultwarden', 'running', '2026-06-21T12:05:00Z'),
  ]), 1_200);
});

test('job progress and current step derive stable user-facing progress', () => {
  const running = {
    ...job('install', 'install_app', 'vaultwarden', 'running', '2026-06-21T12:00:00Z'),
    currentStep: 'pull',
    steps: [
      step('plan', 'Review plan', 'succeeded', 'Plan complete'),
      step('pull', 'Download image', 'running', 'Downloading image'),
      step('start', 'Start app', 'pending', ''),
    ],
  };

  assert.equal(currentJobStepText(running), 'Downloading image');
  assert.equal(jobProgressPercent(running), 50);
  assert.equal(jobProgressPercent({ ...running, status: 'succeeded' }), 100);
  assert.equal(jobTypeLabel('backup_verify'), 'Backup verification');
  assert.equal(jobTypeLabel('uninstall_app'), 'Uninstall');
});

test('queued install copy explains the serialized safety boundary', () => {
  assert.equal(
    queuedJobText(job('install', 'install_app', 'vaultwarden', 'queued', '2026-06-21T12:00:00Z'), 'Vaultwarden'),
    'Vaultwarden is waiting to install. Autark-OS installs one app at a time to keep its network setup safe.',
  );
});

function job(jobId, type, subjectId, status, updatedAt) {
  return {
    jobId,
    type,
    subjectId,
    status,
    currentStep: null,
    steps: [],
    createdAt: updatedAt,
    updatedAt,
  };
}

function step(id, label, status, message) {
  return {
    id,
    label,
    message,
    status,
  };
}
