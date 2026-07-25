import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Copy, Download, LoaderCircle, RefreshCw, ShieldCheck, Trash2, Unplug } from 'lucide-react';
import { apiErrorMessage } from '@/api/httpClient';
import type { ProStatusResponse } from '@/api/pro';
import { JobProgress } from '@/components/autark-os/JobProgress';
import { PageShell } from '@/components/layout/PageShell';
import { ProjectDarkControlButton, ProjectPrimaryButton, ProjectWarningButton } from '@/components/primitives/ProjectButtons';
import { ProjectPanel } from '@/components/primitives/Surface';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { ExtensionActionTarget } from '@/extensions/ExtensionActionTarget';
import { ExtensionSlot } from '@/extensions/ExtensionSlot';
import { showActionErrorNotification, showActionNotification } from '@/lib/actionNotifications';
import { copyText } from '@/lib/copyText';
import { terminalJob, useAutarkOsJobQuery } from '@/repositories/jobRepository';
import {
  useActivateProMutation,
  useCheckProModuleReleaseMutation,
  useContinueProActivationMutation,
  useDeactivateProMutation,
  useInstallOrUpdateProModuleMutation,
  useProStatusRepository,
  useRefreshProEntitlementMutation,
  useRemoveProModuleMutation,
} from '@/repositories/proRepository';
import { proLifecycleModel } from './proLifecycleModel';

const moduleRemovalConfirmation = 'REMOVE-AUTARK-PRO';
const deactivationConfirmation = 'DEACTIVATE-AUTARK-PRO';

