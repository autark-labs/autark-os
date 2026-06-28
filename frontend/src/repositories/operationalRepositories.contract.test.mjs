import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('operational pages use repository hooks instead of page-local polling', () => {
  const pages = [
    'src/pages/StoragePage/StoragePage.tsx',
    'src/pages/BackupsPage/BackupsPage.tsx',
    'src/pages/MonitoringPage/MonitoringPage.tsx',
  ];

  for (const pagePath of pages) {
    const page = source(pagePath);
    assert.doesNotMatch(page, /setInterval|clearInterval/);
    assert.doesNotMatch(page, /SystemAPIClient|BackupAPIClient|JobsAPIClient|MonitoringAPIClient|ActivityAPIClient|InstalledAppsAPIClient/);
  }

  assert.equal(existsSync(resolve(root, 'src/repositories/storageRepository.ts')), true);
  assert.equal(existsSync(resolve(root, 'src/repositories/backupRepository.ts')), true);
  assert.equal(existsSync(resolve(root, 'src/repositories/monitoringRepository.ts')), true);

  const storageRepository = source('src/repositories/storageRepository.ts');
  const backupRepository = source('src/repositories/backupRepository.ts');
  const jobRepository = source('src/repositories/jobRepository.ts');
  const monitoringRepository = source('src/repositories/monitoringRepository.ts');

  assert.match(storageRepository, /storageQueryKeys/);
  assert.match(storageRepository, /useStorageReportRepository/);
  assert.match(storageRepository, /useCleanupOrphanMutation/);
  assert.match(storageRepository, /refetchInterval:\s*30_000/);

  assert.match(backupRepository, /backupQueryKeys/);
  assert.match(backupRepository, /useBackupReportRepository/);
  assert.match(backupRepository, /useBackupJobsQuery/);
  assert.match(backupRepository, /useProjectOsJobQuery/);
  assert.match(backupRepository, /useProjectOsJobsQuery/);
  assert.match(backupRepository, /useSharedProjectOsJobQuery/);
  assert.doesNotMatch(backupRepository, /JobsAPIClient/);

  assert.match(jobRepository, /JobsAPIClient\.list/);
  assert.match(jobRepository, /JobsAPIClient\.get/);
  assert.match(jobRepository, /enabled:\s*Boolean\(jobId\)/);

  const backupsPage = source('src/pages/BackupsPage/BackupsPage.tsx');
  assert.match(backupsPage, /useBackupJobsQuery/);
  assert.match(backupsPage, /selectActiveBackupJob/);
  assert.match(backupsPage, /currentActiveJob/);

  assert.match(monitoringRepository, /monitoringQueryKeys/);
  assert.match(monitoringRepository, /useMonitoringRepository/);
  assert.match(monitoringRepository, /useMonitoringDiagnosticsMutation/);
  assert.match(monitoringRepository, /refetchInterval:\s*10_000/);
});
