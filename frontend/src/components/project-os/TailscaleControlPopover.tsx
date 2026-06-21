import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, Copy, ExternalLink, LockKeyhole, Network, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { NetworkAPIClient } from '@/api/NetworkAPIClient';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { notify } from '@/lib/notifications';
import { cn } from '@/lib/utils';
import type { PrivateAccessReconciliationReport, TailscaleStatus } from '@/types/network';
import type { SystemSetupCheck } from '@/types/system';

type TailscaleControlPopoverProps = {
  align?: 'center' | 'end' | 'start';
  check?: SystemSetupCheck | null;
  className?: string;
  loading?: boolean;
  triggerLabel?: 'full' | 'compact';
};

export function TailscaleControlPopover({ align = 'end', check = null, className, loading = false, triggerLabel = 'full' }: TailscaleControlPopoverProps) {
  const [status, setStatus] = useState<TailscaleStatus | null>(null);
  const [reconciliation, setReconciliation] = useState<PrivateAccessReconciliationReport | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [nextStatus, nextReconciliation] = await Promise.all([
        NetworkAPIClient.tailscaleStatus(),
        NetworkAPIClient.privateAccessReconciliation().catch(() => null),
      ]);
      setStatus(nextStatus);
      setReconciliation(nextReconciliation);
    } catch (error) {
      notify({ severity: 'warning', title: 'Tailscale status unavailable', message: error instanceof Error ? error.message : 'Project OS could not refresh Tailscale status.' });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const view = useMemo(() => tailscaleControlView(status, check, reconciliation), [check, reconciliation, status]);
  const StatusIcon = view.tone === 'green' ? CheckCircle2 : CircleAlert;

  async function copyHostname() {
    const hostname = status?.dnsName || status?.deviceName || '';
    if (!hostname) return;
    await navigator.clipboard.writeText(hostname);
    setCopied(true);
    notify({ severity: 'success', title: 'Hostname copied', message: hostname });
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={`Tailscale: ${loading && !status ? 'checking' : view.label}`}
          className={cn('h-8 gap-2 rounded-po-sm border px-2.5 text-xs', toneClass(view.tone), className)}
          size="sm"
          type="button"
          variant="outline"
        >
          <span className={cn('size-2 rounded-full', view.tone === 'green' && 'bg-po-success shadow-po-success-glow', view.tone === 'amber' && 'bg-po-warning shadow-po-warning-glow', view.tone === 'red' && 'bg-po-danger shadow-po-danger-glow')} />
          <Network data-icon="inline-start" />
          {triggerLabel === 'full' && <span className="hidden font-semibold sm:inline">Tailscale</span>}
          <span className="font-semibold">{loading && !status ? 'Checking' : view.label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-[min(92vw,360px)] gap-3 border-po-border bg-po-surface-elevated p-3 text-po-text shadow-po-md">
        <PopoverHeader>
          <PopoverTitle className="flex items-center gap-2 text-sm">
            <StatusIcon className={cn('size-4', view.tone === 'green' && 'text-po-success', view.tone === 'amber' && 'text-po-warning', view.tone === 'red' && 'text-po-danger')} />
            {view.title}
          </PopoverTitle>
          <PopoverDescription className="text-xs text-po-text-muted">
            {view.summary}
          </PopoverDescription>
        </PopoverHeader>

        <div className="grid gap-2 rounded-po-sm border border-po-border bg-po-surface-inset p-3 text-xs">
          <StatusRow ready={view.connected} label={view.mock ? 'Development mock' : 'Signed in'} />
          <StatusRow ready={view.magicDnsReady} label="MagicDNS ready" />
          <StatusRow ready={view.httpsReady} label="HTTPS ready" />
          <StatusRow ready={view.serveReady} label="Serve ready" />
          {status?.deviceName && <p className="m-0 pt-1 text-po-text-muted">Device: <span className="text-po-text-secondary">{status.deviceName}</span></p>}
          <p className="m-0 text-po-text-muted">Private links: <span className="text-po-text-secondary">{view.privateLinksReady} ready</span></p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {view.connected ? (
            <Button asChild size="sm" variant="secondary">
              <a href="https://login.tailscale.com/admin/machines" rel="noreferrer" target="_blank">
                Manage Tailscale
                <ExternalLink data-icon="inline-end" />
              </a>
            </Button>
          ) : (
            <Button asChild size="sm">
              <a href="https://login.tailscale.com/start" rel="noreferrer" target="_blank">
                Sign in
                <ExternalLink data-icon="inline-end" />
              </a>
            </Button>
          )}
          <Button asChild size="sm" variant="outline">
            <Link to="/access">{view.connected ? 'Access settings' : 'Setup instructions'}</Link>
          </Button>
          <Button disabled={refreshing} onClick={load} size="sm" type="button" variant="outline">
            <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
            Check again
          </Button>
          {view.connected && (
            <Button disabled={!status?.dnsName && !status?.deviceName} onClick={copyHostname} size="sm" type="button" variant="outline">
              {copied ? <CheckCircle2 className="size-3.5" /> : <Copy className="size-3.5" />}
              Copy hostname
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function StatusRow({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {ready ? <CheckCircle2 className="size-3.5 text-po-success" /> : <LockKeyhole className="size-3.5 text-po-text-muted" />}
      <span className={ready ? 'text-po-text-secondary' : 'text-po-text-muted'}>{label}</span>
    </div>
  );
}

function tailscaleControlView(status: TailscaleStatus | null, check: SystemSetupCheck | null, reconciliation: PrivateAccessReconciliationReport | null) {
  const connected = Boolean(status?.connected || check?.status === 'ok');
  const installed = status?.installed ?? check?.status !== 'warning';
  const mock = status?.state === 'mocked_dev' || status?.message?.toLowerCase().includes('mock') || false;
  const magicDnsReady = connected && Boolean(status?.dnsName || mock);
  const privateLinksReady = (reconciliation?.apps || []).filter((app) => app.status === 'healthy' || app.expectedPrivateUrl || app.actualPrivateUrl).length;
  const httpsReady = connected && (privateLinksReady > 0 || mock || check?.status === 'ok');
  const serveReady = connected && (reconciliation?.status === 'healthy' || privateLinksReady > 0 || mock || check?.status === 'ok');
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
      tone: 'amber' as const,
    };
  }
  if (connected) {
    return {
      connected,
      httpsReady,
      label: 'Signed in',
      magicDnsReady,
      mock,
      privateLinksReady,
      serveReady,
      summary: 'Private links are available for trusted devices on your tailnet.',
      title: 'Tailscale connected',
      tone: 'green' as const,
    };
  }
  return {
    connected: false,
    httpsReady: false,
    label: installed ? 'Not signed in' : 'Missing',
    magicDnsReady: false,
    mock,
    privateLinksReady,
    serveReady: false,
    summary: 'Your apps still work on your home network. Sign in to use private links from trusted devices.',
    title: installed ? 'Tailscale not signed in' : 'Tailscale missing',
    tone: installed ? 'amber' as const : 'red' as const,
  };
}

function toneClass(tone: 'amber' | 'green' | 'red') {
  if (tone === 'green') {
    return 'border-po-success/30 bg-po-success/10 text-po-success hover:bg-po-success/15';
  }
  if (tone === 'amber') {
    return 'border-po-warning/35 bg-po-warning/10 text-po-warning hover:bg-po-warning/15';
  }
  return 'border-po-danger/35 bg-po-danger/10 text-po-danger hover:bg-po-danger/15';
}
