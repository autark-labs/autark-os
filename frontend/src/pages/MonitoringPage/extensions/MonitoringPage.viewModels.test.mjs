import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAppTrendData,
  buildCategoryData,
  buildHostTrendData,
  buildLevelData,
  buildResourceData,
} from './MonitoringPage.viewModels.js';

test('Monitoring view models group activity by visible category and level', () => {
  const events = [
    event({ category: 'install', level: 'success' }),
    event({ category: 'install', level: 'warning' }),
    event({ category: 'backup', level: 'error' }),
    event({ category: 'debug', level: 'info' }),
  ];

  assert.deepEqual(buildCategoryData(events), [
    { label: 'Install', count: 2 },
    { label: 'Backup', count: 1 },
  ]);
  assert.deepEqual(buildLevelData(events), [
    { label: 'Error', count: 1 },
    { label: 'Warning', count: 1 },
    { label: 'Success', count: 1 },
    { label: 'Info', count: 1 },
  ]);
});

test('Monitoring resource view model clamps telemetry and sorts highest resource users', () => {
  const resourceData = buildResourceData({
    vaultwarden: telemetry('140%', '2%'),
    homepage: telemetry('5%', '80%'),
    idle: telemetry('0%', '0%'),
  });

  assert.deepEqual(resourceData, [
    { label: 'Vaultwarden', cpu: 100, memory: 2 },
    { label: 'Homepage', cpu: 5, memory: 80 },
  ]);
});

test('Monitoring trend view models bucket samples into readable averages', () => {
  const hostTrend = buildHostTrendData([
    hostSample('2026-06-21T12:00:00Z', 10, 20, 30),
    hostSample('2026-06-21T12:01:00Z', 20, 30, 40),
  ]);
  const appTrend = buildAppTrendData([
    appSample('2026-06-21T12:00:00Z', 5, 10),
    appSample('2026-06-21T12:01:00Z', 15, 20),
  ]);

  assert.equal(hostTrend.length, 2);
  assert.deepEqual(hostTrend.map((point) => [point.cpu, point.memory, point.disk]), [[10, 20, 30], [20, 30, 40]]);
  assert.equal(appTrend.length, 2);
  assert.deepEqual(appTrend.map((point) => [point.cpu, point.memory]), [[5, 10], [15, 20]]);
});

function event(overrides = {}) {
  return {
    id: 1,
    category: 'system',
    level: 'info',
    outcome: 'completed',
    title: 'Event',
    message: '',
    createdAt: '2026-06-21T12:00:00Z',
    ...overrides,
  };
}

function telemetry(cpuPercent, memoryPercent) {
  return {
    cpuPercent,
    memoryPercent,
    memoryUsage: '',
    networkIo: '',
    blockIo: '',
    checkedAt: '2026-06-21T12:00:00Z',
  };
}

function hostSample(sampledAt, systemCpuPercent, usedMemoryPercent, runtimeUsedPercent) {
  return { sampledAt, systemCpuPercent, usedMemoryPercent, runtimeUsedPercent };
}

function appSample(sampledAt, cpuPercent, memoryPercent) {
  return { sampledAt, cpuPercent, memoryPercent };
}
