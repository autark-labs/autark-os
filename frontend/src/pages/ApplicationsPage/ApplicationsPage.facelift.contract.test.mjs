import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('my apps uses a controlled management sheet instead of inline expansion or tabbed modal', () => {
  assert.equal(existsSync(resolve(root, 'src/pages/ApplicationsPage/ApplicationsPageDrawer.tsx')), true);
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');
  const dashboard = source('src/pages/ApplicationsPage/ApplicationsDashboard.tsx');
  const drawer = source('src/pages/ApplicationsPage/ApplicationsPageDrawer.tsx');

  assert.match(page, /AppManagementSheet/);
  assert.doesNotMatch(page, /ManageAppDialog/);
  assert.doesNotMatch(dashboard, /ExpandedAppManagement/);
  assert.doesNotMatch(dashboard, /selectedId/);
  assert.match(drawer, /SheetContent/);
  assert.doesNotMatch(drawer, /Tabs|TabsContent|TabsList|TabsTrigger/);
  assert.match(drawer, /Technical details/);
});

test('my apps actions are tracked per app and uninstall uses durable jobs', () => {
  const page = source('src/pages/ApplicationsPage/ApplicationsPage.tsx');
  const dashboard = source('src/pages/ApplicationsPage/ApplicationsDashboard.tsx');
  const client = source('src/api/InstalledAppsAPIClient.ts');

  assert.match(client, /post<ProjectOsJob>\(`\/api\/apps\/\$\{appId\}\/uninstall`\)/);
  assert.match(page, /actionLoadingByAppId/);
  assert.match(page, /useProjectOsJobsQuery/);
  assert.match(page, /setProjectOsJobCache/);
  assert.doesNotMatch(page, /removeManagedAppFromApplicationStateCache/);
  assert.match(dashboard, /uninstallingAppIds/);
  assert.match(dashboard, /Uninstalling\.\.\. Project OS is removing this app safely\./);
});

test('basic and advanced my apps surfaces keep icons and direct drawer controls', () => {
  const dashboard = source('src/pages/ApplicationsPage/ApplicationsDashboard.tsx');

  assert.match(dashboard, /AppIcon app=\{app\}/);
  assert.match(dashboard, /nextActionForApp/);
  assert.match(dashboard, /OperationsTable/);
  assert.match(dashboard, /DropdownMenu/);
  assert.match(dashboard, /onManage\(app\.appId\)/);
  assert.match(dashboard, /Review restore|Repair|Start|Review/);
});
