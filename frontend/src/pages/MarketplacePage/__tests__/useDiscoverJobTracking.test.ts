import { describe, expect, it } from 'vitest';
import { trackedDiscoverJob } from '../useDiscoverJobTracking';
import type { AutarkOsJob } from '@/types/jobs';

function job(jobId: string, status: AutarkOsJob['status']) {
  return { jobId, status } as AutarkOsJob;
}

describe('Discover durable job tracking', () => {
  it('keeps a live local job visible and resumes a recovered job after a terminal result', () => {
    const liveLocalJob = job('install-local', 'running');
    const recoveredJob = job('install-recovered', 'running');
    const completedLocalJob = job('install-local', 'succeeded');

    expect(trackedDiscoverJob(liveLocalJob, recoveredJob)).toBe(liveLocalJob);
    expect(trackedDiscoverJob(completedLocalJob, recoveredJob)).toBe(recoveredJob);
    expect(trackedDiscoverJob(null, recoveredJob)).toBe(recoveredJob);
  });
});
