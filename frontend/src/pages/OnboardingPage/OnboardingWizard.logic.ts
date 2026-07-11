export type BackupPosture = 'routine' | 'external' | 'later';
export type PrivateAccessChoice = 'setup-now' | 'local-only' | 'already-connected';

export type OnboardingStep = {
  id: 'device' | 'readiness' | 'access' | 'backups' | 'apps' | 'review';
  label: string;
};

export type OnboardingDraft = {
  automaticBackups: boolean;
  backupDestination: string;
  backupPosture: BackupPosture;
  deviceName: string;
  privateAccessChoice: PrivateAccessChoice;
  selectedApps: string[];
};

export const onboardingSteps: OnboardingStep[] = [
  { id: 'device', label: 'Device' },
  { id: 'readiness', label: 'Readiness' },
  { id: 'access', label: 'Access' },
  { id: 'backups', label: 'Backups' },
  { id: 'apps', label: 'Apps' },
  { id: 'review', label: 'Review' },
];

export function clampOnboardingStep(step: number | null | undefined): number {
  if (!Number.isFinite(step)) return 0;
  return Math.max(0, Math.min(step ?? 0, onboardingSteps.length - 1));
}

export function completedOnboardingSteps(nextStep: number): string[] {
  const completed = new Set<string>();
  if (nextStep >= 1) completed.add('device');
  if (nextStep >= 2) completed.add('doctor');
  if (nextStep >= 3) completed.add('tailscale');
  if (nextStep >= 4) {
    completed.add('storage');
    completed.add('backups');
  }
  if (nextStep >= 5) completed.add('apps');
  return [...completed];
}

export function validateOnboardingStep(step: number, draft: OnboardingDraft): string | null {
  if (step === 0 && !draft.deviceName.trim()) {
    return 'Give this device a name before continuing.';
  }
  if (step !== 3 || draft.backupPosture !== 'external') {
    return null;
  }
  const destination = draft.backupDestination.trim();
  if (!destination) return 'Choose a backup destination, or pick a different backup option.';
  if (!destination.startsWith('/')) return 'Backup destination must be an absolute path that starts with /.';
  if (destination === '/' || destination === '/tmp') return 'Choose a dedicated backup folder instead of a system or temporary folder.';
  return null;
}

export function cleanPrivateAccessChoice(value: string, tailscaleConnected: boolean): PrivateAccessChoice {
  if (value === 'setup-now' || value === 'local-only' || value === 'already-connected') {
    return value;
  }
  return tailscaleConnected ? 'already-connected' : 'local-only';
}
