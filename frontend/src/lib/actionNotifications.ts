import { toast } from 'sonner';
import type { ProjectOsJob } from '@/types/jobs';
import { actionNotificationFromError, actionNotificationFromJob, actionNotificationFromResult, notificationToastMethod } from './actionNotifications.logic';

export type ActionNotificationResult = {
  ok?: boolean;
  severity?: string | null;
  title?: string | null;
  status?: string | null;
  message?: string | null;
  summary?: string | null;
  nextAction?: unknown;
};

type ActionNotification = {
  severity: string;
  title: string;
  message?: string;
  sticky: boolean;
};

export function showActionNotification(result: ActionNotificationResult, fallbackTitle = 'Action finished') {
  return showNotification(actionNotificationFromResult(result, fallbackTitle) as ActionNotification);
}

export function showActionErrorNotification(error: unknown, fallbackTitle = 'Action failed') {
  return showNotification(actionNotificationFromError(error, fallbackTitle) as ActionNotification);
}

export function showJobNotification(job: ProjectOsJob) {
  return showNotification(actionNotificationFromJob(job) as ActionNotification);
}

function showNotification(notification: ActionNotification) {
  const method = notificationToastMethod(notification.severity) as 'success' | 'info' | 'warning' | 'error';
  toast[method](notification.title, {
    description: notification.message || undefined,
    duration: notification.sticky ? Infinity : undefined,
  });
  return notification;
}
