import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { AdminSecurityAPIClient } from '@/api/AdminSecurityAPIClient';
import { Button } from '@/components/ui/button';
import { useAdminSessionControlsEnabled } from '@/contexts/AdminSessionContext';
import { showActionNotification } from '@/lib/actionNotifications';
import { notifyAdminLogout } from '@/lib/adminSecuritySession';
import { cn } from '@/lib/utils';

type AdminSessionControlProps = {
  className?: string;
  compact?: boolean;
};

export function AdminSessionControl({ className, compact = false }: AdminSessionControlProps) {
  const enabled = useAdminSessionControlsEnabled();
  const [busy, setBusy] = useState(false);

  if (!enabled) {
    return null;
  }

  async function logout() {
    setBusy(true);
    try {
      try {
        await AdminSecurityAPIClient.logout();
      } catch {
        // The response may have been lost after the server revoked the cookie.
        // Only an authoritative denial can reconcile that outcome as signed out.
        if (await AdminSecurityAPIClient.session()) throw new Error('Session is still active.');
      }
      notifyAdminLogout();
      showActionNotification({ ok: true, severity: 'success', title: 'Logged out of Autark-OS', persist: false });
    } catch {
      showActionNotification({ ok: false, severity: 'error', title: 'Log out was not confirmed', message: 'You may still be signed in. Check the connection and select Log out again.', persist: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      aria-label={busy ? 'Logging out of Autark-OS' : 'Log out of Autark-OS'}
      className={cn('border-sky-400/30 bg-slate-900 text-sky-50 hover:bg-slate-800 hover:text-white', className)}
      disabled={busy}
      onClick={() => void logout()}
      size="sm"
      type="button"
      variant="outline"
    >
      <LogOut aria-hidden="true" className="size-4" />
      {!compact && (busy ? 'Logging out' : 'Log out')}
    </Button>
  );
}
