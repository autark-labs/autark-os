const TERMINAL_JOB_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

export function latestActiveDiscoverJob(jobs = [], types = ['install_app', 'backup']) {
  const allowedTypes = new Set(types);
  return jobs
    .filter((job) => allowedTypes.has(job.type))
    .filter((job) => !TERMINAL_JOB_STATUSES.has(job.status))
    .toSorted((left, right) => jobTimestamp(right) - jobTimestamp(left))[0] ?? null;
}

function jobTimestamp(job) {
  return new Date(job.updatedAt || job.createdAt || 0).getTime();
}
