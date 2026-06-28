export type ApplicationSurfaceItem = {
  id: string;
  name: string;
  kind: 'managed' | 'pinned' | 'observed';
  status: 'Ready' | 'Paused' | 'Needs review' | 'Found' | 'Pinned';
  access: 'Open' | 'Private' | 'Local only' | 'No link';
  backup: 'Protected' | 'Needs backup' | 'Not managed';
  nextStep: string;
  description: string;
  href?: string;
};
