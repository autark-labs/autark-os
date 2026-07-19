import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { LocalizedDateTime } from '@/components/autark-os/LocalizedDateTime';
import { ProjectDarkControlButton } from '@/components/primitives/ProjectButtons';
import { Surface } from '@/components/primitives/Surface';
import { cn } from '@/lib/utils';
import { useApplicationStateRepository } from '@/repositories/applicationStateRepository';
import type { ApplicationStateFreshnessPhase } from '@/types/applicationState';

type NoticeContent = {
  description: string;
  showLastUpdate: boolean;
  title: string;
  tone: 'danger' | 'muted' | 'warning';
};

/**
 * The single user-facing treatment for canonical app-state freshness.
 *
 * It stays quiet while the snapshot is current, distinguishes an unavailable
 * first snapshot from stale-but-usable data, and keeps retry behavior shared
 * across every page and focused overlay that renders app-derived information.
 */
export function ApplicationStateNotice({ className }: { className?: string }) {
  const applicationState = useApplicationStateRepository();
  const content = noticeContent(applicationState.freshness.phase);

  if (!content) {
    return null;
  }

  const refreshing = applicationState.isFetching || applicationState.freshness.phase === 'refreshing';
  const canRetry = applicationState.freshness.phase === 'stale' || applicationState.freshness.phase === 'unavailable';

  function refresh() {
    void applicationState.refresh().catch(() => {
      // The shared repository exposes the transport failure on the next render.
    });
  }

  return (
    <Surface
      aria-live={applicationState.freshness.phase === 'checking' || applicationState.freshness.phase === 'refreshing' ? 'polite' : 'assertive'}
      className={cn('shrink-0 p-3', className)}
      role={applicationState.freshness.phase === 'checking' || applicationState.freshness.phase === 'refreshing' ? 'status' : 'alert'}
      tone={content.tone}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-current/20 bg-slate-950/15">
            {applicationState.freshness.phase === 'checking' || applicationState.freshness.phase === 'refreshing'
              ? <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              : <AlertTriangle aria-hidden="true" className="size-4" />}
          </span>
          <div className="min-w-0">
            <p className="font-bold text-current">{content.title}</p>
            <p className="mt-1 text-sm leading-6 text-current/80">
              {content.description}
              {content.showLastUpdate && applicationState.freshness.lastSuccessfulUpdate && (
                <>
                  {' Last confirmed '}
                  <LocalizedDateTime
                    className="font-semibold text-current"
                    model={{ value: applicationState.freshness.lastSuccessfulUpdate.toISOString() }}
                  />
                  .
                </>
              )}
            </p>
          </div>
        </div>

        {canRetry && (
          <DisabledAction disabled={refreshing} reason="Autark-OS is already refreshing app information.">
            <ProjectDarkControlButton
              className="shrink-0 border-current/25 bg-slate-950/30 text-current hover:bg-slate-950/45 hover:text-current"
              disabled={refreshing}
              onClick={refresh}
              size="sm"
              type="button"
            >
              <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
              Refresh app information
            </ProjectDarkControlButton>
          </DisabledAction>
        )}
      </div>
    </Surface>
  );
}

function noticeContent(phase: ApplicationStateFreshnessPhase): NoticeContent | null {
  switch (phase) {
    case 'checking':
      return {
        description: 'Autark-OS is confirming installed, found, and recoverable apps before treating app details as current.',
        showLastUpdate: false,
        title: 'Checking current app information',
        tone: 'muted',
      };
    case 'refreshing':
      return {
        description: 'Autark-OS is refreshing app ownership and runtime details. Existing information remains visible while this finishes.',
        showLastUpdate: true,
        title: 'Refreshing app information',
        tone: 'muted',
      };
    case 'stale':
      return {
        description: 'The latest app-state refresh did not finish successfully. Details below come from the last successful update.',
        showLastUpdate: true,
        title: 'App information may be out of date',
        tone: 'warning',
      };
    case 'unavailable':
      return {
        description: 'Autark-OS could not confirm installed, found, or recoverable apps. App-dependent details may be incomplete.',
        showLastUpdate: false,
        title: 'Current app information is unavailable',
        tone: 'danger',
      };
    case 'current':
      return null;
  }
}
