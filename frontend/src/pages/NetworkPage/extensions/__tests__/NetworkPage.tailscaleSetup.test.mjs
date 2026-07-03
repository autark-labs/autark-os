import assert from 'node:assert/strict';
import test from 'node:test';
import { tailscaleAccessDisplay, tailscaleHeaderStatus, tailscaleSetupGuidance, tailscaleSetupTasks } from '../NetworkPage.tailscaleSetup.js';

test('asks users to sign in when Tailscale is installed but disconnected', () => {
  const guidance = tailscaleSetupGuidance({ installed: true, connected: false, message: 'Needs login' });

  assert.equal(guidance.goodState, false);
  assert.equal(guidance.tone, 'amber');
  assert.match(guidance.title, /Sign in/);
});

test('reports connected Tailscale account clearly', () => {
  const guidance = tailscaleSetupGuidance({ installed: true, connected: true, loginName: 'jack@example.com', dnsName: 'project.tail.ts.net' });

  assert.equal(guidance.goodState, true);
  assert.match(guidance.summary, /jack@example.com/);
  assert.match(guidance.action, /project.tail.ts.net/);
});

test('builds sign-in task for installed but disconnected hosts', () => {
  const tasks = tailscaleSetupTasks({
    tailscale: { installed: true, connected: false, message: 'Needs login' },
  });

  assert.equal(tasks[0].id, 'connect');
  assert.equal(tasks[0].status, 'warning');
  assert.match(tasks[0].primaryAction.label, /Create or sign in/);
  assert.match(tasks[0].secondaryAction.label, /Set up later/);
});

test('reassures connected users without repeating sign-in prompts', () => {
  const tasks = tailscaleSetupTasks({
    tailscale: { installed: true, connected: true, loginName: 'jack@example.com', dnsName: 'project.tail.ts.net' },
    setup: { checks: [{ id: 'tailscale-operator', status: 'ok', detail: 'operator ready' }] },
  });

  assert.equal(tasks[0].status, 'ok');
  assert.match(tasks[0].title, /signed in/i);
  assert.equal(tasks.some((task) => /sign in/i.test(task.title)), false);
});

test('adds serve permission and magic dns tasks after connection', () => {
  const tasks = tailscaleSetupTasks({
    tailscale: { installed: true, connected: true, dnsName: null },
    setup: { checks: [{ id: 'tailscale-operator', status: 'warning', detail: 'operator missing', actionCommand: 'sudo tailscale set --operator=autarkos' }] },
  });

  assert.equal(tasks.find((task) => task.id === 'serve-permission')?.status, 'warning');
  assert.equal(tasks.find((task) => task.id === 'magic-dns')?.status, 'neutral');
});

test('keeps stale mappings reviewable without making them alarming', () => {
  const tasks = tailscaleSetupTasks({
    tailscale: { installed: true, connected: true, dnsName: 'project.tail.ts.net' },
    setup: { checks: [{ id: 'tailscale-operator', status: 'ok' }] },
    reconciliation: { staleMappings: [{ id: 'old', servePort: 443 }] },
  });

  assert.equal(tasks.find((task) => task.id === 'stale-mappings')?.status, 'neutral');
});

test('maps header status to amber for optional disconnected setup', () => {
  const status = tailscaleHeaderStatus({ status: 'warning', message: 'Tailscale is not connected yet.' });

  assert.equal(status.tone, 'amber');
  assert.equal(status.label, 'Set up later');
});

test('maps header status to green when connected', () => {
  const status = tailscaleHeaderStatus({ status: 'ok', message: 'Connected' });

  assert.equal(status.tone, 'green');
  assert.equal(status.label, 'Signed in');
});

test('labels development mock Tailscale as development-only instead of private ready', () => {
  const display = tailscaleAccessDisplay({
    connected: true,
    installed: true,
    message: 'Development mock connected',
    state: 'mocked_dev',
  });

  assert.equal(display.badge, 'Development mock');
  assert.equal(display.heading, 'Tailscale is mocked for development');
  assert.equal(display.tone, 'warning');
  assert.match(display.summary, /not production private access/i);
});
