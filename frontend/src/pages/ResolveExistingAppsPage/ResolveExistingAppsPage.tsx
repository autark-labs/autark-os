import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ExternalLink, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { HostInventoryAPIClient } from '@/api/HostInventoryAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { PageErrorState, PageLoadingState } from '@/components/project-os/PageState';
import { PageSection, PageShell, SoftCard, StatusPill } from '@/components/project-os/ProjectOSComponents';
import { Button } from '@/components/ui/button';
import { notify } from '@/lib/notifications';
import { cn } from '@/lib/utils';
import type { HostInventoryResource } from '@/types/host';

function ResolveExistingAppsPage() {
  const [searchParams] = useSearchParams();
  const fixtureMode = searchParams.get('fixture') === '1';
  const [resources, setResources] = useState<HostInventoryResource[]>([]);
  const [showIgnored, setShowIgnored] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  async function toggleIgnore(resource: HostInventoryResource) {
    if (fixtureMode) {
      setResources((current) => current.map((item) => item.id === resource.id ? { ...item, ignored: !item.ignored } : item));
      notify({ severity: 'info', title: resource.ignored ? 'Fixture resource restored' : 'Fixture resource ignored' });
      return;
    }
    setBusyId(resource.id);
    try {
      const result = resource.ignored ? await HostInventoryAPIClient.unignore(resource.id) : await HostInventoryAPIClient.ignore(resource.id);
      notify({ severity: 'success', title: result.title, message: result.message });
      await load();
    } catch (ignoreError) {
      notify({ severity: 'error', title: 'Existing app action failed', message: apiErrorMessage(ignoreError), sticky: true });
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
            These resources already exist on this server but are not managed by this Project OS installation.
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
        <PageSection
          description="Safe actions only: view details, open known URLs, or ignore prompts for this installation."
          title={`${visibleResources.length} found resource${visibleResources.length === 1 ? '' : 's'}`}
        >
          {visibleResources.length ? (
            <div className="grid gap-3">
              {visibleResources.map((resource) => (
                <SoftCard className={cn(resource.ignored && 'opacity-65')} key={resource.id}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="m-0 text-lg font-bold text-po-text">{resource.displayName}</h2>
                        <StatusPill tone={stateTone(resource)}>{stateLabel(resource)}</StatusPill>
                        {resource.ignored && <StatusPill tone="neutral">Ignored</StatusPill>}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-po-text-muted">{resource.summary}</p>
                      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
                        <Detail label="Source" value={resource.source} />
                        <Detail label="Runtime" value={resource.runtimeState} />
                        <Detail label="Container" value={resource.details.containerName || resource.id} />
                        <Detail label="Image" value={resource.details.image || 'Unknown'} />
                      </dl>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {resource.accessUrls[0] && (
                        <Button asChild size="sm" variant="outline">
                          <a href={resource.accessUrls[0]} rel="noreferrer" target="_blank">
                            <ExternalLink className="size-4" />
                            Open
                          </a>
                        </Button>
                      )}
                      <Button disabled={busyId === resource.id} onClick={() => toggleIgnore(resource)} size="sm" type="button" variant="outline">
                        {resource.ignored ? 'Restore prompt' : 'Ignore'}
                      </Button>
                    </div>
                  </div>
                </SoftCard>
              ))}
            </div>
          ) : (
            <SoftCard>
              <p className="m-0 font-bold text-po-text">No unresolved existing apps</p>
              <p className="m-0 mt-1 text-sm text-po-text-muted">Project OS is not prompting for any non-managed resources right now.</p>
            </SoftCard>
          )}
        </PageSection>
      )}
    </PageShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-normal text-po-text-muted">{label}</dt>
      <dd className="m-0 mt-1 truncate text-po-text">{value || 'Unknown'}</dd>
    </div>
  );
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

export default ResolveExistingAppsPage;
