export type ProjectOsNotification = {
  id?: string;
  severity: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message?: string;
  sticky?: boolean;
};

const notificationTarget = new EventTarget();

export function notify(notification: ProjectOsNotification) {
  notificationTarget.dispatchEvent(new CustomEvent('project-os-notification', { detail: notification }));
}

export function subscribeToNotifications(listener: (notification: ProjectOsNotification) => void) {
  const handler = (event: Event) => listener((event as CustomEvent<ProjectOsNotification>).detail);
  notificationTarget.addEventListener('project-os-notification', handler);
  return () => notificationTarget.removeEventListener('project-os-notification', handler);
}
