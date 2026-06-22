export function buildCategoryData(events) {
  const categories = ['install', 'health', 'repair', 'access', 'backup', 'system', 'api'];
  return categories.map((category) => ({
    label: humanize(category),
    count: events.filter((event) => event.category === category).length,
  })).filter((point) => point.count > 0).slice(0, 7);
}

export function buildLevelData(events) {
  return ['error', 'warning', 'success', 'info'].map((level) => ({
    label: humanize(level),
    count: events.filter((event) => event.level === level).length,
  }));
}

export function buildResourceData(telemetryByAppId) {
  return Object.entries(telemetryByAppId)
    .map(([appId, telemetry]) => ({
      label: shortAppLabel(appId),
      cpu: clamp(parsePercent(telemetry.cpuPercent)),
      memory: clamp(parsePercent(telemetry.memoryPercent)),
    }))
    .filter((point) => point.cpu > 0 || point.memory > 0)
    .sort((left, right) => (right.cpu + right.memory) - (left.cpu + left.memory))
    .slice(0, 6);
}

export function buildHostTrendData(samples) {
  return bucketSamples(samples, (bucket) => ({
    label: formatTime(bucket[0].sampledAt),
    cpu: average(bucket.map((sample) => sample.systemCpuPercent)),
    memory: average(bucket.map((sample) => sample.usedMemoryPercent)),
    disk: average(bucket.map((sample) => sample.runtimeUsedPercent)),
  }));
}

export function buildAppTrendData(samples) {
  return bucketSamples(samples, (bucket) => ({
    label: formatTime(bucket[0].sampledAt),
    cpu: average(bucket.map((sample) => sample.cpuPercent)),
    memory: average(bucket.map((sample) => sample.memoryPercent)),
  }));
}

export function humanize(value) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function bucketSamples(samples, mapper) {
  if (!samples.length) {
    return [];
  }
  const bucketSize = Math.max(1, Math.ceil(samples.length / 18));
  const buckets = [];
  samples.forEach((sample, index) => {
    const bucketIndex = Math.floor(index / bucketSize);
    buckets[bucketIndex] = buckets[bucketIndex] || [];
    buckets[bucketIndex].push(sample);
  });
  return buckets.filter(Boolean).map(mapper);
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) {
    return 0;
  }
  return Math.round((valid.reduce((total, value) => total + value, 0) / valid.length) * 10) / 10;
}

function shortAppLabel(appId) {
  return appId
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .slice(0, 14);
}

function formatTime(value) {
  if (!value) {
    return '';
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function parsePercent(value) {
  const parsed = Number.parseFloat(String(value).replace('%', '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value) {
  return Math.max(0, Math.min(100, value));
}
