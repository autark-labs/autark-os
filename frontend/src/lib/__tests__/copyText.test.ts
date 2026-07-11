import assert from 'node:assert/strict';
import { test } from 'vitest';
import { copyText } from '../copyText';

test('uses the Clipboard API when it is available', async () => {
  const copied: string[] = [];
  const result = await copyText('https://autark.local', {
    clipboard: { writeText: async (value) => { copied.push(value); } },
  });

  assert.deepEqual(result, { ok: true, method: 'clipboard' });
  assert.deepEqual(copied, ['https://autark.local']);
});

test('uses the selection fallback when the Clipboard API rejects', async () => {
  let focusRestored = false;
  const textArea = {
    remove: () => undefined,
    select: () => undefined,
    setAttribute: () => undefined,
    style: {},
    value: '',
  } as unknown as HTMLTextAreaElement;
  const result = await copyText('sudo tailscale up', {
    clipboard: { writeText: async () => { throw new Error('HTTP context'); } },
    document: {
      activeElement: { focus: () => { focusRestored = true; } } as unknown as Element,
      body: { appendChild: () => textArea } as unknown as HTMLBodyElement,
      createElement: () => textArea,
      execCommand: (command) => command === 'copy',
    },
  });

  assert.deepEqual(result, { ok: true, method: 'selection' });
  assert.equal(textArea.value, 'sudo tailscale up');
  assert.equal(focusRestored, true);
});

test('returns a manual-copy instruction when neither copy method is available', async () => {
  const result = await copyText('value', {
    clipboard: null,
    document: null,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /select the value/i);
  }
});
