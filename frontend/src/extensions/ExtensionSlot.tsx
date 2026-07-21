import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { appRoutes } from '@/appRouteManifest';
import { cn } from '@/lib/utils';
import { discoverExtension } from './extensionLoader';

type ExtensionSlotProps = {
  className?: string;
  extensionId: string;
  showErrors?: boolean;
  surface: string;
};

const routePaths: Record<string, string> = {
  access: appRoutes.access,
  activity: appRoutes.activity,
  apps: appRoutes.apps,
  backups: appRoutes.backups,
  diagnostics: appRoutes.diagnostics,
  discover: appRoutes.discover,
  home: appRoutes.home,
  pro: appRoutes.pro,
  settings: appRoutes.settings,
  storage: appRoutes.storage,
};

export function ExtensionSlot({
  className,
  extensionId,
  showErrors = false,
  surface,
}: ExtensionSlotProps) {
  const navigate = useNavigate();
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'mounted' | 'absent' | 'error'>('loading');

  useEffect(() => {
    let disposed = false;
    let unmount: void | (() => void);
    setState('loading');

    void discoverExtension(extensionId, surface)
      .then(async (extension) => {
        if (disposed || !hostRef.current) return;
        if (!extension) {
          setState('absent');
          return;
        }
        unmount = await extension.module.mount({
          apiBase: extension.apiBase,
          element: hostRef.current,
          navigate: (routeId) => {
            const path = routePaths[routeId];
            if (path) navigate(path);
          },
          surface,
        });
        if (disposed) {
          unmount?.();
          return;
        }
        setState('mounted');
      })
      .catch(() => {
        if (!disposed) setState('error');
      });

    return () => {
      disposed = true;
      unmount?.();
    };
  }, [extensionId, navigate, surface]);

  if (state === 'absent' || (state === 'error' && !showErrors)) return null;

  return (
    <section
      aria-label={`${extensionId} extension`}
      className={cn(state === 'loading' && 'min-h-14', className)}
      data-extension-id={extensionId}
      data-extension-state={state}
      data-extension-surface={surface}
    >
      {state === 'error' && (
        <div className="rounded-xl border border-amber-300/30 bg-amber-400/10 p-4 text-sm text-amber-100">
          The installed extension could not be loaded. Its private service may still be starting.
        </div>
      )}
      <div hidden={state === 'error'} ref={hostRef} />
    </section>
  );
}
