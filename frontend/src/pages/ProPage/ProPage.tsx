import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Download, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { apiErrorMessage } from '@/api/httpClient';
import { JobProgress } from '@/components/autark-os/JobProgress';
import { PageShell } from '@/components/layout/PageShell';
import { ProjectPrimaryButton } from '@/components/primitives/ProjectButtons';
import { ProjectPanel } from '@/components/primitives/Surface';
import { Input } from '@/components/ui/input';
import { ExtensionSlot } from '@/extensions/ExtensionSlot';
import { showActionErrorNotification, showActionNotification } from '@/lib/actionNotifications';
import { terminalJob, useAutarkOsJobQuery } from '@/repositories/jobRepository';
import {
  useActivateProMutation,
  useContinueProActivationMutation,
  useInstallOrUpdateProModuleMutation,
  useProStatusRepository,
  useRefreshProEntitlementMutation,
} from '@/repositories/proRepository';

function ProPage() {
  const statusQuery = useProStatusRepository();
  const activate = useActivateProMutation();
  const continueActivation = useContinueProActivationMutation();
  const refresh = useRefreshProEntitlementMutation();
  const install = useInstallOrUpdateProModuleMutation();
  const status = statusQuery.data ?? null;
  const moduleJob = useAutarkOsJobQuery(status?.module?.jobId ?? null);
  const [activationCode, setActivationCode] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const busy = activate.isPending
    || continueActivation.isPending
    || refresh.isPending
    || install.isPending
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

  function handleError(error: unknown, title: string) {
    const message = apiErrorMessage(error, `${title}.`);
    setActionError(message);
    showActionErrorNotification(error, title);
  }

  if (statusQuery.isLoading && !status) return <LoadingState />;
  if (!status) return <UnavailableState message={apiErrorMessage(statusQuery.error, 'The local extension service did not return a status.')} onRetry={() => void statusQuery.refetch()} />;

  const hasEntitlement = !['NOT_ACTIVATED', 'ACTIVATING']
    .includes(status.entitlement.state);
  const canInstall = status.entitlement.localUseAllowed
    && status.entitlement.updatesAllowed;
  const extensionActive = Boolean(
    status.entitlement.localUseAllowed
    && status.module.activeDigest
    && status.module.health === 'healthy',
  );

  return (
    <PageShell>
      <ProjectPanel className="overflow-hidden p-0">
        <div className="bg-app-hero-default p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-200/80">
                Signed private extension
              </p>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-white md:text-5xl">
                Autark Pro
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-sky-100/75 sm:text-base">
                Community Edition verifies the license and private release. Pro analysis and presentation run from the separately installed extension.
              </p>
              <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3" aria-label="Autark Pro lifecycle status">
                <LifecycleValue
                  label="License"
                  value={status.entitlement.localUseAllowed
                    ? 'Local use available'
                    : formatLifecycleToken(status.entitlement.state)}
                />
                <LifecycleValue
                  label="Updates through"
                  value={formatLifecycleDate(status.entitlement.updatesThrough)}
                />
                <LifecycleValue
                  label="Private extension"
                  value={extensionActive
                    ? status.module.componentVersion ?? 'Installed'
                    : formatLifecycleToken(status.module.state)}
                />
              </dl>
              <div className="mt-6 flex flex-wrap gap-3">
                {status.activation.activationId && (
                  <ProjectPrimaryButton disabled={busy} onClick={resumeActivation} type="button">
                    {busy ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                    Continue activation
                  </ProjectPrimaryButton>
                )}
                {canInstall && !extensionActive && (
                  <ProjectPrimaryButton disabled={busy} onClick={installExtension} type="button">
                    {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
                    Install private extension
                  </ProjectPrimaryButton>
                )}
                {hasEntitlement && (
                  <ProjectPrimaryButton disabled={busy} onClick={refreshLicense} type="button">
                    <RefreshCw className={`size-4 ${refresh.isPending ? 'animate-spin' : ''}`} />
                    Check license
                  </ProjectPrimaryButton>
                )}
              </div>
            </div>
            <span className="grid size-14 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-100">
              <ShieldCheck className="size-7" />
            </span>
          </div>
        </div>
      </ProjectPanel>

      {!hasEntitlement && !status.activation.activationId && (
        <ProjectPanel>
          <h2 className="text-lg font-semibold text-white">Activate this server</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            The one-time code is sent directly to the control plane and is not stored in the browser.
          </p>
          <form className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" onSubmit={submitActivation}>
            <label className="grid gap-1.5 text-sm font-medium text-white" htmlFor="pro-activation-code">
              Device activation code
              <Input
                autoCapitalize="characters"
                autoComplete="off"
                disabled={busy}
                id="pro-activation-code"
                maxLength={128}
                onChange={(event) => {
                  setActivationCode(event.target.value);
                  setActionError(null);
                }}
                placeholder="AUTARK-PRO-XXXX-XXXX"
                spellCheck={false}
                value={activationCode}
              />
            </label>
            <ProjectPrimaryButton disabled={busy || activationCode.trim().length < 8} type="submit">
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              Verify this server
            </ProjectPrimaryButton>
          </form>
        </ProjectPanel>
      )}

      {actionError && (
        <ProjectPanel className="border-red-400/35 bg-red-500/10 text-sm text-red-100" role="alert">
          {actionError}
        </ProjectPanel>
      )}

      {moduleJob.data && <JobProgress job={moduleJob.data} subjectLabel="Private extension" />}

      {extensionActive && (
        <ExtensionSlot
          extensionId="autark-pro"
          showErrors
          surface="pro.dashboard"
        />
      )}
    </PageShell>
  );
}

function LifecycleValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-cyan-200/15 bg-slate-950/20 px-3 py-2">
      <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-cyan-100/60">{label}</dt>
      <dd className="mt-1 font-semibold text-white">{value}</dd>
    </div>
  );
}

function formatLifecycleToken(value: string) {
  return value.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
}

function formatLifecycleDate(value: string | null) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function LoadingState() {
  return (
    <PageShell>
      <ProjectPanel aria-busy="true" className="grid min-h-80 place-items-center">
        <div className="flex items-center gap-3 text-sm text-slate-300" role="status">
          <LoaderCircle className="size-5 animate-spin text-cyan-200" />
          Loading extension status
        </div>
      </ProjectPanel>
    </PageShell>
  );
}

function UnavailableState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <PageShell>
      <ProjectPanel>
        <h1 className="text-2xl font-black text-white">Pro status could not be loaded</h1>
        <p className="mt-2 text-sm text-slate-400">{message} Community Edition remains available.</p>
        <ProjectPrimaryButton className="mt-5" onClick={onRetry} type="button">
          <RefreshCw className="size-4" />
          Try again
        </ProjectPrimaryButton>
      </ProjectPanel>
    </PageShell>
  );
}

function notify(title: string, message: string) {
  showActionNotification({ message, ok: true, severity: 'success', title }, title);
}

export default ProPage;
