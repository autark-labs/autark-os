export type CopyTextResult =
  | { method: 'clipboard' | 'selection'; ok: true }
  | { message: string; ok: false; reason: 'unavailable' };

type CopyTextDependencies = {
  clipboard?: Pick<Clipboard, 'writeText'> | null;
  document?: Pick<Document, 'activeElement' | 'body' | 'createElement' | 'execCommand'> | null;
};

const manualCopyMessage = 'Copying is unavailable in this browser. Select the value and copy it manually.';

/**
 * Copies text using the modern Clipboard API, then a selection-based fallback
 * for HTTP/LAN installs where the Clipboard API is commonly unavailable.
 */
export async function copyText(value: string, dependencies: CopyTextDependencies = {}): Promise<CopyTextResult> {
  const clipboard = dependencies.clipboard ?? globalThis.navigator?.clipboard;
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(value);
      return { ok: true, method: 'clipboard' };
    } catch {
      // Continue to the supported selection fallback below.
    }
  }

  const document = dependencies.document ?? globalThis.document;
  if (!document?.body || !document.createElement || !document.execCommand) {
    return { ok: false, reason: 'unavailable', message: manualCopyMessage };
  }

  const previousFocus = document.activeElement as HTMLElement | null;
  const textArea = document.createElement('textarea');
  textArea.value = value;
  textArea.setAttribute('aria-hidden', 'true');
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  textArea.style.pointerEvents = 'none';
  document.body.appendChild(textArea);
  textArea.select();

  try {
    if (!document.execCommand('copy')) {
      return { ok: false, reason: 'unavailable', message: manualCopyMessage };
    }
    return { ok: true, method: 'selection' };
  } catch {
    return { ok: false, reason: 'unavailable', message: manualCopyMessage };
  } finally {
    textArea.remove();
    previousFocus?.focus?.();
  }
}
