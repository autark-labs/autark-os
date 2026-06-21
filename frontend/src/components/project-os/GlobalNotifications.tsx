import { useEffect, useState } from 'react';
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { subscribeToNotifications, type ProjectOsNotification } from '@/lib/notifications';

type StoredNotification = Required<Pick<ProjectOsNotification, 'id'>> & ProjectOsNotification;

export function GlobalNotifications() {
  const [notifications, setNotifications] = useState<StoredNotification[]>([]);

  useEffect(() => subscribeToNotifications((notification) => {
    const stored = { ...notification, id: notification.id || `${Date.now()}-${Math.random()}` };
    setNotifications((current) => [stored, ...current].slice(0, 4));
    if (!notification.sticky && notification.severity !== 'warning' && notification.severity !== 'error') {
      window.setTimeout(() => {
        setNotifications((current) => current.filter((item) => item.id !== stored.id));
      }, 4500);
    }
  }), []);

  if (!notifications.length) {
    return null;
  }
  return (
    <div className="fixed right-4 top-4 z-50 grid w-[min(420px,calc(100vw-2rem))] gap-2">
      {notifications.map((notification) => {
        const Icon = iconFor(notification.severity);
        return (
          <div className={cn('rounded-lg border p-3 text-sm shadow-po-lg backdrop-blur-xl', toneFor(notification.severity))} key={notification.id}>
            <div className="flex items-start gap-3">
              <Icon className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="m-0 font-bold">{notification.title}</p>
                {notification.message && <p className="m-0 mt-1 leading-5 opacity-85">{notification.message}</p>}
              </div>
              <Button aria-label="Dismiss notification" className="size-7 shrink-0" onClick={() => setNotifications((current) => current.filter((item) => item.id !== notification.id))} size="icon" type="button" variant="ghost">
                <X className="size-3.5" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function iconFor(severity: ProjectOsNotification['severity']) {
  if (severity === 'success') return CheckCircle2;
  if (severity === 'warning') return TriangleAlert;
  if (severity === 'error') return XCircle;
  return Info;
}

function toneFor(severity: ProjectOsNotification['severity']) {
  if (severity === 'success') return 'border-emerald-300/25 bg-emerald-950/95 text-emerald-100';
  if (severity === 'warning') return 'border-amber-300/25 bg-amber-950/95 text-amber-100';
  if (severity === 'error') return 'border-red-300/25 bg-red-950/95 text-red-100';
  return 'border-sky-300/25 bg-sky-950/95 text-sky-100';
}
