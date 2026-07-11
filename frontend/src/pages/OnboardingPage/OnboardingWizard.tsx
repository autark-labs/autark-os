import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, HardDrive, Loader2, Network, ServerCog, ShieldCheck, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SystemAPIClient } from '@/api/SystemAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { PageLoadError } from '@/components/autark-os/PageLoadError';
import { PageLoadingState } from '@/components/autark-os/PageLoadingState';
import { ProjectDarkControlButton, ProjectPrimaryButton } from '@/components/primitives/ProjectButtons';
import { MetadataBadge } from '@/components/autark-os/MetadataBadge';
import { StatusBadge } from '@/components/autark-os/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { OnboardingState, SystemSetupStatus } from '@/types/system';
import {
  clampOnboardingStep,
  cleanPrivateAccessChoice,
  completedOnboardingSteps,
  onboardingSteps,
  validateOnboardingStep,
  type BackupPosture,
  type OnboardingDraft,
  type PrivateAccessChoice,
} from './OnboardingWizard.logic';

type OnboardingWizardProps = {
  onComplete: () => void;
};

const starterApps = [
  { id: 'vaultwarden', label: 'Vaultwarden', detail: 'Private password vault' },
  { id: 'jellyfin', label: 'Jellyfin', detail: 'Personal media streaming' },
  { id: 'homepage', label: 'Homepage', detail: 'Friendly app dashboard' },
];

