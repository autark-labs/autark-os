import { toast } from 'sonner';
import type { AutarkOsJob } from '@/types/jobs';
import { actionNotificationFromError, actionNotificationFromJob, actionNotificationFromResult, notificationToastMethod } from './actionNotifications.logic';
import { setAutarkOsJobCache, terminalJob } from '@/repositories/jobRepository';
import { queryClient } from '@/repositories/queryClient';

export type ActionNotificationResult = {
  persist?: boolean;
  ok?: boolean;
  severity?: string | null;
  title?: string | null;
  status?: string | null;
  message?: string | null;
  summary?: string | null;
};

export const ACTION_NOTIFICATION_EVENT = 'autark-os:action-notification';
export const OPEN_ACTIVITY_EVENT = 'autark-os:open-activity';
const resultToastId = 'autark-os-action-result';

export type ActionNotification = {
  persist?: boolean;
  severity: string;
  title: string;
  message?: string;
  sticky: boolean;
};
export type NotificationReceipt = ActionNotification & { id: string; occurredAt: string; jobId?: string };

export function showActionNotification(result: ActionNotificationResult, fallbackTitle = 'Action finished') {
  if ('jobId' in result && typeof result.jobId === 'string') return showJobNotification(result as AutarkOsJob);
  return showNotification({ ...actionNotificationFromResult(result, fallbackTitle), persist: result.persist });
}

export function showActionErrorNotification(error: unknown, fallbackTitle = 'Action failed') {
  return showNotification(actionNotificationFromError(error, fallbackTitle));
}

export function showJobNotification(job: AutarkOsJob) {
  setAutarkOsJobCache(queryClient, job);
  return showNotification(actionNotificationFromJob(job), job.jobId, !terminalJob(job));
}

export function dismissActionPopup() { toast.dismiss(resultToastId); }

function showNotification(notification: ActionNotification, jobId?: string, activeJob = false) {
  const method = notificationToastMethod(notification.severity);
  toast[method](notification.title, {
    id: resultToastId,
    description: notification.message || undefined,
    duration: notification.sticky ? Infinity : undefined,
    action: notification.persist === false ? undefined : {
      label: 'Details',
      onClick: (event) => {
        // Finish Sonner's focus restoration before Radix opens and takes focus.
        event.currentTarget.blur();
        window.dispatchEvent(new CustomEvent(OPEN_ACTIVITY_EVENT, { detail: { tab: activeJob ? 'now' : 'history' } }));
      },
    },
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ACTION_NOTIFICATION_EVENT, {
      detail: {
        // getRandomValues also works on plain HTTP home-network connections.
        id: Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join(''),
        occurredAt: new Date().toISOString(),
        jobId,
        ...notification,
        severity: method,
      },
    }));
  }
  return notification;
}
