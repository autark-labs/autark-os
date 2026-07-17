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
      await AdminSecurityAPIClient.logout();
      showActionNotification({ ok: true, severity: 'success', title: 'Logged out of Autark-OS' });
    } catch {
      showActionNotification({ ok: true, severity: 'info', title: 'Browser session ended' });
    } finally {
      notifyAdminLogout();
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
