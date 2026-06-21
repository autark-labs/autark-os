import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ExternalLink, Eye, EyeOff, Link2, RefreshCw, RotateCcw, Trash2, Wrench } from 'lucide-react';
import { ExternalServiceAPIClient } from '@/api/ExternalServiceAPIClient';
import { HostInventoryAPIClient } from '@/api/HostInventoryAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { PageErrorState, PageLoadingState } from '@/components/project-os/PageState';
import { PageSection, PageShell, SoftCard, StatusPill } from '@/components/project-os/ProjectOSComponents';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { HostInventoryResource, HostResourceCleanupPlan, HostResourceDataDeletionPlan, HostResourceRecoveryPlan } from '@/types/host';
import { toast } from 'sonner';

type ActionDialogState =
  | { type: 'cleanup'; resource: HostInventoryResource; plan: HostResourceCleanupPlan; confirmation: string }
  | { type: 'delete-data'; resource: HostInventoryResource; plan: HostResourceDataDeletionPlan; confirmation: string }
  | { type: 'recover'; resource: HostInventoryResource; plan: HostResourceRecoveryPlan; confirmation: string }
  | null;

function ResolveExistingAppsPage() {
  const [searchParams] = useSearchParams();
  const requestedResourceId = searchParams.get('resource');
  const fixtureMode = searchParams.get('fixture') === '1';
  const [resources, setResources] = useState<HostInventoryResource[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(requestedResourceId);
  const [showIgnored, setShowIgnored] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<ActionDialogState>(null);
  const [linkedName, setLinkedName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResources(fixtureMode ? await HostInventoryAPIClient.fixture() : await HostInventoryAPIClient.list(true));
    } catch (loadError) {
      setError(apiErrorMessage(loadError, 'Existing apps could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [fixtureMode]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleResources = useMemo(() => resources
    .filter((resource) => resource.ownershipState !== 'owned_managed')
    .filter((resource) => showIgnored || !resource.ignored), [resources, showIgnored]);

  useEffect(() => {
    if (!visibleResources.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !visibleResources.some((resource) => resource.id === selectedId)) {
      setSelectedId(visibleResources[0].id);
    }
  }, [selectedId, visibleResources]);

  const selectedResource = visibleResources.find((resource) => resource.id === selectedId) ?? null;

  async function toggleIgnore(resource: HostInventoryResource) {
    if (fixtureMode) {
      setResources((current) => current.map((item) => item.id === resource.id ? { ...item, ignored: !item.ignored } : item));
      showToast('info', resource.ignored ? 'Fixture resource restored' : 'Fixture resource ignored');
      return;
    }
    setBusyId(resource.id);
    try {
      const result = resource.ignored ? await HostInventoryAPIClient.unignore(resource.id) : await HostInventoryAPIClient.ignore(resource.id);
      showToast(result.severity, result.title, result.message);
      await load();
    } catch (ignoreError) {
      showToast('error', 'Existing app action failed', apiErrorMessage(ignoreError), true);
    } finally {
      setBusyId(null);
    }
  }

  async function openAction(resource: HostInventoryResource, type: 'cleanup' | 'delete-data' | 'recover') {
    if (fixtureMode) {
      showToast('info', 'Fixture mode', 'Plans are not available for fixture resources.');
      return;
    }
    setBusyId(resource.id);
    try {
      if (type === 'cleanup') {
        setActionDialog({ type, resource, plan: await HostInventoryAPIClient.cleanupPlan(resource.id), confirmation: '' });
      } else if (type === 'delete-data') {
        setActionDialog({ type, resource, plan: await HostInventoryAPIClient.dataDeletionPlan(resource.id), confirmation: '' });
      } else {
        setActionDialog({ type, resource, plan: await HostInventoryAPIClient.recoveryPlan(resource.id), confirmation: '' });
      }
    } catch (planError) {
      showToast('error', 'Action plan could not load', apiErrorMessage(planError), true);
    } finally {
      setBusyId(null);
    }
  }

  async function runDialogAction() {
    if (!actionDialog) return;
    setBusyId(actionDialog.resource.id);
    try {
      const result = actionDialog.type === 'cleanup'
        ? await HostInventoryAPIClient.cleanup(actionDialog.resource.id, actionDialog.confirmation)
        : actionDialog.type === 'delete-data'
          ? await HostInventoryAPIClient.deleteData(actionDialog.resource.id, actionDialog.confirmation)
          : await HostInventoryAPIClient.recover(actionDialog.resource.id, actionDialog.confirmation);
      showToast(result.severity, result.title, result.message, !result.ok);
      if (result.ok) {
        setActionDialog(null);
        await load();
      }
    } catch (actionError) {
      showToast('error', 'Existing app action failed', apiErrorMessage(actionError), true);
    } finally {
      setBusyId(null);
    }
  }

  async function addLinkedService(resource: HostInventoryResource) {
    if (fixtureMode) {
      showToast('info', 'Fixture mode', 'Linked services are not saved in fixture mode.');
      return;
    }
    const url = resource.accessUrls[0];
    if (!url) {
      showToast('warning', 'No URL found', 'Project OS needs a reachable URL before it can add a linked service.');
      return;
    }
    setBusyId(resource.id);
    try {
      const service = await ExternalServiceAPIClient.add({
        name: linkedName.trim() || resource.displayName,
        url,
        category: 'External',
        accessScope: 'LAN',
        healthCheckEnabled: true,
      });
      showToast('success', 'Linked service added', `${service.name} will appear as a linked external service.`);
      setLinkedName('');
    } catch (linkError) {
      showToast('error', 'Linked service could not be added', apiErrorMessage(linkError), true);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PageShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-3xl font-bold text-po-text">Resolve Existing Apps</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-po-text-muted">
            Review apps and Docker resources that already exist on this server before Project OS installs duplicates.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setShowIgnored((current) => !current)} type="button" variant="outline">
            {showIgnored ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {showIgnored ? 'Hide ignored' : 'Show ignored'}
          </Button>
          <Button onClick={load} type="button" variant="outline">
            <RefreshCw className="size-4" />
            Refresh
          </Button>
          <Button asChild>
            <Link to="/apps">My Apps</Link>
          </Button>
        </div>
      </div>

      {fixtureMode && (
        <SoftCard className="border-sky-300/25 bg-sky-500/10 text-sky-100">
          Dev fixture mode is active. Actions update this page only and do not touch Docker.
        </SoftCard>
      )}

      {error && <PageErrorState message={error} onRetry={load} title="Existing apps could not load" />}

      {loading ? (
        <PageLoadingState label="Loading existing apps" sublabel="Checking Docker and Project OS ownership labels." />
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.2fr)]">
          <PageSection
            description="Select a resource to review safe actions."
            title={`${visibleResources.length} found resource${visibleResources.length === 1 ? '' : 's'}`}
          >
            {visibleResources.length ? (
              <div className="grid gap-3">
                {visibleResources.map((resource) => (
                  <button
                    className={cn(
                      'rounded-lg text-left outline-none ring-offset-2 ring-offset-po-background transition focus-visible:ring-2 focus-visible:ring-po-brand',
                      selectedId === resource.id && 'ring-2 ring-po-brand',
                    )}
                    key={resource.id}
                    onClick={() => setSelectedId(resource.id)}
                    type="button"
                  >
                    <SoftCard className={cn(resource.ignored && 'opacity-65')} interactive>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="m-0 text-lg font-bold text-po-text">{resource.displayName}</h2>
                        <StatusPill tone={stateTone(resource)}>{stateLabel(resource)}</StatusPill>
                        {resource.ignored && <StatusPill tone="neutral">Ignored</StatusPill>}
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-po-text-muted">{resource.summary}</p>
                      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                        <Detail label="Runtime" value={resource.runtimeState} />
                        <Detail label="Container" value={resource.details.containerName || resource.id} />
                      </dl>
                    </SoftCard>
                  </button>
                ))}
              </div>
            ) : (
              <SoftCard>
                <p className="m-0 font-bold text-po-text">No unresolved existing apps</p>
                <p className="m-0 mt-1 text-sm text-po-text-muted">Project OS is not prompting for any non-managed resources right now.</p>
              </SoftCard>
            )}
          </PageSection>

          <ResourceDetails
            busy={busyId === selectedResource?.id}
            linkedName={linkedName}
            onAddLinkedService={addLinkedService}
            onLinkedNameChange={setLinkedName}
            onOpenAction={openAction}
            onToggleIgnore={toggleIgnore}
            resource={selectedResource}
          />
        </div>
      )}

      <ActionDialog
        busy={Boolean(actionDialog && busyId === actionDialog.resource.id)}
        state={actionDialog}
        onChange={(confirmation) => setActionDialog((current) => current ? { ...current, confirmation } as ActionDialogState : null)}
        onClose={() => setActionDialog(null)}
        onRun={runDialogAction}
      />
    </PageShell>
  );
}

function ResourceDetails({
  busy,
  linkedName,
  onAddLinkedService,
  onLinkedNameChange,
  onOpenAction,
  onToggleIgnore,
  resource,
}: {
  busy: boolean;
  linkedName: string;
  onAddLinkedService: (resource: HostInventoryResource) => void;
  onLinkedNameChange: (name: string) => void;
  onOpenAction: (resource: HostInventoryResource, type: 'cleanup' | 'delete-data' | 'recover') => void;
  onToggleIgnore: (resource: HostInventoryResource) => void;
  resource: HostInventoryResource | null;
}) {
  if (!resource) {
    return (
      <SoftCard>
        <p className="m-0 font-bold text-po-text">No resource selected</p>
        <p className="mt-1 text-sm text-po-text-muted">Select a found resource to review actions.</p>
      </SoftCard>
    );
  }

  const hasUrl = Boolean(resource.accessUrls[0]);
  const hasKnownData = Boolean(resource.details.dataPaths);

  return (
    <PageSection title="Resource Details">
      <SoftCard>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="m-0 text-2xl font-bold text-po-text">{resource.displayName}</h2>
              <StatusPill tone={stateTone(resource)}>{stateLabel(resource)}</StatusPill>
              {resource.ignored && <StatusPill tone="neutral">Ignored</StatusPill>}
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-po-text-muted">{resource.summary}</p>
          </div>
          {hasUrl && (
            <Button asChild variant="outline">
              <a href={resource.accessUrls[0]} rel="noreferrer" target="_blank">
                <ExternalLink className="size-4" />
                Open
              </a>
            </Button>
          )}
        </div>

        <dl className="mt-5 grid gap-3 text-sm md:grid-cols-2">
          <Detail label="Source" value={resource.source} />
          <Detail label="Runtime" value={resource.runtimeState} />
          <Detail label="Container" value={resource.details.containerName || resource.id} />
          <Detail label="Image" value={resource.details.image || 'Unknown'} />
          <Detail label="Owner instance" value={resource.ownerInstanceId || 'None'} />
          <Detail label="Current instance" value={resource.currentInstanceId || 'Unknown'} />
        </dl>

        <div className="mt-5 grid gap-3 rounded-lg border border-po-border bg-po-surface-inset p-4">
          <h3 className="m-0 text-base font-bold text-po-text">Available Actions</h3>
          <div className="flex flex-wrap gap-2">
            {resource.ownershipState === 'legacy_project_os' && (
              <Button disabled={busy} onClick={() => onOpenAction(resource, 'recover')} type="button">
                <RotateCcw className="size-4" />
                Recover into Project OS
              </Button>
            )}
            {resource.ownershipState === 'foreign_project_os' && (
              <Button disabled={busy} onClick={() => onOpenAction(resource, 'cleanup')} type="button" variant="outline">
                <Wrench className="size-4" />
                Plan container cleanup
              </Button>
            )}
            {resource.ownershipState === 'external_docker' && hasUrl && (
              <div className="flex w-full flex-col gap-2 sm:flex-row">
                <Input aria-label="Linked service name" onChange={(event) => onLinkedNameChange(event.target.value)} placeholder={resource.displayName} value={linkedName} />
                <Button disabled={busy} onClick={() => onAddLinkedService(resource)} type="button" variant="outline">
                  <Link2 className="size-4" />
                  Add linked service
                </Button>
              </div>
            )}
            <Button disabled={busy} onClick={() => onToggleIgnore(resource)} type="button" variant="outline">
              {resource.ignored ? 'Restore prompt' : 'Ignore prompt'}
            </Button>
          </div>
        </div>

        <details className="mt-4 rounded-lg border border-red-300/20 bg-red-500/5 p-4">
          <summary className="cursor-pointer text-sm font-bold text-red-100">Advanced data deletion</summary>
          <p className="mt-2 text-sm leading-6 text-red-100/75">
            Data deletion is separate from cleanup and requires an exact typed confirmation. Use this only when you intentionally want old app files removed.
          </p>
          <Button className="mt-3" disabled={busy || !hasKnownData} onClick={() => onOpenAction(resource, 'delete-data')} type="button" variant="destructive">
            <Trash2 className="size-4" />
            Plan data deletion
          </Button>
          {!hasKnownData && <p className="mt-2 text-xs text-red-100/60">No Project OS data-path labels were found for this resource.</p>}
        </details>

        <details className="mt-4 rounded-lg border border-po-border bg-po-surface-inset p-4">
          <summary className="cursor-pointer text-sm font-bold text-po-text">Technical details</summary>
          <dl className="mt-3 grid gap-2 text-sm">
            {Object.entries(resource.details).map(([key, value]) => <Detail key={key} label={key} value={value || 'Unknown'} />)}
          </dl>
        </details>
      </SoftCard>
    </PageSection>
  );
}

function ActionDialog({
  busy,
  onChange,
  onClose,
  onRun,
  state,
}: {
  busy: boolean;
  onChange: (confirmation: string) => void;
  onClose: () => void;
  onRun: () => void;
  state: ActionDialogState;
}) {
  if (!state) return null;
  const confirmationText = state.type === 'cleanup' || state.type === 'delete-data' || state.type === 'recover' ? state.plan.confirmationText : '';
  const blockedReasons = 'blockedReasons' in state.plan ? state.plan.blockedReasons : [];
  const canRun = confirmationText.length > 0 && state.confirmation === confirmationText && blockedReasons.length === 0;

  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-po-border bg-po-surface text-po-text sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{dialogTitle(state)}</DialogTitle>
          <DialogDescription className="text-po-text-muted">{dialogDescription(state)}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <PlanList state={state} />
          {blockedReasons.length > 0 && (
            <div className="rounded-lg border border-amber-300/25 bg-amber-500/10 p-3 text-sm text-amber-100">
              {blockedReasons.map((reason) => <p className="m-0" key={reason}>{reason}</p>)}
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="confirmation-text">Type {confirmationText}</Label>
            <Input id="confirmation-text" onChange={(event) => onChange(event.target.value)} value={state.confirmation} />
          </div>
        </div>

        <DialogFooter className="border-po-border bg-po-surface-inset">
          <Button disabled={busy} onClick={onClose} type="button" variant="outline">Cancel</Button>
          <Button disabled={busy || !canRun} onClick={onRun} type="button" variant={state.type === 'delete-data' ? 'destructive' : 'default'}>
            {busy ? 'Working...' : actionLabel(state)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanList({ state }: { state: NonNullable<ActionDialogState> }) {
  if (state.type === 'cleanup') {
    return (
      <div className="grid gap-3 text-sm">
        <PlanGroup title="Containers to stop" items={state.plan.stopContainers} />
        <PlanGroup title="Containers to remove" items={state.plan.removeContainers} />
        <PlanGroup title="Preserved" items={state.plan.preserveData} />
        <PlanGroup title="Untouched" items={state.plan.untouched} />
      </div>
    );
  }
  if (state.type === 'delete-data') {
    return <PlanGroup title="Data paths to delete" items={state.plan.paths} />;
  }
  return <PlanGroup title="Recovery steps" items={state.plan.steps} />;
}

function PlanGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-po-border bg-po-surface-inset p-3">
      <p className="m-0 text-xs font-bold uppercase tracking-normal text-po-text-muted">{title}</p>
      {items.length ? (
        <ul className="m-0 mt-2 grid gap-1 p-0 text-po-text">
          {items.map((item) => <li className="list-none break-words" key={item}>{item}</li>)}
        </ul>
      ) : (
        <p className="m-0 mt-2 text-po-text-muted">None</p>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold uppercase tracking-normal text-po-text-muted">{label}</dt>
      <dd className="m-0 mt-1 truncate text-po-text" title={value}>{value || 'Unknown'}</dd>
    </div>
  );
}

function dialogTitle(state: NonNullable<ActionDialogState>) {
  if (state.type === 'cleanup') return `Clean up ${state.plan.displayName}`;
  if (state.type === 'delete-data') return `Delete data for ${state.plan.displayName}`;
  return `Recover ${state.plan.displayName}`;
}

function dialogDescription(state: NonNullable<ActionDialogState>) {
  if (state.type === 'cleanup') return state.plan.warning;
  if (state.type === 'delete-data') return state.plan.warning;
  return 'Project OS will add this legacy app to the current installation without deleting data.';
}

function actionLabel(state: NonNullable<ActionDialogState>) {
  if (state.type === 'cleanup') return 'Remove container';
  if (state.type === 'delete-data') return 'Delete data';
  return 'Recover app';
}

function stateLabel(resource: HostInventoryResource) {
  if (resource.ownershipState === 'foreign_project_os') return 'Owned by another Project OS';
  if (resource.ownershipState === 'legacy_project_os') return 'Recoverable';
  if (resource.ownershipState === 'external_docker') return 'Found on server';
  if (resource.ownershipState === 'unknown_conflict') return 'Blocked';
  return resource.managementMode;
}

function stateTone(resource: HostInventoryResource): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  if (resource.ownershipState === 'foreign_project_os' || resource.ownershipState === 'unknown_conflict') return 'danger';
  if (resource.ownershipState === 'legacy_project_os') return 'warning';
  if (resource.ownershipState === 'external_docker') return 'info';
  return 'neutral';
}

function showToast(severity: string, title: string, description?: string, sticky = false) {
  const options = { description, duration: sticky ? Infinity : undefined };
  const normalizedSeverity = notificationSeverity(severity);
  if (normalizedSeverity === 'success') {
    toast.success(title, options);
  } else if (normalizedSeverity === 'warning') {
    toast.warning(title, options);
  } else if (normalizedSeverity === 'error') {
    toast.error(title, options);
  } else {
    toast.info(title, options);
  }
}

function notificationSeverity(severity: string): 'success' | 'info' | 'warning' | 'error' {
  if (severity === 'success' || severity === 'info' || severity === 'warning' || severity === 'error') {
    return severity;
  }
  return 'info';
}

export default ResolveExistingAppsPage;
