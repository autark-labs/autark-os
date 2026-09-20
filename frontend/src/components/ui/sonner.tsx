import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react';
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

const NotificationHostContext = createContext<{
  mount: HTMLElement;
  register: (host: HTMLElement) => () => void;
} | null>(null);

export function NotificationHostProvider({ children }: { children: ReactNode }) {
  const [mount] = useState(() => {
    const element = document.createElement('div');
    element.popover = 'manual';
    element.className = 'pointer-events-none fixed inset-0 m-0 size-full max-h-none max-w-none border-0 bg-transparent p-0 text-inherit [&::backdrop]:pointer-events-none';
    return element;
  });
  const [hosts, setHosts] = useState<HTMLElement[]>([]);
  const register = useCallback((host: HTMLElement) => {
    setHosts((current) => [...current, host]);
    return () => setHosts((current) => current.filter((item) => item !== host));
  }, []);
  useLayoutEffect(() => {
    // Move the same portal target: remounting Sonner would lose existing popups.
    (hosts.at(-1) ?? document.body).append(mount);
    // The browser top layer escapes modal transforms/clipping without escaping its focus scope.
    mount.showPopover();
    return () => mount.remove();
  }, [hosts, mount]);
  const value = useMemo(() => ({ mount, register }), [mount, register]);
  return <NotificationHostContext.Provider value={value}>{children}</NotificationHostContext.Provider>;
}

export function NotificationModalHost() {
  const register = useContext(NotificationHostContext)?.register;
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) return register?.(ref.current);
  }, [register]);
  return <div ref={ref} className="contents" />;
}

const Toaster = ({ ...props }: ToasterProps) => {
  const host = useContext(NotificationHostContext);
  if (!host) throw new Error('Toaster requires NotificationHostProvider');
  return createPortal(
  <Sonner
    className="toaster group !pointer-events-auto !w-[calc(100%-2rem)] !max-w-sm"
    offset={16}
    mobileOffset={16}
    icons={{
      success: <CircleCheckIcon className="size-4" />,
      info: <InfoIcon className="size-4" />,
      warning: <TriangleAlertIcon className="size-4" />,
      error: <OctagonXIcon className="size-4" />,
      loading: <Loader2Icon className="size-4 animate-spin" />,
    }}
    style={{
      '--normal-bg': 'var(--popover)',
      '--normal-text': 'var(--popover-foreground)',
      '--normal-border': 'var(--border)',
      '--border-radius': 'var(--radius)',
    } as CSSProperties}
    theme="dark"
    toastOptions={{
      classNames: {
        toast: '!w-full !gap-2 !p-3 !text-xs',
        content: 'min-w-0 flex-1',
        title: 'line-clamp-2 !font-medium',
        description: 'line-clamp-2 !text-xs !text-muted-foreground',
        actionButton: '!m-0 !shrink-0 !bg-secondary !text-secondary-foreground',
      },
    }}
    {...props}
  />, host.mount);
};

export { Toaster };
