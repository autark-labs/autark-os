import { JOB_FAMILIES, latestActiveJob } from './jobRepository.logic.js';

export function latestActiveDiscoverJob(jobs = [], types = JOB_FAMILIES.discover) {
  return latestActiveJob(jobs, types);
}