function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [setupStatus, setSetupStatus] = useState<SystemSetupStatus | null>(null);
  const [draft, setDraft] = useState<OnboardingDraft>(emptyDraft());
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [advancedFinish, setAdvancedFinish] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadRequestId = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setError(null);
    try {
      const [nextState, nextSetup] = await Promise.all([SystemAPIClient.onboarding(), SystemAPIClient.setupStatus()]);
      if (loadRequestId.current !== requestId) return;
      setState(nextState);
      setSetupStatus(nextSetup);
      setDraft(draftFromState(nextState));
      setStep(clampOnboardingStep(nextState.currentStep));
    } catch (loadError) {
      if (loadRequestId.current !== requestId) return;
      setError(apiErrorMessage(loadError, 'Setup could not be loaded.'));
    } finally {
      if (loadRequestId.current === requestId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      loadRequestId.current += 1;
    };
  }, [load]);

  const defaultBackupDestination = state ? `${state.runtimePath}/backups` : '';
  const readiness = state?.doctor.readiness;
  const current = onboardingSteps[step];
  const isReviewStep = current?.id === 'review';
  const canFinish = Boolean(readiness?.canCompleteOnboarding && (!readiness.finishAnywayRequiresAdvanced || advancedFinish));
  const existingInstall = setupStatus?.existingInstall;
  const showExistingInstallWarning = Boolean(existingInstall?.conflict || (setupStatus?.devMode && existingInstall?.resources?.length));

  const persistDraft = useCallback(async (nextStep: number) => {
    if (!state) return null;
    const destination = draft.backupPosture === 'external' ? draft.backupDestination.trim() : defaultBackupDestination;
    const nextState = await SystemAPIClient.updateOnboarding({
      status: 'in_progress',
      currentStep: nextStep,
      deviceName: draft.deviceName.trim(),
      backupDestination: nextStep >= 4 ? destination : undefined,
      automaticBackupsEnabled: nextStep >= 4 ? (draft.backupPosture === 'later' ? false : draft.automaticBackups) : undefined,
      privateAccessChoice: nextStep >= 3 ? draft.privateAccessChoice : undefined,
      recommendedApps: nextStep >= 5 ? draft.selectedApps : undefined,
      completedSteps: completedOnboardingSteps(nextStep),
    });
    setState(nextState);
    setDraft(draftFromState(nextState));
    setStep(clampOnboardingStep(nextStep));
    return nextState;
  }, [defaultBackupDestination, draft, state]);

  const moveBack = useCallback(async () => {
    const previousStep = Math.max(0, step - 1);
    if (previousStep === step || !state) return;
    setSaving(true);
    setError(null);
    try {
      const nextState = await SystemAPIClient.updateOnboarding({
        status: 'in_progress',
        currentStep: previousStep,
        completedSteps: completedOnboardingSteps(previousStep),
      });
      setState(nextState);
      setStep(previousStep);
    } catch (saveError) {
      setError(apiErrorMessage(saveError, 'Autark-OS could not save setup progress.'));
    } finally {
      setSaving(false);
    }
  }, [state, step]);

  const moveNext = useCallback(async () => {
    const validation = validateOnboardingStep(step, draft);
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await persistDraft(Math.min(step + 1, onboardingSteps.length - 1));
    } catch (saveError) {
      setError(apiErrorMessage(saveError, 'Autark-OS could not save this setup step.'));
    } finally {
      setSaving(false);
    }
  }, [draft, persistDraft, step]);

  const finish = useCallback(async () => {
    if (!state || !readiness) return;
    const validation = validateOnboardingStep(3, draft);
    if (validation) {
      setError(validation);
      return;
    }
    if (!readiness.canCompleteOnboarding) {
      setError(readiness.summary);
      return;
    }
    if (readiness.finishAnywayRequiresAdvanced && !advancedFinish) {
      setError('Review Advanced finish before completing setup with remaining optional work.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await persistDraft(6);
      await persistSetupProgress(draft.privateAccessChoice);
      await SystemAPIClient.completeOnboarding();
      onComplete();
    } catch (saveError) {
      setError(apiErrorMessage(saveError, 'Setup could not be saved.'));
    } finally {
      setSaving(false);
    }
  }, [advancedFinish, draft, onComplete, persistDraft, readiness, state]);

  const updateDraft = useCallback((updates: Partial<OnboardingDraft>) => {
    setDraft((currentDraft) => ({ ...currentDraft, ...updates }));
  }, []);

  const toggleApp = useCallback((appId: string) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      selectedApps: currentDraft.selectedApps.includes(appId)
        ? currentDraft.selectedApps.filter((id) => id !== appId)
        : [...currentDraft.selectedApps, appId],
    }));
  }, []);

  const stepContent = useMemo(() => {
    if (!state || !current) return null;
    if (current.id === 'device') return <DeviceStep deviceName={draft.deviceName} onDeviceNameChange={(deviceName) => updateDraft({ deviceName })} />;
    if (current.id === 'readiness') return <ReadinessStep existingInstall={existingInstall} setupStatus={setupStatus} state={state} showExistingInstallWarning={showExistingInstallWarning} />;
    if (current.id === 'access') return <AccessStep draft={draft} onChange={updateDraft} state={state} />;
    if (current.id === 'backups') return <BackupsStep defaultDestination={defaultBackupDestination} draft={draft} onChange={updateDraft} />;
    if (current.id === 'apps') return <AppsStep selectedApps={draft.selectedApps} onToggleApp={toggleApp} />;
    return <ReviewStep advancedFinish={advancedFinish} draft={draft} onAdvancedFinishChange={setAdvancedFinish} readiness={readiness} state={state} />;
  }, [advancedFinish, current, defaultBackupDestination, draft, existingInstall, readiness, setupStatus, showExistingInstallWarning, state, toggleApp, updateDraft]);

  if (loading) return <OnboardingLoadingState />;
  if (!state) return <OnboardingLoadError message={error || 'Setup could not be loaded.'} onRetry={() => void load()} />;

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-8">
      <section className="mx-auto grid max-w-4xl gap-5">
        <header className="rounded-2xl border border-sky-400/30 bg-slate-900 p-6 shadow-xl shadow-slate-950/30 md:p-8">
          <MetadataBadge tone="info">First boot</MetadataBadge>
          <h1 className="mt-4 text-3xl font-black tracking-normal text-white md:text-5xl">Set up Autark-OS</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-300">A few guided choices will prepare this device for your first apps. You can revisit optional choices later.</p>
          <ol className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Setup progress">
            {onboardingSteps.map((item, index) => (
              <li className="min-w-0" key={item.id}>
                <div className={cn('h-1 rounded-full', index < step ? 'bg-emerald-400' : index === step ? 'bg-cyan-300' : 'bg-slate-700')} />
                <span aria-current={index === step ? 'step' : undefined} className={cn('mt-2 block truncate text-xs font-semibold', index === step ? 'text-cyan-100' : index < step ? 'text-emerald-200' : 'text-slate-500')}>{item.label}</span>
              </li>
            ))}
          </ol>
        </header>

        {error && <div className="rounded-xl border border-red-300/25 bg-red-500/10 p-4 text-sm text-red-100" role="alert">{error}</div>}

        <WizardCard icon={iconForStep(current.id)} text={descriptionForStep(current.id)} title={current.label}>
          {stepContent}
        </WizardCard>

        <footer className="flex flex-col-reverse gap-3 rounded-2xl border border-sky-400/25 bg-slate-900 p-4 shadow-xl shadow-slate-950/25 sm:flex-row sm:items-center sm:justify-between">
          <ProjectDarkControlButton disabled={saving || step === 0} onClick={() => void moveBack()} type="button">
            <ChevronLeft className="size-4" />
            Back
          </ProjectDarkControlButton>
          {isReviewStep ? (
            <DisabledAction disabled={saving || !canFinish} reason={saving ? 'Autark-OS is already saving setup.' : readiness?.summary || 'Review setup before finishing.'}>
              <ProjectPrimaryButton disabled={saving || !canFinish} onClick={() => void finish()} type="button">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                {advancedFinish ? 'Finish anyway' : 'Finish setup'}
              </ProjectPrimaryButton>
            </DisabledAction>
          ) : (
            <ProjectPrimaryButton disabled={saving} onClick={() => void moveNext()} type="button">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <ChevronRight className="size-4" />}
              Continue
            </ProjectPrimaryButton>
          )}
        </footer>
      </section>
    </main>
  );
}

