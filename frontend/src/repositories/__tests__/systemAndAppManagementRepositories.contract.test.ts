import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('shell doctor status uses a shared system repository query', () => {
  assert.equal(existsSync(resolve(root, 'src/repositories/systemRepository.ts')), true);
  const header = source('src/layout/SystemStatusHeader.tsx');
  const settingsController = source('src/pages/SettingsPage/useSettingsPageController.ts');
  const discoverRepository = source('src/repositories/discoverRepository.ts');
  const systemRepository = source('src/repositories/systemRepository.ts');

  assert.doesNotMatch(header, /SystemAPIClient|setInterval|clearInterval|useEffect/);
  assert.match(header, /useSystemDoctorQuery/);
  assert.match(settingsController, /useSystemDoctorQuery/);
  assert.match(discoverRepository, /useSystemDoctorQuery/);
  assert.match(systemRepository, /systemQueryKeys/);
  assert.match(systemRepository, /doctor:\s*\['system', 'doctor'\]/);
  assert.match(systemRepository, /useSystemDoctorQuery/);
  assert.match(systemRepository, /SystemAPIClient\.doctor/);
  assert.match(systemRepository, /refetchInterval:\s*15_000/);
});

test('app management telemetry uses repository polling keyed by app and open state', () => {
  assert.equal(existsSync(resolve(root, 'src/repositories/appManagementRepository.ts')), true);
  const telemetryTab = source('src/pages/ApplicationsPage/managementTabs/ApplicationTelemetryTab.tsx');
  const repository = source('src/repositories/appManagementRepository.ts');

  assert.doesNotMatch(telemetryTab, /setInterval|clearInterval|InstalledAppsAPIClient\.appTelemetry/);
  assert.match(telemetryTab, /useAppTelemetryQuery/);
  assert.match(repository, /appManagementQueryKeys/);
  assert.match(repository, /telemetry:\s*\(appId: string \| null\)/);
  assert.match(repository, /useAppTelemetryQuery/);
  assert.match(repository, /InstalledAppsAPIClient\.appTelemetry/);
  assert.match(repository, /enabled:\s*open && Boolean\(appId\)/);
  assert.match(repository, /refetchInterval:\s*open \? 2_500 : false/);
});
