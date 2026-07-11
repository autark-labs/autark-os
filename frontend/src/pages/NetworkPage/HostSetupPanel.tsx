import { useState } from 'react';
import { CheckCircle2, Copy, ServerCog, ShieldAlert, Terminal } from 'lucide-react';
import { ProjectDarkControlButton } from '@/components/primitives/ProjectButtons';
import { Surface } from '@/components/primitives/Surface';
import { showActionNotification } from '@/lib/actionNotifications';
import { copyText } from '@/lib/copyText';
import { cn } from '@/lib/utils';
import type { SystemSetupCheck, SystemSetupStatus } from '@/types/network';
import { NetworkInset, NetworkPanel } from './NetworkPage.shared';

export function HostSetupPanel({ setup }: { setup: SystemSetupStatus | null }) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(value: string, id: string) {
    const result = await copyText(value);
    if (!result.ok) {
      showActionNotification({ ok: false, severity: 'warning', title: 'Copy unavailable', message: result.message }, 'Copy unavailable');
      return;
    }
    setCopied(id);
    showActionNotification({ ok: true, severity: 'success', title: 'Command copied', message: value }, 'Command copied');
    window.setTimeout(() => setCopied((current) => current === id ? null : current), 1500);
  }

  if (!setup) {
    return (
      <Surface className="p-5 text-sm text-sky-100/70" tone="panel">Host setup status is unavailable.</Surface>
    );
  }

  const needsSetup = setup.status === 'needs_admin_setup';
  const checks = setup.checks ?? [];

  return (
    <NetworkPanel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className={cn('inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold', needsSetup ? 'border-orange-400/45 bg-orange-500/10 text-orange-200' : 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200')}>
              {needsSetup ? <ShieldAlert className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
              Host setup
            </div>
            <h3 className="mt-3 text-lg font-bold text-slate-50">{setup.headline}</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-sky-100/70">{setup.summary}</p>
          </div>
          <ProjectDarkControlButton onClick={() => copy(setup.installCommand, 'install')} type="button">
            <Copy className="size-4" />
            {copied === 'install' ? 'Copied' : 'Copy setup command'}
          </ProjectDarkControlButton>
        </div>
      <div className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {checks.map((check) => <SetupCheckCard check={check} copied={copied} key={check.id} onCopy={copy} />)}
        </div>
        <NetworkInset className="p-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-sky-100/55">
            <Terminal className="size-3.5" />
            Recommended setup
          </div>
          <code className="mt-2 block select-text overflow-x-auto rounded-md bg-slate-900 px-3 py-2 text-sm text-cyan-100">{setup.installCommand}</code>
          <p className="mt-2 text-xs leading-5 text-sky-100/50">Run once on the Autark-OS host. It creates the service user, prepares folders, and grants Tailscale Serve permission when Tailscale is available.</p>
        </NetworkInset>
      </div>
    </NetworkPanel>
  );
}

function SetupCheckCard({ check, copied, onCopy }: { check: SystemSetupCheck; copied: string | null; onCopy: (value: string, id: string) => void }) {
  const tone = check.status === 'ok'
    ? 'border-emerald-300/20 bg-emerald-500/5 text-emerald-200'
    : check.status === 'warning'
      ? 'border-orange-400/35 bg-orange-500/5 text-orange-200'
      : 'border-slate-700/40 bg-slate-900/60 text-slate-300';

  return (
    <NetworkInset className="grid gap-3 p-4">
      <div className="flex items-start gap-3">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg border', tone)}>
          {check.status === 'ok' ? <CheckCircle2 className="size-4" /> : <ServerCog className="size-4" />}
        </span>
        <div className="min-w-0">
          <h4 className="font-semibold text-slate-50">{check.label}</h4>
          <p className="mt-1 text-sm leading-5 text-sky-100/70">{check.message}</p>
          {check.detail && <p className="mt-1 break-words text-xs leading-5 text-sky-100/50">{check.detail}</p>}
        </div>
      </div>
      {check.actionCommand && (
        <ProjectDarkControlButton className="w-fit" onClick={() => onCopy(check.actionCommand || '', check.id)} size="sm" type="button">
          <Copy className="size-3.5" />
          {copied === check.id ? 'Copied' : check.actionLabel || 'Copy command'}
        </ProjectDarkControlButton>
      )}
    </NetworkInset>
  );
}