function ProPage() {
  const statusQuery = useProStatusRepository();
  const activate = useActivateProMutation();
  const continueActivation = useContinueProActivationMutation();
  const refresh = useRefreshProEntitlementMutation();
  const checkRelease = useCheckProModuleReleaseMutation();
  const install = useInstallOrUpdateProModuleMutation();
  const remove = useRemoveProModuleMutation();
  const deactivate = useDeactivateProMutation();
  const status = statusQuery.data ?? null;
  const moduleJob = useAutarkOsJobQuery(status?.module?.jobId ?? null);
  const [activationCode, setActivationCode] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [removalOpen, setRemovalOpen] = useState(false);
  const [removalConfirmation, setRemovalConfirmation] = useState('');
  const [deactivationOpen, setDeactivationOpen] = useState(false);
  const [deactivationPhrase, setDeactivationPhrase] = useState('');
  const [moduleRetentionAcknowledged, setModuleRetentionAcknowledged] = useState(false);
  const [accountRetentionAcknowledged, setAccountRetentionAcknowledged] = useState(false);
  const busy = activate.isPending
    || continueActivation.isPending
    || refresh.isPending
    || checkRelease.isPending
    || install.isPending
    || remove.isPending
    || deactivate.isPending
    || Boolean(moduleJob.data && !terminalJob(moduleJob.data));

  useEffect(() => {
    document.title = 'Autark Pro · Autark-OS';
  }, []);

  useEffect(() => {
    if (moduleJob.data && terminalJob(moduleJob.data)) void statusQuery.refetch();
  }, [moduleJob.data, statusQuery]);

  function submitActivation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = activationCode.trim();
    if (code.length < 8) {
      setActionError('Enter the complete one-time activation code.');
      return;
    }
    setActionError(null);
    activate.mutate(code, {
      onError: (error) => handleError(error, 'Autark Pro activation failed'),
      onSuccess: () => {
        setActivationCode('');
        notify('Autark Pro activated', 'This server verified its signed entitlement.');
      },
    });
  }

  function resumeActivation() {
    const activationId = status?.activation.activationId;
    if (!activationId) return;
    setActionError(null);
    continueActivation.mutate(activationId, {
      onError: (error) => handleError(error, 'Autark Pro activation failed'),
      onSuccess: () => notify('Autark Pro activated', 'This server verified its signed entitlement.'),
    });
  }

  function refreshLicense() {
    setActionError(null);
    refresh.mutate(undefined, {
      onError: (error) => handleError(error, 'Pro license check failed'),
      onSuccess: () => notify('Pro license checked', 'The last verified entitlement is available locally.'),
    });
  }

  function installExtension() {
    setActionError(null);
    install.mutate(undefined, {
      onError: (error) => handleError(error, 'Pro installation failed'),
      onSuccess: () => notify('Pro installation queued', 'Autark-OS will verify and health-check the assigned private release.'),
    });
  }

  function checkForExtensionRelease() {
    setActionError(null);
    checkRelease.mutate(undefined, {
      onError: (error) => handleError(error, 'Pro release check failed'),
      onSuccess: () => notify('Pro release check queued', 'Autark-OS will verify the assigned signed release before installation.'),
    });
  }

  function removeExtension() {
    setActionError(null);
    remove.mutate(removalConfirmation, {
      onError: (error) => handleError(error, 'Private extension removal failed'),
      onSuccess: () => {
        closeRemoval();
        notify('Private extension removal queued', 'Autark-OS will stop and remove the private extension safely. Community Edition remains available.');
      },
    });
  }

  function deactivatePro() {
    setActionError(null);
    deactivate.mutate({
      acknowledgeAccountAssociationRetained: accountRetentionAcknowledged,
      acknowledgeModuleDataRetained: moduleRetentionAcknowledged,
      confirmation: deactivationPhrase,
    }, {
      onError: (error) => handleError(error, 'Autark Pro deactivation failed'),
      onSuccess: (result) => {
        closeDeactivation();
        notify('Autark Pro deactivated', result.message);
      },
    });
  }

  function closeRemoval() {
    setRemovalOpen(false);
    setRemovalConfirmation('');
  }

  function closeDeactivation() {
    setDeactivationOpen(false);
    setDeactivationPhrase('');
    setModuleRetentionAcknowledged(false);
    setAccountRetentionAcknowledged(false);
  }

  function handleError(error: unknown, title: string) {
    const message = apiErrorMessage(error, `${title}.`);
    setActionError(message);
    showActionErrorNotification(error, title);
  }

  if (statusQuery.isLoading && !status) return <LoadingState />;
  if (!status) return <UnavailableState message={apiErrorMessage(statusQuery.error, 'The local extension service did not return a status.')} onRetry={() => void statusQuery.refetch()} />;

  const lifecycle = proLifecycleModel(status);
  const extensionActive = Boolean(
    status.entitlement.localUseAllowed
    && status.module.activeDigest
    && status.module.health === 'healthy',
  );
  const canConfirmRemoval = removalConfirmation === moduleRemovalConfirmation && !busy;
  const canConfirmDeactivation = deactivationPhrase === deactivationConfirmation
    && moduleRetentionAcknowledged
    && accountRetentionAcknowledged
    && !busy;

  return (
    <PageShell>
      <ExtensionActionTarget actionId="review-pro" routeId="pro">
        <ProjectPanel className="overflow-hidden p-0">
          <div className="bg-app-hero-default p-6 md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="max-w-3xl">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-200/80">Signed private extension</p>
                <h1 className="mt-3 text-3xl font-black tracking-tight text-white md:text-5xl">{lifecycle.title}</h1>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-sky-100/75 sm:text-base">{lifecycle.description}</p>
                <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4" aria-label="Autark Pro lifecycle status">
                  <LifecycleValue label="License" value={formatLifecycleToken(status.entitlement.state)} />
                  <LifecycleValue label="Software updates" value={updateStatus(status)} />
                  <LifecycleValue label="Hosted services" value={hostedStatus(status)} />
                  <LifecycleValue label="Private extension" value={moduleStatus(status, extensionActive)} />
                </dl>
                <div className="mt-6 flex flex-wrap gap-3">
                  {lifecycle.primaryAction === 'continue-activation' && <ProjectPrimaryButton disabled={busy} onClick={resumeActivation} type="button"><ArrowRight className="size-4" />Continue activation</ProjectPrimaryButton>}
                  {lifecycle.primaryAction === 'check-release' && <ProjectPrimaryButton disabled={busy} onClick={checkForExtensionRelease} type="button">{busy ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}Check for update</ProjectPrimaryButton>}
                  {lifecycle.primaryAction === 'install-release' && <ProjectPrimaryButton disabled={busy} onClick={installExtension} type="button">{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}{status.module.activeDigest ? 'Update private extension' : 'Install private extension'}</ProjectPrimaryButton>}
                  {lifecycle.canRefreshEntitlement && <ProjectDarkControlButton disabled={busy} onClick={refreshLicense} type="button"><RefreshCw className={`size-4 ${refresh.isPending ? 'animate-spin' : ''}`} />Check license</ProjectDarkControlButton>}
                  {lifecycle.canRemoveModule && <ProjectWarningButton disabled={busy} onClick={() => setRemovalOpen(true)} type="button"><Trash2 className="size-4" />Remove private extension</ProjectWarningButton>}
                  {lifecycle.canDeactivate && <ProjectDarkControlButton disabled={busy} onClick={() => setDeactivationOpen(true)} type="button"><Unplug className="size-4" />Deactivate Pro</ProjectDarkControlButton>}
                </div>
              </div>
              <span className="grid size-14 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-100"><ShieldCheck className="size-7" /></span>
            </div>
          </div>
        </ProjectPanel>
      </ExtensionActionTarget>

      {lifecycle.primaryAction === 'activate' && (
        <ProjectPanel>
          <h2 className="text-lg font-semibold text-white">Activate this server</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">The one-time code is sent directly to the control plane and is not stored in the browser.</p>
          <form className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" onSubmit={submitActivation}>
            <label className="grid gap-1.5 text-sm font-medium text-white" htmlFor="pro-activation-code">Device activation code<Input autoCapitalize="characters" autoComplete="off" disabled={busy} id="pro-activation-code" maxLength={128} onChange={(event) => { setActivationCode(event.target.value); setActionError(null); }} placeholder="AUTARK-PRO-XXXX-XXXX" spellCheck={false} value={activationCode} /></label>
            <ProjectPrimaryButton disabled={busy || activationCode.trim().length < 8} type="submit">{busy ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}Verify this server</ProjectPrimaryButton>
          </form>
        </ProjectPanel>
      )}

      {lifecycle.reason && <ProjectPanel className="border-amber-300/30 bg-amber-400/10 text-sm text-amber-100" role="status">{lifecycle.reason}</ProjectPanel>}
      {actionError && <ProjectPanel className="border-red-400/35 bg-red-500/10 text-sm text-red-100" role="alert">{actionError}</ProjectPanel>}
      {moduleJob.data && <JobProgress job={moduleJob.data} subjectLabel="Private extension" />}

      <LifecycleDetails onCopy={(value, label) => void copyLifecycleValue(value, label)} status={status} />

      {extensionActive && <ExtensionSlot extensionId="autark-pro" showErrors surface="pro.dashboard" />}

      <RemovalDialog busy={busy} confirmation={removalConfirmation} onConfirm={removeExtension} onConfirmationChange={setRemovalConfirmation} onOpenChange={(open) => open ? setRemovalOpen(true) : closeRemoval()} open={removalOpen} ready={canConfirmRemoval} />
      <DeactivationDialog accountAcknowledged={accountRetentionAcknowledged} busy={busy} moduleAcknowledged={moduleRetentionAcknowledged} onAccountAcknowledged={setAccountRetentionAcknowledged} onConfirm={deactivatePro} onModuleAcknowledged={setModuleRetentionAcknowledged} onOpenChange={(open) => open ? setDeactivationOpen(true) : closeDeactivation()} onPhraseChange={setDeactivationPhrase} open={deactivationOpen} phrase={deactivationPhrase} ready={canConfirmDeactivation} />
    </PageShell>
  );
}

