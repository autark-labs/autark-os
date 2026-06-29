export type ApplicationRuntimeState = 'running' | 'starting' | 'paused' | 'needs_attention' | 'found' | 'shortcut';
export type ApplicationRuntimeAction = 'start' | 'stop' | 'restart';
export type ApplicationSettingsAction = 'auto_repair' | 'private_access';

export type ApplicationNextAction = {
  id: 'create_backup' | 'review_found_service' | 'review_issue' | 'start_app';
  label: string;
  description: string;
};

export type ApplicationSurfaceItem = {
  id: string;
  sourceId?: string;
  name: string;
  kind: 'managed' | 'pinned' | 'observed';
  status: 'Ready' | 'Starting' | 'Paused' | 'Needs review' | 'Found' | 'Pinned';
  runtimeState: ApplicationRuntimeState;
  access: 'Open' | 'Private' | 'Local only' | 'No link';
  backup: 'Protected' | 'Needs backup' | 'Not managed';
  nextAction?: ApplicationNextAction;
  description: string;
  href?: string;
  iconUrl?: string;
  lastEvent?: string;
  links: ApplicationLinksView;
  settings: ApplicationSettingsView;
};

export type ApplicationActionHandlers = {
  onAutoRepairChange: (id: string, enabled: boolean) => void;
  onCreateBackup: (id: string) => void;
  onPrivateAccessChange: (id: string, enabled: boolean) => void;
  onRestart: (id: string) => void;
  onRunNextAction: (id: string) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
};

export type ApplicationSettingsView = {
  autoRepairEnabled: boolean;
  canEdit: boolean;
  containerDetail: string;
  containerStatus: string;
  desiredAccessMode: string;
  privateAccessRequired: boolean;
  privateAccessUrl?: string;
  privateLinkStatus: string;
  tailscaleEnabled: boolean;
};

export type ApplicationLinksView = {
  backendTargetUrl?: string;
  localUrl?: string;
  primaryUrl?: string;
  privateUrl?: string;
};
