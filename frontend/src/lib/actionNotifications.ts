import { toast } from 'sonner';
import type { ProjectOsJob } from '@/types/jobs';
import { actionNotificationFromJob, actionNotificationFromResult, notificationToastMethod } from './actionNotifications.logic';

export type ActionNotificationResult = {
  ok?: boolean;
  severity?: string | null;
  title?: string | null;
  status?: string | null;
  message?: string | null;
  summary?: string | null;
  nextAction?: unknown;
};

export function showActionNotification(result: ActionNotificationResult, fallbackTitle = 'Action finished') {
  const notification = actionNotificationFromResult(result, fallbackTitle) as {
    severity: string;
    title: string;
    message?: string;
    sticky: boolean;
  };
  const method = notificationToastMethod(notification.severity) as 'success' | 'info' | 'warning' | 'error';
  toast[method](notification.title, {
    description: notification.message || undefined,
    duration: notification.sticky ? Infinity : undefined,
  });
  return notification;
}

export function showJobNotification(job: ProjectOsJob) {
  const notification = actionNotificationFromJob(job) as {
    severity: string;
    title: string;
    message?: string;
    sticky: boolean;
  };
  const method = notificationToastMethod(notification.severity) as 'success' | 'info' | 'warning' | 'error';
  toast[method](notification.title, {
    description: notification.message || undefined,
    duration: notification.sticky ? Infinity : undefined,
  });
  return notification;
}
