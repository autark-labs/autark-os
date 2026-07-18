import type { AppBackupStatus, RestorePoint } from '@/types/backup';

export type BackupDirectoryKey = 'all' | 'full' | `app:${string}`;

type BackupNavigatorSelection = {
  directory: BackupDirectoryKey;
  restorePointId?: number | null;
};

export function parseBackupNavigatorRoute(
  searchParams: URLSearchParams,
  apps: AppBackupStatus[],
  restorePoints: RestorePoint[],
): Required<BackupNavigatorSelection> {
  const requestedAppId = searchParams.get('app');
  const requestedRestorePoint = restorePointForId(restorePoints, searchParams.get('backup'));
  const appExists = Boolean(requestedAppId && apps.some((app) => app.appId === requestedAppId));
  const directory = appExists
    ? appDirectoryKey(requestedAppId!)
    : searchParams.get('scope') === 'full'
      ? 'full'
      : requestedRestorePoint
        ? directoryForRestorePoint(requestedRestorePoint, apps)
        : 'all';
  const restorePointId = requestedRestorePoint && pointMatchesDirectory(requestedRestorePoint, directory)
    ? requestedRestorePoint.id
    : null;

  return { directory, restorePointId };
}

export function backupNavigatorSearchWithSelection(
  searchParams: URLSearchParams,
  { directory, restorePointId = null }: BackupNavigatorSelection,
) {
  const next = new URLSearchParams(searchParams);
  next.delete('app');
  next.delete('backup');
  next.delete('scope');

  if (directory === 'full') {
    next.set('scope', 'full');
  }
  if (directory.startsWith('app:')) {
    next.set('app', directory.slice(4));
  }
  if (restorePointId !== null) {
    next.set('backup', String(restorePointId));
  }

  return next;
}

export function backupNavigatorLink(selection: BackupNavigatorSelection) {
  const search = backupNavigatorSearchWithSelection(new URLSearchParams(), selection).toString();
  return search ? `/backups?${search}` : '/backups';
}

function appDirectoryKey(appId: string): BackupDirectoryKey {
  return `app:${appId}`;
}

function directoryForRestorePoint(point: RestorePoint, apps: AppBackupStatus[]): BackupDirectoryKey {
  if (point.scope === 'full') {
    return 'full';
  }
  return apps.some((app) => app.appId === point.appId) ? appDirectoryKey(point.appId) : 'all';
}

function pointMatchesDirectory(point: RestorePoint, directory: BackupDirectoryKey) {
  if (directory === 'all') return true;
  if (directory === 'full') return point.scope === 'full';
  return point.appId === directory.slice(4);
}

function restorePointForId(restorePoints: RestorePoint[], rawId: string | null) {
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) {
    return null;
  }
  return restorePoints.find((point) => point.id === id) ?? null;
}
