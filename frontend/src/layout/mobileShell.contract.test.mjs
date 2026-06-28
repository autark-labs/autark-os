import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('app shell hides desktop sidebar on mobile and renders a compact mobile app bar', () => {
  const appShell = source('src/layout/AppShell.tsx');

  assert.match(appShell, /<MobileAppBar\s*\/>/);
  assert.match(appShell, /className="hidden lg:block"/);
  assert.match(appShell, /<Sidebar collapsed=\{sidebarCollapsed\} onToggleCollapse=\{toggleSidebar\} \/>/);
  assert.match(appShell, /className="hidden lg:block"[\s\S]*<SystemStatusHeader \/>/);
  assert.match(appShell, /className="px-3 pb-4 pt-3 sm:px-4 md:p-6"/);
  assert.doesNotMatch(appShell, /className="p-4 md:p-6"/);
});

test('mobile app bar uses an accessible sheet navigation drawer', () => {
  const mobileAppBar = source('src/layout/MobileAppBar.tsx');

  assert.match(mobileAppBar, /lg:hidden/);
  assert.match(mobileAppBar, /<Sheet/);
  assert.match(mobileAppBar, /<SheetContent[^>]+side="left"/);
  assert.match(mobileAppBar, /<SheetTitle/);
  assert.match(mobileAppBar, /<SheetDescription/);
  assert.match(mobileAppBar, /aria-label="Open navigation"/);
  assert.match(mobileAppBar, /aria-label="Open system status"/);
  assert.match(mobileAppBar, /w-\[min\(92vw,22rem\)\]/);
  assert.match(mobileAppBar, /overflow-y-auto/);
  assert.match(mobileAppBar, /useGlobalActiveProjectOsJob/);
  assert.match(mobileAppBar, /useSystemDoctorQuery/);
  assert.match(mobileAppBar, /navigationGroups\(viewMode\)/);
});

test('mobile status sheet exposes private access controls without desktop header chrome', () => {
  const mobileAppBar = source('src/layout/MobileAppBar.tsx');

  assert.match(mobileAppBar, /TailscaleControlPopover/);
  assert.match(mobileAppBar, /tailscaleCheck/);
  assert.match(mobileAppBar, /triggerLabel="compact"/);
  assert.match(mobileAppBar, /Private access/);
});

test('desktop sidebar no longer carries mobile horizontal navigation behavior', () => {
  const sidebar = source('src/layout/Sidebar.tsx');

  assert.match(sidebar, /h-screen/);
  assert.match(sidebar, /border-r/);
  assert.match(sidebar, /lg:flex/);
  assert.doesNotMatch(sidebar, /overflow-x-auto/);
  assert.doesNotMatch(sidebar, /border-b border-slate/);
  assert.doesNotMatch(sidebar, /h-auto/);
});

test('desktop status popovers constrain width so borders are not clipped on narrow viewports', () => {
  const statusHeader = source('src/layout/SystemStatusHeader.tsx');

  assert.match(statusHeader, /w-\[min\(92vw,24rem\)\]/);
  assert.match(statusHeader, /w-\[min\(92vw,20rem\)\]/);
});
