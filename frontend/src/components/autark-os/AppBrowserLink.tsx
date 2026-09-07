import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { DisabledAction } from './DisabledAction';
import { appBrowserAccessReason } from '@/lib/appBrowserAccess';

/** Shared Open behavior: a remote browser must never navigate to its own localhost. */
export const AppBrowserLink = forwardRef<HTMLAnchorElement, ComponentPropsWithoutRef<'a'>>(function AppBrowserLink({ href, className, children, ...props }, ref) {
  const reason = appBrowserAccessReason(href);
  if (reason) {
    return (
      <DisabledAction className={className} disabled reason={reason}>
        <a {...props} ref={ref} aria-disabled="true" tabIndex={-1}>{children}</a>
      </DisabledAction>
    );
  }
  return <a {...props} ref={ref} className={className} href={href}>{children}</a>;
});