function LifecycleDetails({ onCopy, status }: { onCopy: (value: string, label: string) => void; status: ProStatusResponse }) {
  return (
    <ProjectPanel>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-white">Lifecycle details</h2><p className="mt-1 text-sm text-slate-400">These values come from the local entitlement and signed private-extension lifecycle.</p></div><span className="rounded-full border border-sky-300/20 px-2.5 py-1 text-xs font-semibold text-sky-100">{formatLifecycleToken(status.module.health)}</span></div>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
        <LifecycleValue label="Plan" value={formatPlan(status.entitlement.plan)} />
        <CopyableLifecycleValue label="Installation identity" onCopy={onCopy} value={status.device.publicKeyFingerprint} />
        <LifecycleValue label="Last license verification" value={formatLifecycleDate(status.refresh.lastSuccessAt ?? status.entitlement.lastVerifiedServerTime)} />
        <LifecycleValue label="Last release check or change" value={formatLifecycleDate(status.module.lastTransitionAt)} />
        <LifecycleValue label="Last successful transition" value={formatLifecycleDate(status.module.lastSuccessfulTransitionAt)} />
        <LifecycleValue label="Update eligibility" value={updateStatus(status)} />
        <CopyableLifecycleValue label="Active extension" onCopy={onCopy} value={extensionValue(status.module.componentVersion, status.module.activeDigest)} />
        <CopyableLifecycleValue label="Previous extension" onCopy={onCopy} value={extensionValue(status.module.previousComponentVersion, status.module.previousDigest)} />
        <LifecycleValue label="Available signed release" value={status.module.candidateVersion ?? 'None checked'} />
      </dl>
    </ProjectPanel>
  );
}

