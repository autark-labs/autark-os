type DownloadDependencies = {
  createObjectURL?: ((blob: Blob) => string) | null;
  document?: Pick<Document, 'body' | 'createElement'> | null;
  revokeObjectURL?: ((url: string) => void) | null;
};

export function supportReportFilename(generatedAt: string | null | undefined) {
  const date = generatedAt ? new Date(generatedAt) : new Date();
  const stamp = Number.isNaN(date.getTime())
    ? 'report'
    : date.toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z');
  return `autark-os-support-report-${stamp}.txt`;
}

export function downloadSupportReport(text: string, generatedAt?: string | null, dependencies: DownloadDependencies = {}) {
  const document = dependencies.document ?? globalThis.document;
  const createObjectURL = dependencies.createObjectURL ?? globalThis.URL?.createObjectURL;
  const revokeObjectURL = dependencies.revokeObjectURL ?? globalThis.URL?.revokeObjectURL;
  if (!document?.body || !document.createElement || !createObjectURL || !revokeObjectURL) {
    return false;
  }

  const url = createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = supportReportFilename(generatedAt);
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  revokeObjectURL(url);
  return true;
}
