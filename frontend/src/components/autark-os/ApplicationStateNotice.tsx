import { Button } from '@/components/ui/button';
import { ContextChip } from '@/components/autark-os/ContextChip';
import { LocalizedDateTime } from '@/components/autark-os/LocalizedDateTime';
import { useApplicationStateRepository } from '@/repositories/applicationStateRepository';

export function ApplicationStateNotice({ className }: { className?: string }) {
  const applicationState = useApplicationStateRepository();
  const { phase, lastSuccessfulUpdate } = applicationState.freshness;
  const unavailable = phase === 'unavailable';
  const stale = phase === 'stale';
  const busy = applicationState.isFetching;
  const label = unavailable ? 'App information unavailable' : stale ? 'App refresh paused' : phase === 'checking' ? 'Checking apps' : 'App information';
  return (
    <ContextChip busy={busy} className={className} label={label} title="Apps / Current status" tone={unavailable ? 'danger' : stale ? 'warning' : 'muted'}>
      <p>{unavailable ? 'Current app information is unavailable.' : stale ? 'App information may be out of date. The last confirmed information remains visible.' : busy ? 'Checking app information. Existing information stays visible.' : 'App information is up to date.'}</p>
      {lastSuccessfulUpdate && <p className="text-xs text-muted-foreground">Last confirmed <LocalizedDateTime model={{ value: lastSuccessfulUpdate.toISOString() }} /></p>}
      <Button disabled={busy} onClick={() => void applicationState.refresh().catch(() => {})} size="sm" type="button">{busy ? 'Checking apps…' : 'Refresh app information'}</Button>
    </ContextChip>
  );
}
