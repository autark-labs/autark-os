type TailscaleStatus = {
  connected?: boolean;
  deviceName?: string | null;
  dnsName?: string | null;
  installed?: boolean;
  message?: string | null;
  mock?: boolean;
  state?: string | null;
};

type PrivateLinkReconciliation = {
  apps?: Array<{ status?: string | null }>;
};

export function tailscaleControlView(
  status: TailscaleStatus | null | undefined,
  reconciliation: PrivateLinkReconciliation | null | undefined,
) {
  const mock = status?.state === 'dev' || status?.state === 'mocked_dev' || status?.message?.toLowerCase().includes('mock') || false;
  const connected = Boolean(status?.connected || mock);
  const installed = Boolean(status?.installed);
  const magicDnsReady = connected && Boolean(status?.dnsName || mock);
  const privateLinksReady = reconciliation ? (reconciliation.apps || []).filter((app) => app.status === 'healthy').length : null;
  const httpsReady = connected && Boolean(status?.dnsName || (privateLinksReady ?? 0) > 0 || mock);
  const serveReady = connected && Boolean((privateLinksReady ?? 0) > 0 || mock);

  if (mock) {
    return {
      connected: true,
      httpsReady: true,
      label: 'Mock connected',
      magicDnsReady: true,
      mock,
      privateLinksReady,
      serveReady: true,
      summary: 'Development mode is simulating Tailscale.',
      title: 'Tailscale mock connected',
      tone: 'amber',
    };
  }

  if (connected) {
    const summary = serveReady
      ? 'Verified private links are available for trusted devices on your tailnet.'
      : magicDnsReady
        ? 'Tailscale is connected. Private links will show as ready after Autark-OS verifies live Serve mappings.'
        : 'Tailscale is connected, but private HTTPS links need MagicDNS and HTTPS readiness before they are available.';
    return {
      connected,
      httpsReady,
      label: 'Signed in',
      magicDnsReady,
      mock,
      privateLinksReady,
      serveReady,
      summary,
      title: 'Tailscale connected',
      tone: 'green',
    };
  }

  return {
    connected: false,
    httpsReady: false,
    label: !status ? 'Unavailable' : installed ? 'Not signed in' : 'Missing',
    magicDnsReady: false,
    mock,
    privateLinksReady,
    serveReady: false,
    summary: !status ? 'Tailscale status is unavailable. Check again to retry.' : 'Your apps still work on your home network. Sign in to use private links from trusted devices.',
    title: !status ? 'Tailscale status unavailable' : installed ? 'Tailscale not signed in' : 'Tailscale missing',
    tone: installed ? 'amber' : 'red',
  };
}

export function tailscaleControlActions(status: TailscaleStatus | null | undefined) {
  if (!status) return [
    { id: 'access', label: 'Access settings', href: '/access', external: false, enabled: true },
    { id: 'refresh', label: 'Check again', enabled: true },
  ];
  if (status?.connected || status?.mock) {
    return [
      { id: 'admin', label: 'Manage Tailscale', href: 'https://login.tailscale.com/admin/machines', external: true, enabled: true },
      { id: 'access', label: 'Access settings', href: '/access', external: false, enabled: true },
      { id: 'refresh', label: 'Check again', enabled: true },
      { id: 'copy-hostname', label: 'Copy hostname', enabled: Boolean(status?.dnsName || status?.deviceName) },
    ];
  }

  return [
    { id: 'signin', label: 'Sign in', href: 'https://login.tailscale.com/start', external: true, enabled: true },
    { id: 'access', label: 'Setup instructions', href: '/access', external: false, enabled: true },
    { id: 'refresh', label: 'Check again', enabled: true },
  ];
}
