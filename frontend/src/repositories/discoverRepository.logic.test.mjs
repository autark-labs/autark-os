import assert from 'node:assert/strict';
import test from 'node:test';
import {
  latestActiveDiscoverJob,
} from './discoverRepository.logic.js';

test('latestActiveDiscoverJob restores newest active install or backup job from durable jobs', () => {
  const jobs = [
    job('old-install', 'install_app', 'vaultwarden', 'running', '2026-06-21T12:00:00Z'),
    job('finished-install', 'install_app', 'homepage', 'succeeded', '2026-06-21T12:04:00Z'),
    job('new-backup', 'backup', 'jellyfin', 'queued', '2026-06-21T12:05:00Z'),
    job('unrelated', 'support_bundle', 'system', 'running', '2026-06-21T12:10:00Z'),
  ];

  assert.equal(latestActiveDiscoverJob(jobs)?.jobId, 'new-backup');
  assert.equal(latestActiveDiscoverJob(jobs, ['install_app'])?.jobId, 'old-install');
});

test('latestActiveDiscoverJob ignores terminal jobs', () => {
  const jobs = [
    job('failed-install', 'install_app', 'vaultwarden', 'failed', '2026-06-21T12:00:00Z'),
    job('cancelled-backup', 'backup', 'vaultwarden', 'cancelled', '2026-06-21T12:01:00Z'),
  ];

  assert.equal(latestActiveDiscoverJob(jobs), null);
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
