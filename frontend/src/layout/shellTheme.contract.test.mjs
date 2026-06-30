import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

test('outer shell uses tempered Project OS theme tokens', () => {
  const appShell = source('src/layout/AppShell.tsx');
  const sidebar = source('src/layout/Sidebar.tsx');
  const mobileAppBar = source('src/layout/MobileAppBar.tsx');
  const systemStatusHeader = source('src/layout/SystemStatusHeader.tsx');
  const shellSource = [appShell, sidebar, mobileAppBar, systemStatusHeader].join('\n');

  assert.match(appShell, /bg-po-bg/);
  assert.match(appShell, /bg-po-bg-mesh/);
  assert.match(sidebar, /bg-po-sidebar/);
  assert.match(sidebar, /bg-po-brand/);
  assert.match(sidebar, /text-po-brand-strong/);
  assert.match(systemStatusHeader, /bg-po-sidebar/);
  assert.match(mobileAppBar, /bg-po-sidebar/);
  assert.match(mobileAppBar, /SheetContent className="[^"]*bg-po-sidebar/);

  assert.doesNotMatch(shellSource, /violet|purple/i);
  assert.doesNotMatch(shellSource, /bg-slate-950\/8|bg-slate-950 p-0|bg-slate-950\/50/);
});

test('shell status colors follow cyan primary, orange attention, red failure rules', () => {
  const sidebar = source('src/layout/Sidebar.tsx');
  const mobileAppBar = source('src/layout/MobileAppBar.tsx');
  const systemStatusHeader = source('src/layout/SystemStatusHeader.tsx');

  assert.match(sidebar, /setupReady \? 'bg-po-info/);
  assert.match(sidebar, /: 'bg-po-warning/);
  assert.match(mobileAppBar, /statusTone === 'warning' && 'border-po-warning-border bg-po-warning-soft/);
  assert.match(mobileAppBar, /statusTone === 'info' && 'border-po-info-border bg-po-info-soft/);
  assert.match(systemStatusHeader, /statusTone === 'info'/);
  assert.match(systemStatusHeader, /statusTone === 'error'/);
  assert.doesNotMatch(systemStatusHeader, /statusTone === 'blue'/);
  assert.doesNotMatch(systemStatusHeader, /statusTone === 'red'/);
});
