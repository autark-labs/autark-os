import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleAlert, Copy, ExternalLink, LockKeyhole, Network, RefreshCw, Terminal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { invalidateNetworkQueries, usePrivateAccessReconciliationQuery, useTailscaleStatusQuery } from '@/repositories/networkRepository';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { ProjectDarkControlButton, ProjectPrimaryButton } from '@/components/primitives/ProjectButtons';
import { showActionNotification } from '@/lib/actionNotifications';
import { copyText } from '@/lib/copyText';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { tailscaleControlActions, tailscaleControlView } from './TailscaleControlPopover.logic';
import type { SystemSetupCheck } from '@/types/system';

type TailscaleControlPopoverProps = {
  align?: 'center' | 'end' | 'start';
  check?: SystemSetupCheck | null;
  className?: string;
  triggerLabel?: 'full' | 'compact';
};

export function TailscaleControlPopover({ align = 'end', check = null, className, triggerLabel = 'full' }: TailscaleControlPopoverProps) {
  const queryClient = useQueryClient();
  const statusQuery = useTailscaleStatusQuery();
  const reconciliationQuery = usePrivateAccessReconciliationQuery();
  const status = statusQuery.data;
  const reconciliation = reconciliationQuery.data;
  const refreshing = statusQuery.isFetching || reconciliationQuery.isFetching;
  const [copied, setCopied] = useState(false);
  const view = tailscaleControlView(status, reconciliation);
  const actions = tailscaleControlActions(status ? { ...status, connected: view.connected, mock: view.mock } : null);
  const error = statusQuery.error ? (status ? 'Tailscale status could not refresh. Showing the last confirmed status.' : 'Tailscale status is unavailable. Check again to retry.')
    : reconciliationQuery.error ? (reconciliation ? 'Private-link checks could not refresh. Showing the last confirmed links.' : 'Private-link checks are unavailable. Check again to retry.') : null;
  const label = statusQuery.isLoading ? 'Checking' : statusQuery.error ? (status ? 'Status stale' : 'Unavailable')
    : reconciliationQuery.error ? (reconciliation ? 'Links stale' : 'Links unavailable') : view.label;
  const viewTone = statusQuery.isLoading || error ? 'amber' : view.tone as 'amber' | 'green' | 'red';
  const StatusIcon = statusQuery.isLoading ? RefreshCw : viewTone === 'green' ? CheckCircle2 : CircleAlert;

  async function copyHostname() {
    const hostname = status?.dnsName || status?.deviceName || '';
    if (!hostname) return;
    const result = await copyText(hostname);
    if (!result.ok) {
      showActionNotification({ ok: false, severity: 'warning', title: 'Copy unavailable', message: result.message }, 'Copy unavailable');
      return;
    }
    setCopied(true);
    showActionNotification({ ok: true, severity: 'success', title: 'Hostname copied', message: 'Ready to paste.' }, 'Hostname copied');
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function copySetupCommand() {
    const command = check?.actionCommand || 'sudo tailscale up';
    const result = await copyText(command);
    if (!result.ok) {
      showActionNotification({ ok: false, severity: 'warning', title: 'Copy unavailable', message: result.message }, 'Copy unavailable');
      return;
    }
    showActionNotification({ ok: true, severity: 'success', title: 'Tailscale command copied', message: 'Ready to paste.' }, 'Tailscale command copied');
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <ProjectDarkControlButton
          aria-label={`Tailscale: ${label}`}
          className={cn('h-8 gap-2 rounded-lg px-2.5 text-xs', toneClass(viewTone), className)}
          size="sm"
          type="button"
        >
          <span className={cn('size-2 rounded-full shadow-md', viewTone === 'green' && 'bg-emerald-400 shadow-emerald-400/30', viewTone === 'amber' && 'bg-orange-400 shadow-orange-400/30', viewTone === 'red' && 'bg-red-400 shadow-red-400/30')} />
          <Network data-icon="inline-start" />
          {triggerLabel === 'full' && <span className="hidden font-semibold sm:inline">Tailscale</span>}
          <span className="font-semibold">{label}</span>
        </ProjectDarkControlButton>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-[min(92vw,420px)] gap-3 border-sky-400/30 bg-slate-900 p-3 text-slate-50 shadow-xl shadow-slate-950/30">
        <PopoverHeader>
          <PopoverTitle className="flex items-center gap-2 text-sm">
            <StatusIcon className={cn('size-4', viewTone === 'green' && 'text-emerald-200', viewTone === 'amber' && 'text-orange-200', viewTone === 'red' && 'text-red-200')} />
            {statusQuery.isLoading ? 'Checking Tailscale' : view.title}
          </PopoverTitle>
          <PopoverDescription className="text-xs text-sky-100/65">
            {error || (statusQuery.isLoading ? 'Checking Tailscale status.' : view.summary)}
          </PopoverDescription>
        </PopoverHeader>

        <div className="grid gap-2 rounded-lg border border-sky-400/25 bg-slate-800 p-3 text-xs">
          {status && <>
            <StatusRow ready={view.connected} label={view.mock ? 'Development mock' : 'Signed in'} />
            <StatusRow ready={view.magicDnsReady} label="MagicDNS ready" />
            <StatusRow ready={view.httpsReady} label="HTTPS ready" />
            <StatusRow ready={view.serveReady} label={reconciliation ? 'Serve ready' : reconciliationQuery.isLoading ? 'Checking Serve readiness' : 'Serve readiness unavailable'} />
          </>}
          {status?.loginName && <p className="m-0 pt-1 text-sky-100/55">Account: <span className="text-sky-100/80">{status.loginName}</span></p>}
          {status?.deviceName && <p className="m-0 text-sky-100/55">Device: <span className="text-sky-100/80">{status.deviceName}</span></p>}
          {status?.dnsName && <p className="m-0 text-sky-100/55">Private DNS: <span className="text-sky-100/80">{status.dnsName}</span></p>}
          {status?.tailnetIps?.length ? <p className="m-0 text-sky-100/55">Tailnet IP: <span className="text-sky-100/80">{status.tailnetIps[0]}</span></p> : null}
          <p className="m-0 text-sky-100/55">Private links: <span className="text-sky-100/80">{view.privateLinksReady === null ? reconciliationQuery.isLoading ? 'Checking' : 'Unavailable' : `${view.privateLinksReady} ready${reconciliationQuery.error ? ' (last confirmed)' : ''}`}</span></p>
        </div>

        {status && !view.connected && (
          <div className="rounded-lg border border-orange-400/45 bg-orange-500/10 p-3 text-xs text-orange-100">
            <p className="m-0 font-semibold text-orange-200">Private access is optional.</p>
            <p className="m-0 mt-1 text-orange-100/75">Autark-OS still works on your home network. Sign in when you want private links from trusted devices.</p>
            <button className="mt-2 inline-flex items-center gap-1 text-left font-mono text-[0.72rem] text-orange-100 hover:text-white" onClick={copySetupCommand} type="button">
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
                  <ProjectDarkControlButton disabled={refreshing} onClick={() => void invalidateNetworkQueries(queryClient)} size="sm" type="button">
                    <RefreshCw data-icon="inline-start" className={cn(refreshing && 'animate-spin')} />
                    {action.label}
                  </ProjectDarkControlButton>
                </DisabledAction>
              );
            }
            if (action.id === 'copy-hostname') {
              return (
                <DisabledAction disabled={!action.enabled} key={action.id} reason="Connect Tailscale before copying a private hostname.">
                  <ProjectDarkControlButton disabled={!action.enabled} onClick={copyHostname} size="sm" type="button">
                    {copied ? <CheckCircle2 data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
                    {action.label}
                  </ProjectDarkControlButton>
                </DisabledAction>
              );
            }
            if (action.external) {
              return (
                <ProjectPrimaryButton asChild key={action.id} size="sm">
                  <a href={action.href} rel="noreferrer" target="_blank">
                    {action.label}
                    <ExternalLink data-icon="inline-end" />
                  </a>
                </ProjectPrimaryButton>
              );
            }
            return (
              <ProjectDarkControlButton asChild key={action.id} size="sm">
                <Link to={action.href || '/access'}>{action.label}</Link>
              </ProjectDarkControlButton>
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
      {ready ? <CheckCircle2 className="size-3.5 text-emerald-200" /> : <LockKeyhole className="size-3.5 text-sky-100/55" />}
      <span className={ready ? 'text-sky-100/80' : 'text-sky-100/55'}>{label}</span>
    </div>
  );
}

function toneClass(tone: 'amber' | 'green' | 'red') {
  if (tone === 'green') {
    return 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15';
  }
  if (tone === 'amber') {
    return 'border-orange-400/45 bg-orange-500/10 text-orange-200 hover:bg-orange-500/15';
  }
  return 'border-red-400/40 bg-red-500/10 text-red-200 hover:bg-red-500/15';
}
