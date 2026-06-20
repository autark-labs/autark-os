import type { BackupPolicy } from '@/types/app';

export type AppAction = 'start' | 'stop' | 'restart' | 'repair';

export type StorageRow = {
  key: string;
  value: string;
};

export type EditableSettings = {
  accessUrl: string;
  privateAccessUrl: string;
  tailscaleEnabled: boolean;
  autoRepairEnabled: boolean;
  backup: BackupPolicy;
};