function DeviceStep({ deviceName, onDeviceNameChange }: { deviceName: string; onDeviceNameChange: (value: string) => void }) {
  return (
    <div className="grid gap-4">
      <label className="grid max-w-md gap-2 text-sm font-semibold text-white" htmlFor="device-name">
        Device name
        <Input className="border-sky-400/25 bg-slate-800 text-white" id="device-name" onChange={(event) => onDeviceNameChange(event.target.value)} value={deviceName} />
      </label>
      <p className="text-sm leading-6 text-slate-400">This name appears in Autark-OS and helps identify this device on your network.</p>
    </div>
  );
}

function ReadinessStep({ existingInstall, setupStatus, state, showExistingInstallWarning }: { existingInstall?: SystemSetupStatus['existingInstall'] | null; setupStatus: SystemSetupStatus | null; state: OnboardingState; showExistingInstallWarning: boolean }) {
  const readiness = state.doctor.readiness;
  return (
    <div className="grid gap-4">
      <div className={cn('rounded-xl border p-4', readiness.canCompleteOnboarding ? 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100' : 'border-amber-300/25 bg-amber-500/10 text-amber-100')}>
        <p className="font-semibold">{readiness.headline}</p>
        <p className="mt-1 text-sm leading-6 opacity-85">{readiness.summary}</p>
      </div>
      {showExistingInstallWarning && (
        <div className="rounded-xl border border-amber-300/25 bg-amber-500/10 p-4 text-amber-100">
          <p className="font-semibold">{existingInstall?.headline || 'Existing apps found on this server'}</p>
          <p className="mt-1 text-sm leading-6">{existingInstall?.summary || 'Autark-OS will keep these services separate until you review them after setup.'}</p>
          <p className="mt-2 text-xs text-amber-100/75">{existingInstall?.resources?.length || 0} resource{existingInstall?.resources?.length === 1 ? '' : 's'} found{setupStatus?.devMode ? ` in ${setupStatus.instanceSlug || 'the isolated development instance'}` : ''}.</p>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {readiness.groups.map((group) => (
          <div className="rounded-xl border border-sky-400/25 bg-slate-800 p-4" key={group.id}>
            <div className="flex items-center justify-between gap-3"><span className="font-semibold text-white">{group.label}</span><StatusBadge tone={group.status === 'ok' ? 'success' : 'warning'}>{group.status === 'ok' ? 'Ready' : 'Needs attention'}</StatusBadge></div>
            <p className="mt-2 text-sm leading-6 text-slate-400">{group.message}</p>
          </div>
        ))}
      </div>
      <details className="rounded-xl border border-sky-400/25 bg-slate-800 p-4 text-sm text-slate-300">
        <summary className="cursor-pointer font-semibold text-white">Technical readiness details</summary>
        <div className="mt-3 grid gap-2">{state.doctor.checks.map((check) => <p key={check.id}><span className="font-semibold text-white">{check.label}:</span> {check.message}</p>)}</div>
      </details>
    </div>
  );
}

function AccessStep({ draft, onChange, state }: { draft: OnboardingDraft; onChange: (updates: Partial<OnboardingDraft>) => void; state: OnboardingState }) {
  const accessGroup = state.doctor.readiness.groups.find((group) => group.id === 'private-access');
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <ChoiceCard active={draft.privateAccessChoice === 'setup-now'} detail="Use Tailscale for private app links from your own devices." label="Set up private access now" onClick={() => onChange({ privateAccessChoice: 'setup-now' })} />
        <ChoiceCard active={draft.privateAccessChoice === 'local-only'} detail="Keep apps on this home network and revisit private access later." label="Use local-only for now" onClick={() => onChange({ privateAccessChoice: 'local-only' })} />
        <ChoiceCard active={draft.privateAccessChoice === 'already-connected'} detail="Use this when Tailscale is already managed outside Autark-OS." label="I already use Tailscale" onClick={() => onChange({ privateAccessChoice: 'already-connected' })} />
      </div>
      <div className="rounded-xl border border-sky-400/25 bg-slate-800 p-4 text-sm leading-6 text-slate-300">
        <p>Local setup URL: <span className="font-semibold text-white">{state.doctor.lanUrl}</span></p>
        {draft.privateAccessChoice === 'setup-now' && <p className="mt-2">{accessGroup?.message || 'Autark-OS will guide private links after setup.'}</p>}
        {draft.privateAccessChoice === 'local-only' && <p className="mt-2">Local-only setup is supported. You can configure private access from Access later.</p>}
        {draft.privateAccessChoice === 'already-connected' && <p className="mt-2">{state.tailscaleConnected ? 'Autark-OS sees Tailscale connected.' : 'Autark-OS does not see Tailscale connected yet; local access remains available.'}</p>}
      </div>
    </div>
  );
}

function BackupsStep({ defaultDestination, draft, onChange }: { defaultDestination: string; draft: OnboardingDraft; onChange: (updates: Partial<OnboardingDraft>) => void }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <ChoiceCard active={draft.backupPosture === 'routine'} detail="Keep restore points on this device for routine recovery." label="Same-device backups" onClick={() => onChange({ automaticBackups: true, backupPosture: 'routine' })} />
        <ChoiceCard active={draft.backupPosture === 'external'} detail="Use a mounted external drive or off-device folder." label="External backup location" onClick={() => onChange({ automaticBackups: true, backupPosture: 'external' })} />
        <ChoiceCard active={draft.backupPosture === 'later'} detail="Skip routine backups for now; manual backups remain available." label="Configure backups later" onClick={() => onChange({ automaticBackups: false, backupPosture: 'later' })} />
      </div>
      {draft.backupPosture === 'external' && <label className="grid gap-2 text-sm font-semibold text-white" htmlFor="backup-destination">Backup destination<Input className="border-sky-400/25 bg-slate-800 text-white" id="backup-destination" onChange={(event) => onChange({ backupDestination: event.target.value })} placeholder="/mnt/backup-drive/autark-os-backups" value={draft.backupDestination} /></label>}
      {draft.backupPosture !== 'later' && <label className="flex items-center gap-3 rounded-xl border border-sky-400/25 bg-slate-800 p-4"><Checkbox checked={draft.automaticBackups} onCheckedChange={(checked) => onChange({ automaticBackups: Boolean(checked) })} /><span><span className="block font-semibold text-white">Run routine backups</span><span className="text-sm text-slate-400">{draft.backupPosture === 'external' ? draft.backupDestination || 'Choose a destination above.' : `Use ${defaultDestination}`}</span></span></label>}
      <p className="text-sm leading-6 text-slate-400">Same-device restore points help with app mistakes. Use an external location to protect against drive failure.</p>
    </div>
  );
}

function AppsStep({ onToggleApp, selectedApps }: { onToggleApp: (appId: string) => void; selectedApps: string[] }) {
  return <div className="grid gap-3 md:grid-cols-3">{starterApps.map((app) => <ChoiceCard active={selectedApps.includes(app.id)} detail={app.detail} key={app.id} label={app.label} onClick={() => onToggleApp(app.id)} />)}</div>;
}

function ReviewStep({ advancedFinish, draft, onAdvancedFinishChange, readiness, state }: { advancedFinish: boolean; draft: OnboardingDraft; onAdvancedFinishChange: (value: boolean) => void; readiness: OnboardingState['doctor']['readiness'] | undefined; state: OnboardingState }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 rounded-xl border border-sky-400/25 bg-slate-800 p-4 text-sm"><SummaryLine label="Device" value={draft.deviceName} /><SummaryLine label="Readiness" value={readiness?.headline || 'Checking'} /><SummaryLine label="Private access" value={privateAccessSummary(draft.privateAccessChoice, state.tailscaleConnected)} /><SummaryLine label="Backups" value={backupSummary(draft.backupPosture, draft.automaticBackups)} /><SummaryLine label="Starter apps" value={`${draft.selectedApps.length} selected`} /></div>
      {readiness?.finishAnywayRequiresAdvanced && readiness.canCompleteOnboarding && <label className="flex gap-3 rounded-xl border border-amber-300/25 bg-amber-500/10 p-4 text-sm text-amber-100"><Checkbox checked={advancedFinish} onCheckedChange={(checked) => onAdvancedFinishChange(Boolean(checked))} /><span><span className="block font-semibold">Finish with optional work remaining</span><span className="mt-1 block leading-6">You can return to Access or Diagnostics after setup to finish the remaining optional checks.</span></span></label>}
      {!readiness?.canCompleteOnboarding && <div className="rounded-xl border border-amber-300/25 bg-amber-500/10 p-4 text-sm text-amber-100">{readiness?.summary || 'Autark-OS is still checking whether setup can finish.'}</div>}
    </div>
  );
}

function ChoiceCard({ active, detail, label, onClick }: { active: boolean; detail: string; label: string; onClick: () => void }) {
  return <button aria-pressed={active} className={cn('rounded-xl border p-4 text-left transition', active ? 'border-cyan-300/50 bg-cyan-400/10' : 'border-sky-400/25 bg-slate-800 hover:bg-slate-700')} onClick={onClick} type="button"><span className="font-semibold text-white">{label}</span><span className="mt-1 block text-sm leading-6 text-slate-400">{detail}</span></button>;
}

function WizardCard({ children, icon: Icon, text, title }: { children: ReactNode; icon: LucideIcon; text: string; title: string }) {
  return (
    <Card className="border-sky-400/30 bg-slate-900 py-0 text-slate-100 shadow-xl shadow-slate-950/30">
      <CardContent className="p-5 md:p-6">
        <div className="mb-5 flex gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-cyan-300/30 bg-cyan-400/10 text-cyan-100"><Icon className="size-5" /></span>
          <div><h2 className="text-xl font-bold text-white">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-400">{text}</p></div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3 border-b border-sky-400/20 pb-2 last:border-0 last:pb-0"><span className="text-slate-400">{label}</span><span className="text-right font-semibold text-white">{value}</span></div>;
}

function OnboardingLoadingState() {
  return <PageLoadingState fullScreen model={{ description: 'Checking your setup progress and appliance readiness.', title: 'Loading setup' }} />;
}

function OnboardingLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <PageLoadError fullScreen model={{ message, title: 'Setup could not load' }} onRetry={onRetry} />;
}

function emptyDraft(): OnboardingDraft {
  return { automaticBackups: true, backupDestination: '', backupPosture: 'routine', deviceName: 'Autark-OS', privateAccessChoice: 'local-only', selectedApps: starterApps.map((app) => app.id) };
}

function draftFromState(state: OnboardingState): OnboardingDraft {
  const defaultDestination = `${state.runtimePath}/backups`;
  const backupDestination = state.backupDestination || defaultDestination;
  const backupPosture: BackupPosture = !state.automaticBackupsEnabled ? 'later' : backupDestination === defaultDestination ? 'routine' : 'external';
  return { automaticBackups: state.automaticBackupsEnabled, backupDestination, backupPosture, deviceName: state.deviceName || 'Autark-OS', privateAccessChoice: cleanPrivateAccessChoice(state.privateAccessChoice, state.tailscaleConnected), selectedApps: state.recommendedApps.length ? state.recommendedApps : starterApps.map((app) => app.id) };
}

async function persistSetupProgress(privateAccessChoice: PrivateAccessChoice) {
  await SystemAPIClient.completeSetupStep('welcome');
  await SystemAPIClient.completeSetupStep('host_check');
  await SystemAPIClient.completeSetupStep('docker_check');
  await SystemAPIClient.completeSetupStep('access_choice');
  if (privateAccessChoice === 'local-only') await SystemAPIClient.skipSetupStep('tailscale_connect');
  else await SystemAPIClient.completeSetupStep('tailscale_connect');
  await SystemAPIClient.completeSetupStep('starter_apps');
  await SystemAPIClient.skipSetupStep('first_backup');
  await SystemAPIClient.completeSetupStep('done');
}

function iconForStep(step: string): LucideIcon {
  if (step === 'device') return ServerCog;
  if (step === 'readiness') return ShieldCheck;
  if (step === 'access') return Network;
  if (step === 'backups') return HardDrive;
  return Sparkles;
}

function descriptionForStep(step: string): string {
  if (step === 'device') return 'Choose a name that makes this device easy to recognize.';
  if (step === 'readiness') return 'Review the device checks Autark-OS needs before installing apps.';
  if (step === 'access') return 'Choose how you want to reach apps from your own devices.';
  if (step === 'backups') return 'Choose how restore points should be stored.';
  if (step === 'apps') return 'Pick a few suggestions to explore after setup.';
  return 'Review your choices before Autark-OS applies them.';
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
