import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  readExtensionNavigationState,
  type ExtensionActionId,
  type ExtensionRouteId,
} from './extensionNavigation';

type ExtensionActionTargetProps = {
  actionId: ExtensionActionId;
  children?: ReactNode;
  className?: string;
  routeId: ExtensionRouteId;
};

/**
 * Consumes one trusted CE navigation handoff after the target screen mounts.
 * Route/action values are revalidated here so browser history cannot turn this
 * into an arbitrary focus or routing primitive.
 */
export function ExtensionActionTarget({
  actionId,
  children,
  className,
  routeId,
}: ExtensionActionTargetProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const targetRef = useRef<HTMLDivElement>(null);
  const consumedKeyRef = useRef('');
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    const state = readExtensionNavigationState(location.state);
    if (!state || state.routeId !== routeId || state.actionId !== actionId) return;
    const key = `${location.key}:${state.extensionId}:${state.routeId}:${state.actionId}`;
    if (consumedKeyRef.current === key || !targetRef.current) return;

    consumedKeyRef.current = key;
    setAnnouncement('Autark Pro opened this Autark-OS review.');
    targetRef.current.focus({ preventScroll: true });
    targetRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    navigate({
      hash: location.hash,
      pathname: location.pathname,
      search: location.search,
    }, {
      replace: true,
      state: null,
    });
  }, [actionId, location.hash, location.key, location.pathname, location.search, location.state, navigate, routeId]);

  return (
    <div className={className} data-extension-action={`${routeId}:${actionId}`} ref={targetRef} tabIndex={-1}>
      {announcement && <p aria-live="polite" className="sr-only">{announcement}</p>}
      {children}
    </div>
  );
}
