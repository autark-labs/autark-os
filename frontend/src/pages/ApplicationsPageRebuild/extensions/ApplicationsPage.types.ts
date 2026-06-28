export type ApplicationRuntimeState = 'running' | 'paused' | 'needs_attention' | 'found' | 'shortcut';

export type ApplicationNextAction = {
  id: 'create_backup' | 'review_found_service' | 'start_app';
  label: string;
  description: string;
};

export type ApplicationSurfaceItem = {
  id: string;
  name: string;
  kind: 'managed' | 'pinned' | 'observed';
  status: 'Ready' | 'Paused' | 'Needs review' | 'Found' | 'Pinned';
  runtimeState: ApplicationRuntimeState;
  access: 'Open' | 'Private' | 'Local only' | 'No link';
  backup: 'Protected' | 'Needs backup' | 'Not managed';
  nextAction?: ApplicationNextAction;
  description: string;
  href?: string;
  iconUrl?: string;
  lastEvent?: string;
};

export type ApplicationActionHandlers = {
  onCreateBackup: (id: string) => void;
  onRestart: (id: string) => void;
  onRunNextAction: (id: string) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
};
