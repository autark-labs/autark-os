import { useState } from 'react';
import { CheckCircle2, Copy, ServerCog, ShieldAlert, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SystemSetupCheck, SystemSetupStatus } from '@/types/network';

export function HostSetupPanel({ setup }: { setup: SystemSetupStatus | null }) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(value: string, id: string) {
    await navigator.clipboard.writeText(value);
    setCopied(id);
    window.setTimeout(() => setCopied((current) => current === id ? null : current), 1500);
  }

  if (!setup) {
    return (
      <Card className="border-white/10 bg-slate-950/55 text-slate-100">
        <CardContent className="p-5 text-sm text-slate-400">Host setup status is unavailable.</CardContent>
      </Card>
    );
  }

  const needsSetup = setup.status === 'needs_admin_setup';

  return (
    <Card className="border-white/10 bg-slate-950/55 text-slate-100">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className={cn('inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold', needsSetup ? 'border-amber-300/30 bg-amber-400/10 text-amber-200' : 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200')}>
              {needsSetup ? <ShieldAlert className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
              Host setup
            </div>
            <CardTitle className="mt-3 text-lg text-white">{setup.headline}</CardTitle>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">{setup.summary}</p>
          </div>
          <Button className="border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" onClick={() => copy(setup.installCommand, 'install')} type="button" variant="outline">
            <Copy className="size-4" />
            {copied === 'install' ? 'Copied' : 'Copy setup command'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {setup.checks.map((check) => <SetupCheckCard check={check} copied={copied} key={check.id} onCopy={copy} />)}
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
            <Terminal className="size-3.5" />
            Recommended setup
          </div>
          <code className="mt-2 block overflow-x-auto rounded-md bg-black/35 px-3 py-2 text-sm text-violet-100">{setup.installCommand}</code>
          <p className="mt-2 text-xs leading-5 text-slate-500">Run once on the Project OS host. It creates the service user, prepares folders, and grants Tailscale Serve permission when Tailscale is available.</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SetupCheckCard({ check, copied, onCopy }: { check: SystemSetupCheck; copied: string | null; onCopy: (value: string, id: string) => void }) {
  const tone = check.status === 'ok'
    ? 'border-emerald-300/20 bg-emerald-500/5 text-emerald-200'
    : check.status === 'warning'
      ? 'border-amber-300/20 bg-amber-500/5 text-amber-200'
      : 'border-slate-700/40 bg-slate-900/60 text-slate-300';

  return (
    <div className="grid gap-3 rounded-lg border border-slate-700/40 bg-slate-900/60 p-4">
      <div className="flex items-start gap-3">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg border', tone)}>
          {check.status === 'ok' ? <CheckCircle2 className="size-4" /> : <ServerCog className="size-4" />}
        </span>
        <div className="min-w-0">
          <h4 className="font-semibold text-white">{check.label}</h4>
          <p className="mt-1 text-sm leading-5 text-slate-400">{check.message}</p>
          {check.detail && <p className="mt-1 break-words text-xs leading-5 text-slate-500">{check.detail}</p>}
        </div>
      </div>
      {check.actionCommand && (
        <Button className="w-fit border-slate-700/60 bg-slate-950/50 text-slate-200 hover:bg-slate-800" onClick={() => onCopy(check.actionCommand || '', check.id)} size="sm" type="button" variant="outline">
          <Copy className="size-3.5" />
          {copied === check.id ? 'Copied' : check.actionLabel || 'Copy command'}
        </Button>
      )}
    </div>
  );
}
