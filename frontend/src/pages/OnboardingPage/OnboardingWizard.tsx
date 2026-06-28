import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, HardDrive, Loader2, Network, ServerCog, ShieldCheck, Sparkles } from 'lucide-react';
import { SystemAPIClient } from '@/api/SystemAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { DisabledAction } from '@/components/project-os/DisabledAction';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { useProjectSettings } from '@/contexts/ProjectSettingsContext';
import type { OnboardingState, SystemSetupStatus } from '@/types/system';
import { Link } from 'react-router-dom';

type OnboardingWizardProps = {
  onComplete: () => void;
};

type BackupPosture = 'routine' | 'external' | 'later';
type PrivateAccessChoice = 'setup-now' | 'local-only' | 'already-connected';

const starterApps = [
  { id: 'vaultwarden', label: 'Vaultwarden', detail: 'Private password vault' },
  { id: 'jellyfin', label: 'Jellyfin', detail: 'Personal media streaming' },
  { id: 'homepage', label: 'Homepage', detail: 'Friendly app dashboard' },
];

function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { showAdvancedMetrics } = useProjectSettings();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [setupStatus, setSetupStatus] = useState<SystemSetupStatus | null>(null);
  const [deviceName, setDeviceName] = useState('Project OS');
  const [automaticBackups, setAutomaticBackups] = useState(true);
  const [backupPosture, setBackupPosture] = useState<BackupPosture>('routine');
  const [backupDestination, setBackupDestination] = useState('');
  const [privateAccessChoice, setPrivateAccessChoice] = useState<PrivateAccessChoice>('local-only');
  const [selectedApps, setSelectedApps] = useState<string[]>(starterApps.map((app) => app.id));
  const [saving, setSaving] = useState(false);
  const [advancedFinish, setAdvancedFinish] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([SystemAPIClient.onboarding(), SystemAPIClient.setupStatus()])
      .then(([next, setup]) => {
        if (!mounted) {
          return;
        }
        setSetupStatus(setup);
        setState(next);
        setDeviceName(next.deviceName || 'Project OS');
        setAutomaticBackups(next.automaticBackupsEnabled);
        const defaultBackupDestination = `${next.runtimePath}/backups`;
        const savedBackupDestination = next.backupDestination || defaultBackupDestination;
        setBackupDestination(savedBackupDestination);
        setBackupPosture(!next.automaticBackupsEnabled ? 'later' : savedBackupDestination === defaultBackupDestination ? 'routine' : 'external');
        setPrivateAccessChoice(cleanPrivateAccessChoice(next.privateAccessChoice, next.tailscaleConnected));
        setSelectedApps(next.recommendedApps.length ? next.recommendedApps : starterApps.map((app) => app.id));
      })
      .catch((loadError) => setError(apiErrorMessage(loadError, 'Setup could not be loaded.')));
    return () => {
      mounted = false;
    };
  }, []);

  async function finish() {
    if (!state) {
      return;
    }
    const readiness = state.doctor.readiness;
    if (!readiness.canCompleteOnboarding) {
      setError(readiness.summary);
      return;
    }
    if (readiness.finishAnywayRequiresAdvanced && !advancedFinish) {
      setError('Review the setup items below, then use Advanced finish if you want to continue before every optional feature is ready.');
      return;
    }
    setSaving(true);
    setError(null);
    const backupValidation = validateBackupDestination(backupPosture, backupDestination);
    if (backupValidation) {
      setSaving(false);
      setError(backupValidation);
      return;
    }
    try {
      const defaultBackupDestination = `${state.runtimePath}/backups`;
      await SystemAPIClient.updateOnboarding({
        status: 'in_progress',
        currentStep: 5,
        deviceName,
        backupDestination: backupPosture === 'external' ? backupDestination.trim() : defaultBackupDestination,
        automaticBackupsEnabled: backupPosture === 'later' ? false : automaticBackups,
        privateAccessChoice,
        recommendedApps: selectedApps,
        completedSteps: ['device', 'doctor', 'tailscale', 'storage', 'backups', 'apps'],
      });
      await persistSetupProgress(privateAccessChoice);
      await SystemAPIClient.completeOnboarding();
      onComplete();
    } catch (saveError) {
      setError(apiErrorMessage(saveError, 'Setup could not be saved.'));
    } finally {
      setSaving(false);
    }
  }

  function toggleApp(appId: string) {
    setSelectedApps((current) => current.includes(appId) ? current.filter((id) => id !== appId) : [...current, appId]);
  }

  if (!state) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-300">
        <Loader2 className="size-6 animate-spin text-violet-300" />
      </main>
    );
  }

  const checks = state.doctor.checks;
  const warnings = checks.filter((check) => check.status === 'warning');
  const defaultBackupDestination = `${state.runtimePath}/backups`;
  const readiness = state.doctor.readiness;
  const privateAccessGroup = readiness.groups.find((group) => group.id === 'private-access');
  const tailscaleCheck = checks.find((check) => check.id === 'tailscale');
  const operatorCheck = checks.find((check) => check.id === 'tailscale-operator');
  const canFinish = readiness.canCompleteOnboarding && (!readiness.finishAnywayRequiresAdvanced || advancedFinish);
  const existingInstall = setupStatus?.existingInstall;
  const showExistingInstallWarning = Boolean(existingInstall?.conflict || (setupStatus?.devMode && existingInstall?.resources?.length));
  const finishDisabled = saving || !canFinish;
  const finishDisabledReason = saving
    ? 'Project OS is already saving setup.'
    : readiness.finishAnywayRequiresAdvanced && !advancedFinish
      ? 'Review Advanced finish before continuing with remaining setup items.'
      : readiness.summary;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.26),transparent_34%),linear-gradient(135deg,#020617,#0f172a)] p-4 text-slate-100 md:p-8">
      <section className="mx-auto grid max-w-6xl gap-5">
        <header className="rounded-lg border border-white/10 bg-slate-950/70 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] md:p-8">
          <Badge className="border-violet-400/30 bg-violet-500/15 text-violet-100">First boot</Badge>
          <h1 className="mt-4 text-4xl font-black tracking-normal text-white md:text-6xl">Set up your homelab</h1>
          <p className="mt-3 max-w-3xl text-base text-slate-300">Project OS will check this device, prepare safe defaults, and point you to the apps that make sense first.</p>
          {error && <div className="mt-4 rounded-lg border border-red-300/20 bg-red-500/10 p-3 text-sm text-red-100">{error}</div>}
        </header>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-5">
            {showExistingInstallWarning && (
              <WizardCard
                icon={AlertTriangle}
                title={existingInstall?.headline || 'Existing Project OS install found'}
                text={existingInstall?.summary || 'Review apps found on this server before continuing setup.'}
              >
                <div className={`rounded-lg border p-4 text-sm ${existingInstall?.conflict ? 'border-amber-300/25 bg-amber-500/10 text-amber-100' : 'border-sky-300/25 bg-sky-500/10 text-sky-100'}`}>
                  <p className="font-semibold text-white">{existingInstall?.resources?.length || 0} item{existingInstall?.resources?.length === 1 ? '' : 's'} found on this server</p>
                  <p className="mt-1 opacity-85">
                    {existingInstall?.conflict
                      ? 'Recover or review these apps before creating another production instance.'
                      : `Development mode is using the isolated instance ${setupStatus?.instanceSlug || 'project-os-dev'}.`}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild className="bg-violet-600 text-white hover:bg-violet-500">
                    <Link to="/resolve-existing-apps">Recover existing apps</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/home">Abort setup</Link>
                  </Button>
                  {setupStatus?.devMode && showAdvancedMetrics && (
                    <Badge className="border-sky-300/25 bg-sky-500/10 px-3 py-2 text-sky-100" variant="outline">Separate development instance allowed</Badge>
                  )}
                </div>
                {showAdvancedMetrics && Boolean(existingInstall?.resources?.length) && (
                  <Collapsible className="mt-3 rounded-lg border border-white/10 bg-slate-950/55 p-4 text-sm text-slate-300">
                    <CollapsibleTrigger className="w-full cursor-pointer text-left font-semibold text-white">Advanced found-app details</CollapsibleTrigger>
                    <CollapsibleContent className="mt-3 grid gap-2">
                      {existingInstall?.resources.map((resource) => (
                        <div className="rounded-lg border border-white/10 bg-slate-950/55 p-3" key={resource.id}>
                          <p className="font-semibold text-white">{resource.label}</p>
                          <p className="mt-1 text-slate-400">{resource.summary}</p>
                          <p className="mt-1 text-xs text-slate-500">Owner: {resource.ownerInstanceId || 'Unknown'}</p>
                        </div>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </WizardCard>
            )}

            <WizardCard icon={ServerCog} title="Name this device" text="This name appears in Project OS and helps identify the box on your network.">
              <Input className="max-w-md border-slate-700 bg-slate-950/70 text-white" onChange={(event) => setDeviceName(event.target.value)} value={deviceName} />
            </WizardCard>

            <WizardCard icon={ShieldCheck} title="Device readiness" text={readiness.summary}>
              <div className={`mb-3 rounded-lg border p-4 ${readiness.canCompleteOnboarding ? 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100' : 'border-amber-300/25 bg-amber-500/10 text-amber-100'}`}>
                <div className="flex items-center gap-2 font-semibold">
                  {readiness.canCompleteOnboarding ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
                  <span>{readiness.headline}</span>
                </div>
                <p className="mt-1 text-sm opacity-85">{readiness.summary}</p>
              </div>
              <div className="mb-3 grid gap-2 md:grid-cols-2">
                {readiness.groups.map((group) => (
                  <div className="rounded-lg border border-white/10 bg-slate-950/55 p-3" key={group.id}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-white">{group.label}</span>
                      <Badge className={group.status === 'ok' ? 'bg-emerald-500/15 text-emerald-100' : group.status === 'warning' ? 'bg-amber-500/15 text-amber-100' : 'bg-slate-700 text-slate-200'}>{readinessLabel(group.status)}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-400">{group.message}</p>
                  </div>
                ))}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {checks.map((check) => (
                  <div className="rounded-lg border border-white/10 bg-slate-950/55 p-3" key={check.id}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-white">{check.label}</span>
                      <Badge className={check.status === 'ok' ? 'bg-emerald-500/15 text-emerald-100' : check.status === 'warning' ? 'bg-amber-500/15 text-amber-100' : 'bg-slate-700 text-slate-200'}>{check.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-400">{check.message}</p>
                    {check.actionLabel && (
                      <p className="mt-2 text-xs font-semibold text-violet-200">{check.actionLabel}: {check.actionCommand || 'Open the linked setup step'}</p>
                    )}
                  </div>
                ))}
              </div>
            </WizardCard>

            <WizardCard icon={Network} title="Private access" text={state.tailscaleConnected ? 'Tailscale is connected, so private app links can be created.' : 'Tailscale is not connected yet. Project OS will keep local access working and guide private access later.'}>
              <div className="grid gap-3 lg:grid-cols-3">
                <PrivateAccessChoiceCard
                  active={privateAccessChoice === 'setup-now'}
                  detail="Use Tailscale for private app links from your own devices."
                  label="Set up private access now"
                  onClick={() => setPrivateAccessChoice('setup-now')}
                />
                <PrivateAccessChoiceCard
                  active={privateAccessChoice === 'local-only'}
                  detail="Keep apps available on this home network and revisit private access later."
                  label="Use local-only for now"
                  onClick={() => setPrivateAccessChoice('local-only')}
                />
                <PrivateAccessChoiceCard
                  active={privateAccessChoice === 'already-connected'}
                  detail="Use this when Tailscale is already connected or managed outside Project OS."
                  label="I already use Tailscale"
                  onClick={() => setPrivateAccessChoice('already-connected')}
                />
              </div>
              <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/55 p-4 text-sm text-slate-300">
                <div>LAN setup URL: <span className="font-semibold text-white">{state.doctor.lanUrl}</span></div>
                {privateAccessChoice === 'setup-now' && (
                  <div className="mt-3 grid gap-2 text-slate-400">
                    <p>{privateAccessGroup?.message || 'Project OS will use Tailscale for private app links.'}</p>
                    {!state.tailscaleConnected && <p>Next action: <span className="font-semibold text-white">{tailscaleCheck?.actionCommand || 'tailscale up'}</span></p>}
                    {state.tailscaleConnected && operatorCheck?.status === 'warning' && <p>Tailscale Serve permission: <span className="font-semibold text-white">{operatorCheck.actionCommand}</span></p>}
                    <p>MagicDNS and HTTPS must be enabled in Tailscale before private app links can use friendly secure names.</p>
                  </div>
                )}
                {privateAccessChoice === 'local-only' && <p className="mt-3 text-slate-400">Local-only setup is supported. Network can continue the private-access setup path later.</p>}
                {privateAccessChoice === 'already-connected' && <p className="mt-3 text-slate-400">{state.tailscaleConnected ? 'Project OS sees Tailscale connected.' : 'Project OS does not see Tailscale connected yet. You can finish local setup and reconnect from Network later.'}</p>}
              </div>
            </WizardCard>

            <WizardCard icon={HardDrive} title="Storage and backups" text="Choose how protected you want this first setup to be. You can change this later.">
              <div className="grid gap-3 lg:grid-cols-3">
                <BackupChoice
                  active={backupPosture === 'routine'}
                  detail="Project OS keeps app restore points on this device. This helps with app mistakes, but it does not protect against drive failure."
                  label="Same-device backups"
                  onClick={() => {
                    setBackupPosture('routine');
                    setAutomaticBackups(true);
                  }}
                />
                <BackupChoice
                  active={backupPosture === 'external'}
                  detail="Use another mounted drive or off-device location. Project OS will store routine restore points there after setup."
                  label="External backup location"
                  onClick={() => {
                    setBackupPosture('external');
                    setAutomaticBackups(true);
                  }}
                />
                <BackupChoice
                  active={backupPosture === 'later'}
                  detail="Skip routine backups for now. You can still run manual backups after setup."
                  label="Configure backups later"
                  onClick={() => {
                    setBackupPosture('later');
                    setAutomaticBackups(false);
                  }}
                />
              </div>
              {backupPosture === 'external' && (
                <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/55 p-4">
                  <label className="block text-sm font-semibold text-white" htmlFor="backup-destination">Backup destination</label>
                  <Input
                    className="mt-2 border-slate-700 bg-slate-950/70 text-white"
                    id="backup-destination"
                    onChange={(event) => setBackupDestination(event.target.value)}
                    placeholder="/mnt/backup-drive/project-os-backups"
                    value={backupDestination}
                  />
                  <p className="mt-2 text-sm text-slate-400">Use an absolute path on a mounted drive. Project OS will check that it can create and write this folder before setup finishes.</p>
                </div>
              )}
              {backupPosture !== 'later' && (
                <label className="mt-3 flex items-center gap-3 rounded-lg border border-white/10 bg-slate-950/55 p-4">
                  <Checkbox checked={automaticBackups} onCheckedChange={(checked) => setAutomaticBackups(Boolean(checked))} />
                  <span>
                    <span className="block font-semibold text-white">Run routine backups</span>
                    <span className="text-sm text-slate-400">{backupPosture === 'external' ? `Use ${backupDestination || 'the selected backup destination'}` : `Use ${defaultBackupDestination}`}</span>
                  </span>
                </label>
              )}
              <Collapsible className="mt-3 rounded-lg border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-300">
                <CollapsibleTrigger className="w-full cursor-pointer text-left font-semibold text-white">Advanced backup details</CollapsibleTrigger>
                <CollapsibleContent className="mt-3 grid gap-2 text-slate-400">
                  <p>Project OS runtime path: {state.runtimePath}</p>
                  <p>Default backup path: {defaultBackupDestination}</p>
                  <p>Same-device backups are useful restore points, but external backups are safer if the main drive fails.</p>
                </CollapsibleContent>
              </Collapsible>
            </WizardCard>

            <WizardCard icon={Sparkles} title="Recommended starter apps" text="These are suggestions only. Project OS will not install them until you confirm from Marketplace.">
              <div className="grid gap-3 md:grid-cols-3">
                {starterApps.map((app) => (
                  <button className={`rounded-lg border p-4 text-left transition ${selectedApps.includes(app.id) ? 'border-violet-300/50 bg-violet-500/15' : 'border-white/10 bg-slate-950/55 hover:bg-slate-900'}`} key={app.id} onClick={() => toggleApp(app.id)} type="button">
                    <span className="font-semibold text-white">{app.label}</span>
                    <span className="mt-1 block text-sm text-slate-400">{app.detail}</span>
                  </button>
                ))}
              </div>
            </WizardCard>
          </div>

          <aside className="h-fit rounded-lg border border-white/10 bg-slate-950/70 p-5">
            <h2 className="text-lg font-bold text-white">Setup summary</h2>
            <div className="mt-4 grid gap-3 text-sm">
              <SummaryLine label="Device" value={deviceName} />
              <SummaryLine label="Readiness" value={readiness.headline} />
              <SummaryLine label="Private access" value={privateAccessSummary(privateAccessChoice, state.tailscaleConnected)} />
              <SummaryLine label="Backups" value={backupSummary(backupPosture, automaticBackups)} />
              <SummaryLine label="Starter apps" value={`${selectedApps.length} selected`} />
            </div>
            {readiness.finishAnywayRequiresAdvanced && readiness.canCompleteOnboarding && (
              <Collapsible className="mt-4 rounded-lg border border-white/10 bg-slate-950/55 p-3 text-sm text-slate-300">
                <CollapsibleTrigger className="w-full cursor-pointer text-left font-semibold text-white">Advanced finish</CollapsibleTrigger>
                <CollapsibleContent asChild>
                  <label className="mt-3 flex items-center gap-3">
                  <Checkbox checked={advancedFinish} onCheckedChange={(checked) => setAdvancedFinish(Boolean(checked))} />
                  <span>Finish anyway and handle the remaining setup items later.</span>
                  </label>
                </CollapsibleContent>
              </Collapsible>
            )}
            <DisabledAction className="mt-5 w-full" disabled={finishDisabled} reason={finishDisabledReason}>
              <Button className="w-full bg-violet-600 text-white hover:bg-violet-500" disabled={finishDisabled} onClick={finish} type="button">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                {readiness.finishAnywayRequiresAdvanced && advancedFinish ? 'Finish anyway' : 'Finish setup'}
              </Button>
            </DisabledAction>
            {!readiness.canCompleteOnboarding && <p className="mt-3 text-sm text-amber-200">{readiness.summary}</p>}
          </aside>
        </div>
      </section>
    </main>
  );
}

async function persistSetupProgress(privateAccessChoice: PrivateAccessChoice) {
  await SystemAPIClient.completeSetupStep('welcome');
  await SystemAPIClient.completeSetupStep('host_check');
  await SystemAPIClient.completeSetupStep('docker_check');
  await SystemAPIClient.completeSetupStep('access_choice');
  if (privateAccessChoice === 'local-only') {
    await SystemAPIClient.skipSetupStep('tailscale_connect');
  } else {
    await SystemAPIClient.completeSetupStep('tailscale_connect');
  }
  await SystemAPIClient.completeSetupStep('starter_apps');
  await SystemAPIClient.skipSetupStep('first_backup');
  await SystemAPIClient.completeSetupStep('done');
}

function WizardCard({ children, icon: Icon, text, title }: { children: ReactNode; icon: typeof ServerCog; text: string; title: string }) {
  return (
    <Card className="border-white/10 bg-slate-950/65 py-0 text-slate-100">
      <CardContent className="p-5">
        <div className="mb-4 flex gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-violet-500/15 text-violet-100">
            <Icon className="size-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">{title}</h2>
            <p className="mt-1 text-sm text-slate-400">{text}</p>
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function BackupChoice({ active, detail, label, onClick }: { active: boolean; detail: string; label: string; onClick: () => void }) {
  return (
    <button className={`rounded-lg border p-4 text-left transition ${active ? 'border-emerald-300/50 bg-emerald-500/15' : 'border-white/10 bg-slate-950/55 hover:bg-slate-900'}`} onClick={onClick} type="button">
      <span className="font-semibold text-white">{label}</span>
      <span className="mt-1 block text-sm text-slate-400">{detail}</span>
    </button>
  );
}

function PrivateAccessChoiceCard({ active, detail, label, onClick }: { active: boolean; detail: string; label: string; onClick: () => void }) {
  return (
    <button className={`rounded-lg border p-4 text-left transition ${active ? 'border-sky-300/50 bg-sky-500/15' : 'border-white/10 bg-slate-950/55 hover:bg-slate-900'}`} onClick={onClick} type="button">
      <span className="font-semibold text-white">{label}</span>
      <span className="mt-1 block text-sm text-slate-400">{detail}</span>
    </button>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-white/10 pb-2">
      <span className="text-slate-400">{label}</span>
      <span className="text-right font-semibold text-white">{value}</span>
    </div>
  );
}

function validateBackupDestination(posture: BackupPosture, destination: string) {
  if (posture !== 'external') return null;
  const value = destination.trim();
  if (!value) return 'Choose a backup destination, or pick a different backup option.';
  if (!value.startsWith('/')) return 'Backup destination must be an absolute path that starts with /.';
  if (value === '/' || value === '/tmp') return 'Choose a dedicated backup folder instead of a system or temporary folder.';
  return null;
}

function cleanPrivateAccessChoice(value: string, tailscaleConnected: boolean): PrivateAccessChoice {
  if (value === 'setup-now' || value === 'local-only' || value === 'already-connected') {
    return value;
  }
  return tailscaleConnected ? 'already-connected' : 'local-only';
}

function readinessLabel(status: string) {
  if (status === 'ok') return 'Ready';
  if (status === 'warning') return 'Needs setup';
  return 'Later';
}

function privateAccessSummary(choice: PrivateAccessChoice, connected: boolean) {
  if (connected) return 'Connected';
  if (choice === 'setup-now') return 'Set up now';
  if (choice === 'already-connected') return 'Reconnect';
  return 'Local only';
}

function backupSummary(posture: BackupPosture, automaticBackups: boolean) {
  if (posture === 'later') return 'Later';
  if (!automaticBackups) return 'Manual only';
  if (posture === 'external') return 'External folder';
  return 'Same device';
}

export default OnboardingWizard;
