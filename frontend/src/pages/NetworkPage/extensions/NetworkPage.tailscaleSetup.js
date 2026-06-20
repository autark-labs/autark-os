/**
 * @typedef {{ label: string, href?: string, command?: string | null }} TailscaleTaskAction
 * @typedef {{
 *   id: string,
 *   status: 'ok' | 'warning' | 'neutral',
 *   title: string,
 *   detail: string,
 *   primaryAction: TailscaleTaskAction,
 *   secondaryAction?: TailscaleTaskAction,
 * }} TailscaleSetupTask
 */

export function tailscaleSetupGuidance(tailscale) {
  if (!tailscale?.installed) {
    return {
      tone: 'red',
      title: 'Tailscale is not installed',
      summary: 'Private app links need Tailscale installed on this Project OS host.',
      action: 'Install or reconnect Tailscale from the guided setup.',
      goodState: false,
    };
  }
  if (!tailscale.connected) {
    return {
      tone: 'amber',
      title: 'Sign in to Tailscale',
      summary: tailscale.message || 'Project OS can create private links after this host is signed in to a Tailscale account.',
      action: 'Open the sign-in link or run the guided Tailscale connection step.',
      goodState: false,
    };
  }
  return {
    tone: 'green',
    title: 'Tailscale is connected',
    summary: tailscale.loginName ? `Signed in as ${tailscale.loginName}.` : 'This Project OS host is connected to your Tailscale network.',
    action: tailscale.dnsName ? `Use ${tailscale.dnsName} for private links.` : 'Private links are ready.',
    goodState: true,
  };
}

/**
 * @param {{ tailscale?: any, setup?: any, reconciliation?: any }} input
 * @returns {TailscaleSetupTask[]}
 */
export function tailscaleSetupTasks({ tailscale, setup = null, reconciliation = null } = {}) {
  const tasks = [];
  const operatorCheck = setup?.checks?.find((check) => check.id === 'tailscale-operator') ?? null;

  if (!tailscale?.installed) {
    tasks.push({
      id: 'install',
      status: 'warning',
      title: 'Install Tailscale',
      detail: 'Private app links need Tailscale installed on this Project OS host.',
      primaryAction: { label: 'Install Tailscale', href: 'https://tailscale.com/download' },
      secondaryAction: { label: 'Set up later', href: '/network' },
    });
    return tasks;
  }

  if (!tailscale.connected) {
    tasks.push({
      id: 'connect',
      status: 'warning',
      title: 'Connect Project OS to Tailscale',
      detail: tailscale.message || 'Sign in or create a Tailscale account to enable private app links from trusted devices.',
      primaryAction: { label: 'Create or sign in', href: 'https://login.tailscale.com/start' },
      secondaryAction: { label: 'Set up later', href: '/network' },
    });
    return tasks;
  }

  tasks.push({
    id: 'connect',
    status: 'ok',
    title: tailscale.loginName ? `Signed in as ${tailscale.loginName}` : 'Tailscale is connected',
    detail: tailscale.dnsName || tailscale.deviceName || 'This Project OS host is connected to your private network.',
    primaryAction: { label: 'View devices', href: '/network' },
  });

  tasks.push({
    id: 'serve-permission',
    status: operatorCheck?.status === 'ok' ? 'ok' : 'warning',
    title: 'Tailscale Serve permission',
    detail: operatorCheck?.detail || 'Project OS needs operator permission before it can create or repair private app links.',
    primaryAction: {
      label: operatorCheck?.status === 'ok' ? 'Permission ready' : 'Copy setup command',
      command: operatorCheck?.actionCommand || null,
    },
  });

  tasks.push({
    id: 'magic-dns',
    status: tailscale.dnsName ? 'ok' : 'neutral',
    title: 'MagicDNS and HTTPS names',
    detail: tailscale.dnsName || 'Enable MagicDNS and HTTPS certificates in Tailscale for friendly private links.',
    primaryAction: { label: tailscale.dnsName ? 'DNS ready' : 'Open Tailscale admin', href: 'https://login.tailscale.com/admin/dns' },
  });

  const staleCount = reconciliation?.staleMappings?.length ?? 0;
  if (staleCount > 0) {
    tasks.push({
      id: 'stale-mappings',
      status: 'neutral',
      title: 'Review stale private links',
      detail: `${staleCount} Tailscale Serve ${staleCount === 1 ? 'mapping no longer matches' : 'mappings no longer match'} an app that wants private access.`,
      primaryAction: { label: 'Review stale links', href: '/network' },
    });
  }

  return tasks;
}

/**
 * @param {any} check
 * @returns {{ dot: 'green' | 'amber' | 'red', label: string, summary: string, tone: 'green' | 'amber' | 'red' }}
 */
export function tailscaleHeaderStatus(check) {
  if (check?.status === 'ok') {
    return {
      dot: 'green',
      label: 'Signed in',
      summary: 'Tailscale is connected, so private app links can be enabled.',
      tone: 'green',
    };
  }
  const text = `${check?.message || ''} ${check?.detail || ''}`.toLowerCase();
  if (text.includes('not installed') || text.includes('missing')) {
    return {
      dot: 'red',
      label: 'Install',
      summary: 'Install Tailscale when you want private app links from trusted devices.',
      tone: 'red',
    };
  }
  return {
    dot: 'amber',
    label: 'Set up later',
    summary: 'Private access is optional. You can keep using Project OS locally and connect Tailscale later.',
    tone: 'amber',
  };
}
