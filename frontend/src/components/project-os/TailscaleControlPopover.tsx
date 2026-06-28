import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, Copy, ExternalLink, LockKeyhole, Network, RefreshCw, Terminal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { NetworkAPIClient } from '@/api/NetworkAPIClient';
import { DisabledAction } from '@/components/project-os/DisabledAction';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { tailscaleControlActions, tailscaleControlView } from './TailscaleControlPopover.logic.js';
import { toast } from 'sonner';
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
      toast.warning('Tailscale status unavailable', {
        description: error instanceof Error ? error.message : 'Project OS could not refresh Tailscale status.',
      });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const view = useMemo(() => tailscaleControlView(status, check, reconciliation), [check, reconciliation, status]);
  const actions = useMemo(() => tailscaleControlActions({ ...status, connected: view.connected, mock: view.mock }), [status, view.connected, view.mock]);
  const viewTone = view.tone as 'amber' | 'green' | 'red';
  const StatusIcon = viewTone === 'green' ? CheckCircle2 : CircleAlert;

  async function copyHostname() {
    const hostname = status?.dnsName || status?.deviceName || '';
    if (!hostname) return;
    await navigator.clipboard.writeText(hostname);
    setCopied(true);
    toast.success('Hostname copied', { description: hostname });
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function copySetupCommand() {
    const command = check?.actionCommand || 'sudo tailscale up';
    await navigator.clipboard.writeText(command);
    toast.success('Tailscale command copied', { description: command });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={`Tailscale: ${loading && !status ? 'checking' : view.label}`}
          className={cn('h-8 gap-2 rounded-po-sm border px-2.5 text-xs', toneClass(viewTone), className)}
          size="sm"
          type="button"
          variant="outline"
        >
          <span className={cn('size-2 rounded-full', viewTone === 'green' && 'bg-po-success shadow-po-success-glow', viewTone === 'amber' && 'bg-po-warning shadow-po-warning-glow', viewTone === 'red' && 'bg-po-danger shadow-po-danger-glow')} />
          <Network data-icon="inline-start" />
          {triggerLabel === 'full' && <span className="hidden font-semibold sm:inline">Tailscale</span>}
          <span className="font-semibold">{loading && !status ? 'Checking' : view.label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-[min(92vw,420px)] gap-3 border-po-border bg-po-surface-elevated p-3 text-po-text shadow-po-lg">
        <PopoverHeader>
          <PopoverTitle className="flex items-center gap-2 text-sm">
            <StatusIcon className={cn('size-4', viewTone === 'green' && 'text-po-success', viewTone === 'amber' && 'text-po-warning', viewTone === 'red' && 'text-po-danger')} />
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
          {status?.loginName && <p className="m-0 pt-1 text-po-text-muted">Account: <span className="text-po-text-secondary">{status.loginName}</span></p>}
          {status?.deviceName && <p className="m-0 text-po-text-muted">Device: <span className="text-po-text-secondary">{status.deviceName}</span></p>}
          {status?.dnsName && <p className="m-0 text-po-text-muted">Private DNS: <span className="text-po-text-secondary">{status.dnsName}</span></p>}
          {status?.tailnetIps?.length ? <p className="m-0 text-po-text-muted">Tailnet IP: <span className="text-po-text-secondary">{status.tailnetIps[0]}</span></p> : null}
          <p className="m-0 text-po-text-muted">Private links: <span className="text-po-text-secondary">{view.privateLinksReady} ready</span></p>
        </div>

        {!view.connected && (
          <div className="rounded-po-sm border border-po-warning/25 bg-po-warning/10 p-3 text-xs text-po-text-secondary">
            <p className="m-0 font-semibold text-po-warning">Private access is optional.</p>
            <p className="m-0 mt-1 text-po-text-muted">Project OS still works on your home network. Sign in when you want private links from trusted devices.</p>
            <button className="mt-2 inline-flex items-center gap-1 text-left font-mono text-[0.72rem] text-po-text-secondary hover:text-po-text" onClick={copySetupCommand} type="button">
              <Terminal className="size-3.5" />
              {check?.actionCommand || 'sudo tailscale up'}
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {actions.map((action) => {
            if (action.id === 'refresh') {
              return (
                <DisabledAction disabled={refreshing} key={action.id} reason="Tailscale status is already refreshing.">
                  <Button disabled={refreshing} onClick={load} size="sm" type="button" variant="outline">
                    <RefreshCw data-icon="inline-start" className={cn(refreshing && 'animate-spin')} />
                    {action.label}
                  </Button>
                </DisabledAction>
              );
            }
            if (action.id === 'copy-hostname') {
              return (
                <DisabledAction disabled={!action.enabled} key={action.id} reason="Connect Tailscale before copying a private hostname.">
                  <Button disabled={!action.enabled} onClick={copyHostname} size="sm" type="button" variant="outline">
                    {copied ? <CheckCircle2 data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
                    {action.label}
                  </Button>
                </DisabledAction>
              );
            }
            if (action.external) {
              return (
                <Button asChild key={action.id} size="sm" variant={view.connected ? 'secondary' : 'default'}>
                  <a href={action.href} rel="noreferrer" target="_blank">
                    {action.label}
                    <ExternalLink data-icon="inline-end" />
                  </a>
                </Button>
              );
            }
            return (
              <Button asChild key={action.id} size="sm" variant="outline">
                <Link to={action.href || '/access'}>{action.label}</Link>
              </Button>
            );
          })}
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

function toneClass(tone: 'amber' | 'green' | 'red') {
  if (tone === 'green') {
    return 'border-po-success/30 bg-po-success/10 text-po-success hover:bg-po-success/15';
  }
  if (tone === 'amber') {
    return 'border-po-warning/35 bg-po-warning/10 text-po-warning hover:bg-po-warning/15';
  }
  return 'border-po-danger/35 bg-po-danger/10 text-po-danger hover:bg-po-danger/15';
}
