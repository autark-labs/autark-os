import { ExternalLink, Settings2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { NetworkDiagnosticsReport, TailscaleConnectGuide, TailscaleStatus } from '@/types/network';
import { DiagnosticRow, InfoLine } from './NetworkPage.shared';

export function NetworkAdvancedPanel({
  diagnostics,
  guide,
  tailscale,
}: {
  diagnostics: NetworkDiagnosticsReport | null;
  guide: TailscaleConnectGuide | null;
  tailscale: TailscaleStatus | null;
}) {
  const connected = Boolean(tailscale?.connected);
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="border-white/10 bg-slate-950/55 py-0 text-slate-100">
        <CardHeader className="border-b border-white/10 p-5">
          <CardTitle className="flex items-center gap-2 text-lg text-white">
            <Settings2 className="size-4 text-slate-400" />
            Advanced details
          </CardTitle>
          <p className="mt-1 text-sm text-slate-400">Technical connection details for power users.</p>
        </CardHeader>
        <CardContent className="grid gap-3 p-5 sm:grid-cols-2">
          <InfoLine label="State" value={tailscale?.state || 'Unknown'} />
          <InfoLine label="Login" value={tailscale?.loginName || 'Not signed in'} />
          <InfoLine label="DNS name" value={tailscale?.dnsName || 'Not assigned'} />
          <InfoLine label="Tailnet IPs" value={tailscale?.tailnetIps?.join(', ') || 'None'} />
          <InfoLine label="Tailnet name" value={tailscale?.tailnetName || 'Unavailable'} />
          <InfoLine label="Device" value={tailscale?.deviceName || 'Project OS'} />
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-slate-950/55 py-0 text-slate-100">
        <CardHeader className="border-b border-white/10 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg text-white">Tailscale setup</CardTitle>
              <p className="mt-1 text-sm text-slate-400">{tailscale?.message || 'Checking Tailscale status.'}</p>
            </div>
            <Badge className={connected ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200' : 'border-amber-300/25 bg-amber-500/10 text-amber-200'} variant="outline">
              {connected ? 'Connected' : 'Setup needed'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 p-5">
          {connected ? (
            <div className="grid gap-3">
              <InfoLine label="Private DNS" value={tailscale?.dnsName || 'Using Tailscale IP'} />
              <InfoLine label="Private apps" value="Managed by Project OS" />
            </div>
          ) : (
            <OnboardingGuide guide={guide} installed={Boolean(tailscale?.installed)} />
          )}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-slate-950/55 py-0 text-slate-100 xl:col-span-2">
        <CardHeader className="border-b border-white/10 p-5">
          <CardTitle className="text-lg text-white">All checks</CardTitle>
          <p className="mt-1 text-sm text-slate-400">Full network and app-link diagnostics.</p>
        </CardHeader>
        <CardContent className="grid gap-2 p-5 md:grid-cols-2">
          {(diagnostics?.checks || []).map((item) => <DiagnosticRow item={item} key={item.id} />)}
          {(diagnostics?.appChecks || []).map((item) => <DiagnosticRow item={item} key={item.id} />)}
          {!diagnostics && <p className="text-sm text-slate-400">No diagnostics are available yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function OnboardingGuide({ guide, installed }: { guide: TailscaleConnectGuide | null; installed: boolean }) {
  return (
    <div className="grid gap-4">
      <div>
        <h3 className="font-bold text-white">{guide?.headline || 'Connect Project OS to Tailscale'}</h3>
        <p className="mt-1 text-sm text-slate-400">{guide?.summary || 'Add this device to your tailnet to create private app links.'}</p>
      </div>
      <ol className="grid gap-2 text-sm text-slate-300">
        {(guide?.steps || []).map((step, index) => (
          <li className="flex gap-3 rounded-lg border border-white/10 bg-slate-900/50 p-3" key={step}>
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-violet-600 text-xs font-bold text-white">{index + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div className="grid gap-2 rounded-lg border border-white/10 bg-slate-900/50 p-3">
        <span className="text-xs font-semibold uppercase text-slate-500">{installed ? 'Connect command' : 'Install first'}</span>
        <code className="rounded-md bg-black/40 px-3 py-2 text-sm text-violet-100">{installed ? guide?.connectCommand || 'tailscale up' : guide?.installUrl || 'https://tailscale.com/download'}</code>
      </div>
      <Button asChild className="bg-violet-600 text-white hover:bg-violet-500">
        <a href={guide?.installUrl || 'https://tailscale.com/download'} rel="noreferrer" target="_blank">
          <ExternalLink className="size-4" />
          Open Tailscale setup
        </a>
      </Button>
      <p className="text-xs text-slate-500">{guide?.advancedNote}</p>
    </div>
  );
}
