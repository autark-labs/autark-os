import assert from 'node:assert/strict';
import { test } from 'vitest';
import { downloadSupportReport, supportReportFilename } from '../SupportPage.supportReport';

test('uses a useful, safe text filename for support-report downloads', () => {
  assert.equal(supportReportFilename('2026-07-11T19:42:03.000Z'), 'autark-os-support-report-2026-07-11T19-42-03Z.txt');
  assert.match(supportReportFilename('not-a-date'), /^autark-os-support-report-report\.txt$/);
});

test('downloads a generated report without depending on Clipboard access', () => {
  let clicked = false;
  let revoked = '';
  const anchor = {
    click: () => { clicked = true; },
    download: '',
    href: '',
    remove: () => undefined,
    style: {},
  } as unknown as HTMLAnchorElement;
  const downloaded = downloadSupportReport('redacted report', '2026-07-11T19:42:03.000Z', {
    createObjectURL: () => 'blob:report',
    document: {
      body: { appendChild: () => anchor } as unknown as HTMLBodyElement,
      createElement: () => anchor,
    },
    revokeObjectURL: (url) => { revoked = url; },
  });

  assert.equal(downloaded, true);
  assert.equal(clicked, true);
  assert.equal(anchor.download, 'autark-os-support-report-2026-07-11T19-42-03Z.txt');
  assert.equal(revoked, 'blob:report');
});

test('reports unavailable downloads without throwing', () => {
  assert.equal(downloadSupportReport('report', null, { document: null, createObjectURL: null, revokeObjectURL: null }), false);
});
