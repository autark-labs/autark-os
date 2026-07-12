import { ExternalLink, Settings2 } from 'lucide-react';
import { StatusBadge } from '@/components/autark-os/StatusBadge';
import { ProjectPrimaryButton } from '@/components/primitives/ProjectButtons';
import type { NetworkDiagnosticsReport, TailscaleConnectGuide, TailscaleStatus } from '@/types/network';
import { DiagnosticRow, InfoLine, NetworkInset, NetworkPanel } from './NetworkPage.shared';

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
      <NetworkPanel
        description="Technical connection details for power users."
        title={(
          <span className="flex items-center gap-2">
            <Settings2 className="size-4 text-slate-400" />
            Advanced details
          </span>
        )}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoLine label="State" value={tailscale?.state || 'Unknown'} />
          <InfoLine label="Login" value={tailscale?.loginName || 'Not signed in'} />
          <InfoLine label="DNS name" value={tailscale?.dnsName || 'Not assigned'} />
          <InfoLine label="Tailnet IPs" value={tailscale?.tailnetIps?.join(', ') || 'None'} />
          <InfoLine label="Tailnet name" value={tailscale?.tailnetName || 'Unavailable'} />
          <InfoLine label="Device" value={tailscale?.deviceName || 'Autark-OS'} />
        </div>
      </NetworkPanel>

      <NetworkPanel
        action={
            <StatusBadge tone={connected ? 'success' : 'warning'}>
              {connected ? 'Connected' : 'Setup needed'}
            </StatusBadge>
        }
        description={tailscale?.message || 'Checking Tailscale status.'}
        title="Tailscale setup"
      >
          {connected ? (
            <div className="grid gap-3">
              <InfoLine label="Private DNS" value={tailscale?.dnsName || 'Using Tailscale IP'} />
              <InfoLine label="Private apps" value="Managed by Autark-OS" />
            </div>
          ) : (
            <OnboardingGuide guide={guide} installed={Boolean(tailscale?.installed)} />
          )}
      </NetworkPanel>

      <NetworkPanel
        className="xl:col-span-2"
        description="Full network and app-link diagnostics."
        title="All checks"
      >
        <div className="grid gap-2 md:grid-cols-2">
          {(diagnostics?.checks || []).map((item) => <DiagnosticRow item={item} key={item.id} />)}
          {(diagnostics?.appChecks || []).map((item) => <DiagnosticRow item={item} key={item.id} />)}
          {!diagnostics && <p className="text-sm text-sky-100/70">No diagnostics are available yet.</p>}
        </div>
      </NetworkPanel>
    </div>
  );
}

function OnboardingGuide({ guide, installed }: { guide: TailscaleConnectGuide | null; installed: boolean }) {
  return (
    <div className="grid gap-4">
      <div>
        <h3 className="font-bold text-slate-50">{guide?.headline || 'Connect Autark-OS to Tailscale'}</h3>
        <p className="mt-1 text-sm text-sky-100/70">{guide?.summary || 'Add this device to your tailnet to create private app links.'}</p>
      </div>
      <ol className="grid gap-2 text-sm text-sky-100/75">
        {(guide?.steps || []).map((step, index) => (
          <li key={step}>
            <NetworkInset className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-cyan-300 text-xs font-bold text-slate-950">{index + 1}</span>
              <span>{step}</span>
            </NetworkInset>
          </li>
        ))}
      </ol>
      <NetworkInset className="grid gap-2">
        <span className="text-xs font-semibold uppercase text-sky-100/55">{installed ? 'Connect command' : 'Install first'}</span>
        <code className="rounded-md bg-slate-900 px-3 py-2 text-sm text-cyan-100">{installed ? guide?.connectCommand || 'tailscale up' : guide?.installUrl || 'https://tailscale.com/download'}</code>
      </NetworkInset>
      <ProjectPrimaryButton asChild>
        <a href={guide?.installUrl || 'https://tailscale.com/download'} rel="noreferrer" target="_blank">
          <ExternalLink className="size-4" />
          Open Tailscale setup
        </a>
      </ProjectPrimaryButton>
      <p className="text-xs text-sky-100/70">{guide?.advancedNote}</p>
    </div>
  );
}
