import { useEffect, useMemo, useState } from 'react';
import { Bell, HeartPulse, Loader2, Power, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ProAPIClient } from '@/api/proApi';
import { apiErrorMessage } from '@/api/httpClient';
import { PageShell } from '@/components/layout/PageShell';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProjectDarkControlButton, ProjectPrimaryButton } from '@/components/primitives/ProjectButtons';
import { ProjectInset, ProjectPanel, Surface } from '@/components/primitives/Surface';
import { showActionErrorNotification, showActionNotification } from '@/lib/actionNotifications';
import { cn } from '@/lib/utils';
import type { ProStatus } from '@/types/pro';
import { formatProTimestamp, normalizeLicenseCode, proStatusViewModel } from './ProPage.logic';

function ProPage() {
  const [status, setStatus] = useState<ProStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [licenseCode, setLicenseCode] = useState('');
  const [licenseError, setLicenseError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(background = false) {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      setStatus(await ProAPIClient.status());
    } catch (statusError) {
      setError(apiErrorMessage(statusError, 'Autark Pro status could not be loaded.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function registerInstall() {
    setRegistering(true);
    setError(null);
    try {
      const registeredStatus = await ProAPIClient.register();
      setStatus(registeredStatus);
      showActionNotification({
        ok: true,
        severity: 'success',
        title: 'Autark Pro registered',
        message: 'This Autark-OS install now has a local Pro identity.',
      }, 'Autark Pro registered');
    } catch (registerError) {
      setError(apiErrorMessage(registerError, 'Autark Pro registration failed.'));
      showActionErrorNotification(registerError, 'Autark Pro registration failed');
    } finally {
      setRegistering(false);
    }
  }

  async function redeemLicense() {
    const trimmedLicenseCode = normalizeLicenseCode(licenseCode);
    if (!trimmedLicenseCode) {
      setLicenseError('Enter a license code before activating Pro.');
      return;
    }

    setRedeeming(true);
    setLicenseError(null);
    setError(null);
    try {
      const redeemedStatus = await ProAPIClient.redeemLicense(trimmedLicenseCode);
      setStatus(redeemedStatus);
      setLicenseCode('');
      showActionNotification({
        ok: true,
        severity: 'success',
        title: 'Autark Pro activated',
        message: 'This install is now using accountless Pro.',
      }, 'Autark Pro activated');
    } catch (redeemError) {
      setLicenseError(apiErrorMessage(redeemError, 'Autark Pro activation failed.'));
      showActionErrorNotification(redeemError, 'Autark Pro activation failed');
    } finally {
      setRedeeming(false);
    }
  }

  const statusView = useMemo(() => status ? proStatusViewModel(status) : null, [status]);

  if (loading) {
    return (
      <PageShell>
        <Surface className="grid min-h-[24rem] place-items-center p-6 text-center" tone="panel">
          <div>
            <Loader2 className="mx-auto size-8 animate-spin text-cyan-200" />
            <h1 className="mt-4 text-2xl font-black text-white">Loading Autark Pro</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">Reading local registration, privacy, and feed settings.</p>
          </div>
        </Surface>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold leading-none text-slate-50 md:text-3xl">Autark Pro</h2>
          <p className="mt-2 max-w-2xl text-sm text-sky-100/70">Manage this install&apos;s local Pro status, privacy posture, heartbeat visibility, and feed readiness.</p>
        </div>
        <ProjectPrimaryButton disabled={refreshing} onClick={() => void load(true)} type="button">
          <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
          Refresh
        </ProjectPrimaryButton>
      </header>

      {error && (
        <Surface className="border-red-400/35 bg-red-500/10 p-4 text-red-100" tone="danger">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-black text-white">Autark Pro could not load</h2>
              <p className="mt-1 text-sm leading-6 text-red-100/85">{error}</p>
            </div>
            <ProjectDarkControlButton onClick={() => void load()} type="button">
              <RefreshCw className="size-4" />
              Retry
            </ProjectDarkControlButton>
          </div>
        </Surface>
      )}

      {status && statusView && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="grid gap-5">
            <ProjectPanel className="overflow-hidden p-0">
              <div className={cn(
                'border-b border-sky-400/20 p-5',
                statusView.tone === 'active' && 'bg-cyan-300 text-slate-950',
                statusView.tone === 'registered' && 'bg-cyan-400/10 text-slate-50',
                statusView.tone === 'disabled' && 'bg-orange-500/10 text-slate-50',
                statusView.tone === 'muted' && 'bg-slate-800 text-slate-50',
              )}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <Badge className={cn(
                      'border-current/25 bg-current/10 text-current',
                      statusView.tone === 'active' && 'bg-slate-950/10 text-slate-950',
                    )}>
                      {statusView.badge}
                    </Badge>
                    <h1 className="mt-3 text-2xl font-black tracking-tight md:text-3xl">{statusView.heading}</h1>
                    <p className={cn('mt-2 max-w-2xl text-sm leading-6', statusView.tone === 'active' ? 'text-slate-900' : 'text-sky-100/75')}>{statusView.primaryDetail}</p>
                  </div>
                  <div className="grid size-14 place-items-center rounded-2xl border border-current/20 bg-current/10">
                    <Sparkles className="size-7" />
                  </div>
                </div>
              </div>
              <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
                <StatusFact label="Install ID" value={status.installId ?? 'Not registered'} />
                <StatusFact label="Mode" value={status.mode} />
                <StatusFact label="Entitlement" value={status.entitlementStatus} />
                <StatusFact label="Remote API" value={status.remoteApiConfigured ? 'Configured' : 'Mock/local only'} />
              </div>
            </ProjectPanel>

            <div className="grid gap-5 lg:grid-cols-2">
              <ActivationPanel
                licenseCode={licenseCode}
                licenseError={licenseError}
                onLicenseCodeChange={setLicenseCode}
                onLicenseErrorClear={() => setLicenseError(null)}
                onRedeem={redeemLicense}
                onRegister={registerInstall}
                redeeming={redeeming}
                registering={registering}
                status={status}
              />
              <PrivacyPanel status={status} />
              <HeartbeatPanel status={status} />
              <FeedPanel status={status} />
            </div>
          </div>

          <aside className="grid content-start gap-5">
            <ProjectPanel>
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-cyan-300/25 bg-cyan-400/10 text-cyan-200">
                  <ShieldCheck className="size-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white">Local control</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-400">Autark-OS remains the control surface. Hosted Pro services are accessed only through the local backend.</p>
                </div>
              </div>
            </ProjectPanel>
            <LocalDisablePanel status={status} />
          </aside>
        </div>
      )}
    </PageShell>
  );
}

function StatusFact({ label, value }: { label: string; value: string }) {
  return (
    <ProjectInset>
      <p className="text-xs font-black uppercase tracking-normal text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-white">{value}</p>
    </ProjectInset>
  );
}

function ActivationPanel({
  licenseCode,
  licenseError,
  onLicenseCodeChange,
  onLicenseErrorClear,
  onRedeem,
  onRegister,
  redeeming,
  registering,
  status,
}: {
  licenseCode: string;
  licenseError: string | null;
  onLicenseCodeChange: (value: string) => void;
  onLicenseErrorClear: () => void;
  onRedeem: () => void;
  onRegister: () => void;
  redeeming: boolean;
  registering: boolean;
  status: ProStatus;
}) {
  const active = status.enabled && status.mode === 'accountless' && status.entitlementStatus === 'active';

  return (
    <ProjectPanel>
      <SectionHeading icon={Sparkles} title="Activation" />
      <div className="mt-4 grid gap-3">
        <ProjectInset>
          <p className="text-sm font-bold text-white">{status.registered ? 'This install is registered.' : 'Register this install to enable Pro actions later.'}</p>
          <p className="mt-1 text-sm leading-6 text-slate-400">Account linking is coming later.</p>
        </ProjectInset>
        <ProjectPrimaryButton disabled={registering || status.registered || redeeming} onClick={onRegister} type="button">
          {registering && <Loader2 className="size-4 animate-spin" />}
          {status.registered ? 'Install registered' : 'Register this Autark install'}
        </ProjectPrimaryButton>
        <div className="grid gap-2 rounded-xl border border-sky-400/20 bg-slate-800 p-3">
          <Label className="text-sky-100" htmlFor="pro-license-code">Accountless license</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              className="border-sky-400/30 bg-slate-950 text-slate-50 placeholder:text-slate-500"
              disabled={redeeming || active}
              id="pro-license-code"
              onChange={(event) => {
                onLicenseErrorClear();
                onLicenseCodeChange(event.target.value);
              }}
              placeholder="AUTARK-PRO-XXXX-XXXX"
              value={licenseCode}
            />
            <ProjectPrimaryButton className="shrink-0" disabled={redeeming || active} onClick={onRedeem} type="button">
              {redeeming && <Loader2 className="size-4 animate-spin" />}
              {active ? 'Accountless Pro active' : 'Activate accountless Pro'}
            </ProjectPrimaryButton>
          </div>
          {licenseError && <p className="text-sm font-semibold text-orange-200">{licenseError}</p>}
        </div>
      </div>
    </ProjectPanel>
  );
}

function PrivacyPanel({ status }: { status: ProStatus }) {
  return (
    <ProjectPanel>
      <SectionHeading icon={ShieldCheck} title="Privacy" />
      <div className="mt-4 grid gap-3">
        <BooleanRow enabled={status.healthReportingEnabled} label="Health reporting" />
        <BooleanRow enabled={status.configSnapshotEnabled} label="Config snapshot" />
        <p className="text-sm leading-6 text-slate-400">Heartbeat previews and exact payload controls come before any scheduled Pro reporting.</p>
      </div>
    </ProjectPanel>
  );
}

function HeartbeatPanel({ status }: { status: ProStatus }) {
  return (
    <ProjectPanel>
      <SectionHeading icon={HeartPulse} title="Heartbeat" />
      <div className="mt-4 grid gap-3">
        <StatusFact label="Last heartbeat" value={formatProTimestamp(status.lastHeartbeatAt)} />
        <StatusFact label="Result" value={status.lastHeartbeatResult ?? 'Not sent'} />
        <p className="text-sm leading-6 text-slate-400">Payload preview is coming before any scheduled heartbeat reporting is enabled.</p>
      </div>
    </ProjectPanel>
  );
}

function FeedPanel({ status }: { status: ProStatus }) {
  return (
    <ProjectPanel>
      <SectionHeading icon={Bell} title="Pro feed" />
      <div className="mt-4 grid gap-3">
        <BooleanRow enabled={status.proFeedEnabled} label="Feed enabled" />
        <BooleanRow enabled={status.alertsEnabled} label="Alerts enabled" />
        <StatusFact label="Last feed sync" value={formatProTimestamp(status.lastFeedSyncAt)} />
      </div>
    </ProjectPanel>
  );
}

function LocalDisablePanel({ status }: { status: ProStatus }) {
  return (
    <ProjectPanel>
      <SectionHeading icon={Power} title="Disable locally" />
      <p className="mt-3 text-sm leading-6 text-slate-400">Turning Pro off later will keep local app management available and pause Pro-only reporting from this install.</p>
      <ProjectInset className="mt-4">
        <p className="text-sm font-semibold text-white">{status.enabled ? 'Local disable controls are coming later.' : 'Pro is already disabled locally.'}</p>
      </ProjectInset>
    </ProjectPanel>
  );
}

function BooleanRow({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <ProjectInset className="flex items-center justify-between gap-3">
      <span className="text-sm font-semibold text-white">{label}</span>
      <Badge className={enabled ? 'border-cyan-300/25 bg-cyan-400/10 text-cyan-100' : 'border-slate-600 bg-slate-950 text-slate-300'}>
        {enabled ? 'On' : 'Off'}
      </Badge>
    </ProjectInset>
  );
}

function SectionHeading({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-9 place-items-center rounded-lg border border-cyan-300/25 bg-cyan-400/10 text-cyan-200">
        <Icon className="size-4" />
      </div>
      <h2 className="text-lg font-black text-white">{title}</h2>
    </div>
  );
}

export default ProPage;
