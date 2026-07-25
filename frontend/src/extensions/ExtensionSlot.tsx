import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  extensionLoadFailureKind,
  type ExtensionLoadFailureKind,
  discoverExtension,
} from './extensionLoader';
import {
  extensionNavigationState,
  recordRejectedExtensionNavigation,
  resolveExtensionNavigation,
} from './extensionNavigation';

type ExtensionSlotProps = {
  className?: string;
  extensionId: string;
  showErrors?: boolean;
  surface: string;
};

type ExtensionSlotState = 'loading' | 'mounted' | 'absent' | ExtensionLoadFailureKind;

const retryDelays = [300, 900, 1800];

export function ExtensionSlot({
  className,
  extensionId,
  showErrors = true,
  surface,
}: ExtensionSlotProps) {
  const navigate = useNavigate();
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ExtensionSlotState>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let disposed = false;
    let unmount: void | (() => void);
    const controller = new AbortController();
    let retryTimer: number | undefined;
    setState('loading');

    void discoverExtension(extensionId, surface, { signal: controller.signal })
      .then(async (extension) => {
        if (disposed || !hostRef.current) return;
        if (!extension) {
          setState('absent');
          return;
        }
        unmount = await extension.module.mount({
          apiBase: extension.apiBase,
          element: hostRef.current,
          navigate: (routeId, actionId) => {
            const target = resolveExtensionNavigation(routeId, actionId);
            if (!target) {
              void recordRejectedExtensionNavigation(extensionId);
              return;
            }
            navigate(target.path, {
              state: extensionNavigationState(extensionId, target),
            });
          },
          surface,
        });
        if (disposed) {
          unmount?.();
          return;
        }
        setState('mounted');
      })
      .catch((error: unknown) => {
        if (disposed || (error instanceof DOMException && error.name === 'AbortError')) return;
        const failure = extensionLoadFailureKind(error);
        setState(failure);
        if (attempt < retryDelays.length) {
          retryTimer = window.setTimeout(() => {
            if (!disposed) setAttempt((current) => current + 1);
          }, retryDelays[attempt]);
        }
      });

    return () => {
      disposed = true;
      controller.abort();
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      unmount?.();
    };
  }, [attempt, extensionId, navigate, surface]);

  if (state === 'absent') return null;
  const retryAvailable = state !== 'loading' && state !== 'mounted' && state !== 'incompatible';
  const showStatus = state !== 'mounted' && state !== 'loading' && (showErrors || state === 'starting');

  return (
    <section
      aria-label={`${extensionId} extension`}
      className={cn(state === 'loading' && 'min-h-14', className)}
      data-extension-id={extensionId}
      data-extension-state={state}
      data-extension-surface={surface}
    >
      {showStatus && (
        <div className="rounded-xl border border-amber-300/30 bg-amber-400/10 p-4 text-sm text-amber-100" role="status">
          <p>{extensionStateMessage(state, attempt)}</p>
          {retryAvailable && (
            <button
              className="mt-3 rounded-lg border border-cyan-200/30 px-3 py-1.5 font-semibold text-cyan-50 transition hover:border-cyan-200/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
              onClick={() => setAttempt((current) => current < retryDelays.length ? current + 1 : 0)}
              type="button"
            >
              Try again
            </button>
          )}
        </div>
      )}
      <div hidden={state !== 'loading' && state !== 'mounted'} ref={hostRef} />
    </section>
  );
}

function extensionStateMessage(state: ExtensionSlotState, attempt: number) {
  if (state === 'loading') return '';
  if (state === 'starting') {
    return attempt < retryDelays.length
      ? 'Private guidance is starting. Autark-OS will try again shortly.'
      : 'Private guidance is still starting. You can try again when it is ready.';
  }
  if (state === 'incompatible') {
    return 'Private guidance needs a compatible update. Autark-OS and your data remain available.';
  }
  if (state === 'unhealthy') {
    return attempt < retryDelays.length
      ? 'Private guidance is temporarily unavailable. Autark-OS will try again shortly.'
      : 'Private guidance is temporarily unavailable. Autark-OS and your data remain available.';
  }
  return 'Private guidance could not be loaded. Autark-OS and your data remain available.';
}