function LifecycleValue({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-cyan-200/15 bg-slate-950/20 px-3 py-2"><dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-cyan-100/60">{label}</dt><dd className="mt-1 break-words font-semibold text-white">{value}</dd></div>;
}

function CopyableLifecycleValue({ label, onCopy, value }: { label: string; onCopy: (value: string, label: string) => void; value: string }) {
  const copyable = value !== 'Not available' && value !== 'None checked';
  return <div className="rounded-xl border border-cyan-200/15 bg-slate-950/20 px-3 py-2"><dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-cyan-100/60">{label}</dt><dd className="mt-1 flex items-center gap-2 font-semibold text-white"><span className="min-w-0 break-all">{abbreviate(value)}</span>{copyable && <button aria-label={`Copy ${label}`} className="shrink-0 rounded-md p-1 text-cyan-100 hover:bg-cyan-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200" onClick={() => onCopy(value, label)} type="button"><Copy className="size-3.5" /></button>}</dd></div>;
}

function RemovalDialog({ busy, confirmation, onConfirm, onConfirmationChange, onOpenChange, open, ready }: { busy: boolean; confirmation: string; onConfirm: () => void; onConfirmationChange: (value: string) => void; onOpenChange: (open: boolean) => void; open: boolean; ready: boolean }) {
  return <AlertDialog onOpenChange={onOpenChange} open={open}><AlertDialogContent className="border-orange-400/30 bg-slate-950 text-slate-100"><AlertDialogHeader><AlertDialogTitle>Remove the private extension?</AlertDialogTitle><AlertDialogDescription className="text-slate-400">Autark-OS will stop and remove the signed private extension. Community Edition, your apps, settings, and core data remain available. This does not deactivate the Pro entitlement.</AlertDialogDescription></AlertDialogHeader><label className="grid gap-2 text-sm font-medium text-slate-100" htmlFor="pro-remove-confirmation">Type {moduleRemovalConfirmation} to confirm<Input autoComplete="off" id="pro-remove-confirmation" onChange={(event) => onConfirmationChange(event.target.value)} value={confirmation} /></label><AlertDialogFooter><ProjectDarkControlButton disabled={busy} onClick={() => onOpenChange(false)} type="button">Keep extension</ProjectDarkControlButton><ProjectWarningButton disabled={!ready} onClick={onConfirm} type="button">{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}Remove extension</ProjectWarningButton></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

function DeactivationDialog({ accountAcknowledged, busy, moduleAcknowledged, onAccountAcknowledged, onConfirm, onModuleAcknowledged, onOpenChange, onPhraseChange, open, phrase, ready }: { accountAcknowledged: boolean; busy: boolean; moduleAcknowledged: boolean; onAccountAcknowledged: (value: boolean) => void; onConfirm: () => void; onModuleAcknowledged: (value: boolean) => void; onOpenChange: (open: boolean) => void; onPhraseChange: (value: string) => void; open: boolean; phrase: string; ready: boolean }) {
  return <AlertDialog onOpenChange={onOpenChange} open={open}><AlertDialogContent className="border-orange-400/30 bg-slate-950 text-slate-100"><AlertDialogHeader><AlertDialogTitle>Deactivate Autark Pro on this appliance?</AlertDialogTitle><AlertDialogDescription className="text-slate-400">Deactivation safely returns this appliance to Community Edition. The local module data, device identity, and remote account association are retained so recovery can be audited; hosted access is disabled.</AlertDialogDescription></AlertDialogHeader><div className="grid gap-3 text-sm text-slate-200"><label className="flex items-start gap-2"><input checked={moduleAcknowledged} className="mt-1" onChange={(event) => onModuleAcknowledged(event.target.checked)} type="checkbox" /><span>I understand that local private-extension data is retained, not deleted.</span></label><label className="flex items-start gap-2"><input checked={accountAcknowledged} className="mt-1" onChange={(event) => onAccountAcknowledged(event.target.checked)} type="checkbox" /><span>I understand that the device identity and account association are retained for recovery and audit.</span></label><label className="grid gap-2 font-medium text-slate-100" htmlFor="pro-deactivate-confirmation">Type {deactivationConfirmation} to confirm<Input autoComplete="off" id="pro-deactivate-confirmation" onChange={(event) => onPhraseChange(event.target.value)} value={phrase} /></label></div><AlertDialogFooter><ProjectDarkControlButton disabled={busy} onClick={() => onOpenChange(false)} type="button">Keep Pro active</ProjectDarkControlButton><ProjectWarningButton disabled={!ready} onClick={onConfirm} type="button">{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Unplug className="size-4" />}Deactivate Pro</ProjectWarningButton></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

function updateStatus(status: ProStatusResponse) {
  if (status.entitlement.updatesAllowed) return `Eligible through ${formatLifecycleDate(status.entitlement.updatesThrough)}`;
  return status.entitlement.localUseAllowed ? 'No new private-extension releases' : 'Not available';
}

function hostedStatus(status: ProStatusResponse) {
  if (status.entitlement.hostedServicesAllowed) return `Available through ${formatLifecycleDate(status.entitlement.serviceLeaseExpiresAt)}`;
  return status.entitlement.localUseAllowed ? 'Not included or expired' : 'Not available';
}

function moduleStatus(status: ProStatusResponse, extensionActive: boolean) {
  if (extensionActive) return status.module.componentVersion ?? 'Healthy';
  if (status.module.state === 'RELEASE_AVAILABLE') return `${status.module.candidateVersion ?? 'Signed release'} available`;
  return formatLifecycleToken(status.module.state);
}

function extensionValue(version: string | null, digest: string | null) {
  if (!version && !digest) return 'Not available';
  return [version, digest].filter((value): value is string => Boolean(value)).join(' · ');
}

function formatPlan(value: string | null) { return value ? value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Not available'; }
function formatLifecycleToken(value: string) { return value.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase()); }
function formatLifecycleDate(value: string | null) { if (!value) return 'Not available'; const date = new Date(value); if (Number.isNaN(date.getTime())) return 'Not available'; return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date); }
function abbreviate(value: string) { return value.length > 36 ? `${value.slice(0, 14)}…${value.slice(-12)}` : value; }
async function copyLifecycleValue(value: string, label: string) { const result = await copyText(value); showActionNotification(result.ok ? { ok: true, severity: 'success', title: `${label} copied`, message: 'The value is ready to paste.' } : { ok: false, severity: 'warning', title: 'Copy unavailable', message: result.message }, `${label} copied`); }
function notify(title: string, message: string) { showActionNotification({ message, ok: true, severity: 'success', title }, title); }

function LoadingState() { return <PageShell><ProjectPanel aria-busy="true" className="grid min-h-80 place-items-center"><div className="flex items-center gap-3 text-sm text-slate-300" role="status"><LoaderCircle className="size-5 animate-spin text-cyan-200" />Loading extension status</div></ProjectPanel></PageShell>; }
function UnavailableState({ message, onRetry }: { message: string; onRetry: () => void }) { return <PageShell><ProjectPanel><h1 className="text-2xl font-black text-white">Pro status could not be loaded</h1><p className="mt-2 text-sm text-slate-400">{message} Community Edition remains available.</p><ProjectPrimaryButton className="mt-5" onClick={onRetry} type="button"><RefreshCw className="size-4" />Try again</ProjectPrimaryButton></ProjectPanel></PageShell>; }

export default ProPage;
