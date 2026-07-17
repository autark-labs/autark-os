import type { Page, Route } from 'playwright/test';

export type FixtureScenario = 'ready' | 'idle' | 'onboarding' | 'loading' | 'empty' | 'error' | 'auth-unclaimed' | 'auth-claimed';

const authSetupCode = 'TEST-LOCAL-CODE';
const authPassword = 'correct horse battery';

const fixedAt = '2025-01-15T12:00:00.000Z';

const action = (id: string, label: string, route: string | null = null) => ({
  id,
  label,
  method: null,
  href: null,
  route,
  confirmationRequired: false,
  danger: false,
});

const doctor = {
  status: 'ready',
  headline: 'This server is ready for apps',
  summary: 'Docker and local access are ready. Private access is available through Tailscale.',
  readiness: {
    status: 'ready',
    headline: 'Ready to use',
    summary: 'Core services are available.',
    canCompleteOnboarding: true,
    finishAnywayRequiresAdvanced: false,
    groups: [],
  },
  checks: [
    { id: 'docker', label: 'Docker', status: 'ok', message: 'Docker is ready.', detail: 'Container runtime is available.', actionLabel: null, actionCommand: null },
    { id: 'tailscale', label: 'Tailscale', status: 'ok', message: 'Tailscale is connected.', detail: 'Private links can be reached from trusted devices.', actionLabel: null, actionCommand: 'sudo tailscale up' },
    { id: 'runtime-root', label: 'Runtime data', status: 'ok', message: 'Runtime storage is writable.', detail: 'Autark-OS can store app data safely.', actionLabel: null, actionCommand: null },
  ],
  repairableChecks: [],
  detectedOs: 'Ubuntu 24.04',
  packageManager: 'apt',
  automatedDependencyInstallSupported: true,
  lanUrl: 'http://autark-os.local',
  checkedAt: fixedAt,
};

const setupStatus = {
  status: 'ready',
  headline: 'Host setup is complete',
  summary: 'The appliance is ready to manage apps.',
  runAsUser: 'autark',
  expectedUser: 'autark',
  devMode: false,
  activeProfiles: 'production',
  backendPort: '8082',
  backendContextPath: '/',
  dockerVersion: '27.4.1',
  tailscaleVersion: '1.82.0',
  instanceId: 'fixture-instance',
  instanceSlug: 'fixture',
  existingInstall: {
    conflict: false,
    developmentInstanceAllowed: false,
    severity: 'ok',
    headline: 'No conflicting install found',
    summary: 'This instance owns its managed apps.',
    resources: [],
    actions: [],
  },
  installCommand: 'curl -fsSL https://autark-os.dev/install | sh',
  checks: doctor.checks,
  checkedAt: fixedAt,
};

const appSettings = {
  accessUrl: 'http://vaultwarden.local',
  privateAccessUrl: 'https://vaultwarden.fixture.ts.net',
  tailscaleEnabled: true,
  storageSubfolders: { data: 'vaultwarden/data' },
  backup: { enabled: true, frequency: 'daily', retention: 14 },
  desiredAccessMode: 'local-and-private',
  privateAccessRequirement: 'recommended',
  expectedLocalPort: 8080,
  expectedProtocol: 'http',
  lastAccessCheckAt: fixedAt,
  lastSuccessfulAccessAt: fixedAt,
  lastRepairAttemptAt: null,
  lastRepairStatus: null,
  autoRepairEnabled: true,
};

const runtimeApp = {
  appId: 'vaultwarden',
  appName: 'Vaultwarden with a deliberately long self-hosted service name',
  category: 'Security',
  description: 'A private password manager for this household.',
  version: '1.32.7',
  image: 'vaultwarden/server:1.32.7',
  friendlyStatus: 'Ready',
  managementState: 'managed',
  readinessState: 'ready',
  attentionState: 'none',
  operationState: null,
  sortKey: 'vaultwarden',
  displayOrder: 1,
  availableActions: [action('open', 'Open app'), action('restart', 'Restart app')],
  technicalStatus: 'running',
  healthCheck: 'healthy',
  runtimePath: '/var/lib/autark-os/apps/vaultwarden',
  composeProject: 'autark-vaultwarden',
  accessUrl: 'http://vaultwarden.local',
  accessRoute: {
    primaryOpenUrl: 'https://vaultwarden.fixture.ts.net',
    localUrl: 'http://vaultwarden.local',
    privateUrl: 'https://vaultwarden.fixture.ts.net',
    backendTargetUrl: 'http://vaultwarden:8080',
    backendProtocol: 'http',
    localPort: 8080,
    privatePort: 443,
    privateLinkStatus: 'verified',
  },
  desiredAccess: {
    mode: 'local-and-private',
    label: 'Home network and private access',
    localUrl: 'http://vaultwarden.local',
    privateUrl: 'https://vaultwarden.fixture.ts.net',
    expectedLocalPort: 8080,
    expectedProtocol: 'http',
    privateAccessRequirement: 'recommended',
    privateAccessRequired: false,
    privateAccessRecommended: true,
  },
  observedAccess: {
    localUrl: 'http://vaultwarden.local',
    privateUrl: 'https://vaultwarden.fixture.ts.net',
    localPort: 8080,
    protocol: 'http',
    privateLinkStatus: 'verified',
    lastAccessCheckAt: fixedAt,
    lastSuccessfulAccessAt: fixedAt,
    lastRepairAttemptAt: null,
    lastRepairStatus: null,
  },
  installedAt: '2025-01-08T12:00:00.000Z',
  lastBackup: '2025-01-14T03:00:00.000Z',
  settings: appSettings,
  telemetry: { cpuPercent: '3.2%', memoryUsage: '184 MB', memoryPercent: '4.2%', networkIo: '12 MB', blockIo: '18 MB', checkedAt: fixedAt },
  healthSnapshot: { appId: 'vaultwarden', status: 'Ready', message: 'Vaultwarden is reachable.', detail: 'The local and private links responded successfully.', dockerStatus: 'healthy', localAccessStatus: 'reachable', privateAccessStatus: 'reachable', startupGrace: false, checkedAt: fixedAt },
  usageGuide: { kind: 'web-app', primaryAction: 'Open Vaultwarden', openUrlLabel: 'Open password manager', headline: 'Your password manager is ready', summary: 'Use the private link from trusted devices.', setupSteps: ['Create an account.', 'Save the recovery phrase.'], values: [], notes: [] },
  setupGuide: { kind: 'basic', automation: 'ready', generatedValues: [], copyableFields: [], qrFields: [], integrations: [], userSteps: ['Open the app and create your first account.'], automationCapabilities: [] },
  appConfiguration: [],
  recentEvents: [],
  canonicalUserStatus: 'Ready',
  canonicalRuntimeState: 'running',
  canonicalOwnershipState: 'managed',
  canonicalAccessState: 'private_ready',
  canonicalBackupState: 'protected_by_restore_point',
  canonicalIssues: [],
  canonicalActions: [action('open', 'Open app')],
  remediation: { state: 'healthy', label: 'Healthy', summary: 'Autark-OS is watching this app.', nextActionLabel: 'Open app', tone: 'success' },
};

const managedApp = {
  appInstanceId: 'vaultwarden-instance',
  catalogAppId: 'vaultwarden',
  name: runtimeApp.appName,
  category: runtimeApp.category,
  icon: 'shield',
  userStatus: 'Ready',
  managementState: 'managed',
  readinessState: 'ready',
  attentionState: 'none',
  installState: 'installed',
  runtimeState: 'running',
  ownershipState: 'managed',
  accessState: 'private_ready',
  backupState: 'protected_by_restore_point',
  localUrl: runtimeApp.accessUrl,
  privateUrl: runtimeApp.accessRoute.privateUrl,
  issues: [],
  actions: [action('open', 'Open app')],
  remediation: runtimeApp.remediation,
  updatedAt: fixedAt,
};

const observedServices = [
  {
    id: 'foreign-immich',
    source: 'docker',
    displayName: 'Immich from another Autark-OS installation with a long descriptive name',
    url: 'http://immich.local:2283',
    category: 'Photos',
    accessScope: 'Home network',
    catalogAppId: 'immich',
    catalogMatchConfidence: 'high',
    userStatus: 'managed_elsewhere',
    userStatusLabel: 'Owned by another Autark-OS instance',
    userStatusDescription: 'Review this service before recovering or installing another copy.',
    managementState: 'found',
    readinessState: 'ready',
    attentionState: 'needs_review',
    ownershipState: 'foreign_autark_os',
    runtimeState: 'running',
    pinned: false,
    managedByThisAutarkOs: false,
    adoptable: true,
    duplicateInstallWarningRequired: true,
    availableActions: [{ id: 'review', label: 'Review service', kind: 'route', href: '/apps/found?service=foreign-immich', method: null, disabled: false, reason: '' }],
    metadata: { composeProject: 'legacy-immich', container: 'immich-server' },
  },
  {
    id: 'linked-router',
    source: 'manual',
    displayName: 'Home router administration',
    url: 'http://router.local',
    category: 'Network',
    accessScope: 'Home network',
    catalogAppId: null,
    catalogMatchConfidence: 'none',
    userStatus: 'pinned_external',
    userStatusLabel: 'Linked service',
    userStatusDescription: 'A pinned shortcut that Autark-OS does not manage.',
    managementState: 'linked',
    readinessState: 'ready',
    attentionState: 'none',
    ownershipState: 'external',
    runtimeState: 'reachable',
    pinned: true,
    managedByThisAutarkOs: false,
    adoptable: false,
    duplicateInstallWarningRequired: false,
    availableActions: [{ id: 'open', label: 'Open service', kind: 'external', href: 'http://router.local', method: null, disabled: false, reason: '' }],
    metadata: {},
  },
];

const activeJob = {
  jobId: 'backup-vaultwarden',
  type: 'backup',
  subjectId: 'vaultwarden',
  status: 'running',
  currentStep: 'archive-data',
  steps: [
    { id: 'prepare', label: 'Preparing backup', status: 'succeeded', message: 'Backup workspace is ready.', startedAt: fixedAt, finishedAt: fixedAt },
    { id: 'archive-data', label: 'Saving app data', status: 'running', message: 'Creating the encrypted archive.', startedAt: fixedAt, finishedAt: null },
    { id: 'verify', label: 'Verifying restore point', status: 'pending', message: 'Waiting for the archive.', startedAt: null, finishedAt: null },
  ],
  createdAt: fixedAt,
  updatedAt: fixedAt,
  error: null,
};

const restorePoint = {
  id: 101,
  appId: 'vaultwarden',
  appName: runtimeApp.appName,
  scope: 'app',
  source: 'automatic',
  includedAppIds: 'vaultwarden',
  status: 'completed',
  path: '/var/lib/autark-os/backups/vaultwarden-101.tar.zst',
  sizeBytes: 28_800_000,
  message: 'The restore point completed successfully.',
  verificationStatus: 'verified',
  verificationMessage: 'Archive checksum and contents were verified.',
  checksumSha256: 'fixture-checksum',
  restoreConfidence: 'high',
  verifiedAt: fixedAt,
  createdAt: '2025-01-14T03:00:00.000Z',
};

const backupReport = {
  status: 'protected',
  headline: 'Your apps are protected',
  summary: 'Vaultwarden has a verified restore point and a backup is currently running.',
  settings: {
    automaticBackupsEnabled: true,
    frequency: 'daily',
    retentionDays: 14,
    backupTime: '03:00',
    timeZone: 'America/Chicago',
    nextRunLabel: 'Tonight at 3:00 AM',
    schedulerHealth: 'healthy',
    schedulerMessage: 'Routine backups are scheduled.',
    lastRoutineRun: restorePoint,
    lastSuccessfulRoutineRun: restorePoint,
    lastSuccessfulVerification: restorePoint,
    nextRoutineRun: '2025-01-16T09:00:00.000Z',
  },
  totalApps: 1,
  protectedApps: 1,
  unprotectedApps: 0,
  failedBackups: 0,
  backupStorageBytes: 28_800_000,
  backupRoot: '/var/lib/autark-os/backups',
  apps: [{
    appId: 'vaultwarden',
    appName: runtimeApp.appName,
    status: 'protected',
    protectedByBackups: true,
    backupFrequency: 'daily',
    backupRetention: 14,
    backupContract: { strategy: 'sqlite', label: 'SQLite data', confidence: 'standard', reviewRequired: false, summary: 'Autark-OS creates a consistent archive.', details: ['Database data', 'Attachments'] },
    runtimePath: runtimeApp.runtimePath,
    dataSizeBytes: 19_000_000,
    latestBackup: restorePoint,
    restorePoints: [restorePoint],
    message: 'Protected by a verified restore point.',
    nextBackup: '2025-01-16T09:00:00.000Z',
    checkedAt: fixedAt,
  }],
  recentRestorePoints: [restorePoint],
  checkedAt: fixedAt,
};

const storageReport = {
  status: 'warning',
  headline: 'Storage has room to grow',
  summary: 'There is enough space for new apps and backups. One unused folder can be reviewed.',
  hostDisk: { label: 'Host disk', path: '/', totalBytes: 1_000_000_000_000, usableBytes: 430_000_000_000, usedBytes: 570_000_000_000, usedPercent: 57 },
  runtimeDisk: { label: 'Autark-OS data', path: '/var/lib/autark-os', totalBytes: 1_000_000_000_000, usableBytes: 430_000_000_000, usedBytes: 90_000_000_000, usedPercent: 9 },
  backupStorage: { label: 'Backups', path: '/var/lib/autark-os/backups', totalBytes: 1_000_000_000_000, usableBytes: 430_000_000_000, usedBytes: 28_800_000, usedPercent: 1 },
  apps: [{ appId: 'vaultwarden', appName: runtimeApp.appName, status: 'healthy', path: runtimeApp.runtimePath, usedBytes: 19_000_000, sevenDayGrowthBytes: 1_000_000, trend: [{ usedBytes: 18_000_000, sampledAt: '2025-01-08T12:00:00.000Z' }, { usedBytes: 19_000_000, sampledAt: fixedAt }], backupEnabled: true, backupFrequency: 'daily', lastBackup: restorePoint.createdAt }],
  orphanedData: [{ name: 'old-paperless-import', path: '/var/lib/autark-os/orphans/old-paperless-import', usedBytes: 8_400_000 }],
  recommendations: [{ id: 'review-orphan', tone: 'warning', title: 'Review unused data', message: 'An old import folder can be removed after review.', actionLabel: 'Review folder' }],
  installSafety: { status: 'ready', message: 'Enough disk space is available for a typical verified app.', minimumRecommendedFreeBytes: 50_000_000_000, currentFreeBytes: 430_000_000_000, installAllowed: true },
  checkedAt: fixedAt,
};

const catalogApp = {
  id: 'vaultwarden',
  name: 'Vaultwarden',
  category: 'Security',
  description: 'A private password manager for your household.',
  shortValue: 'Keep passwords private',
  badge: 'Verified starter',
  downloads: '12k installs',
  rating: '4.9',
  image: '',
  version: '1.32.7',
  lastUpdated: '2025-01-10',
  size: '180 MB',
  maintainer: 'Autark-OS',
  source: 'Vaultwarden',
  sourceUrl: 'https://github.com/dani-garcia/vaultwarden',
  documentationUrl: 'https://github.com/dani-garcia/vaultwarden/wiki',
  installTime: 'About 2 minutes',
  difficulty: 'Easy',
  supportLevel: 'Ready',
  supportSummary: 'Verified for a private home server.',
  accessUrl: 'http://vaultwarden.local',
  tags: ['Passwords', 'Security', 'Starter'],
  bestFor: ['Household password storage'],
  highlights: ['Private by default', 'Daily backups'],
  plainLanguage: 'Store and share passwords privately.',
  technicalSummary: 'A single container with persistent SQLite data.',
  requirements: ['Docker'],
  includes: ['Vaultwarden web vault'],
  configuration: [],
  access: { kind: 'web', defaultMode: 'local-and-private', privateAccessRecommended: true, requiresFirstRunSetup: true, notes: [] },
  usage: { kind: 'web-app', primaryAction: 'Open Vaultwarden', openUrlLabel: 'Open Vaultwarden', headline: 'Password management', summary: 'Use a private link from trusted devices.', privateHttpsRequired: false, setupSteps: ['Create an account'], fields: [], notes: [] },
  setup: { kind: 'basic', automation: 'guided', generatedValues: [], copyableFields: [], qrFields: [], integrations: [], userSteps: ['Create an account'], automationCapabilities: [] },
  health: { type: 'http', path: '/', startupGraceSeconds: 30, successLabel: 'Ready', startingLabel: 'Starting', failureLabel: 'Needs attention', description: 'Checks the web vault.' },
  smokeTests: [{ label: 'Open the web vault', status: 'Passed', detail: 'Verified in the fixture catalog.' }],
};

const discoverApps = [
  {
    id: 'vaultwarden',
    app: catalogApp,
    name: catalogApp.name,
    image: '',
    summary: catalogApp.shortValue,
    description: catalogApp.description,
    categoryLabel: 'Security',
    serviceKindLabel: 'Web app',
    estimatedInstallTime: catalogApp.installTime,
    difficulty: catalogApp.difficulty,
    state: 'installed_managed',
    stateLabel: 'Installed',
    stateDescription: 'Managed by this Autark-OS instance.',
    statusTone: 'success',
    cardTone: 'success',
    ownedByCurrentInstance: true,
    installCopyWarningRequired: false,
    reviewExistingHref: null,
    primaryAction: { id: 'manage', label: 'Manage app', kind: 'route', href: '/apps?app=vaultwarden', method: null, disabled: false, reason: '' },
    availableActions: [],
    installed: true,
    installedApp: { appId: 'vaultwarden', appName: runtimeApp.appName, status: 'Ready', accessUrl: runtimeApp.accessUrl, backupState: 'protected_by_restore_point', protectedByBackups: true, firstBackupRecommended: false },
    observedService: null,
    setupSchema: { appId: 'vaultwarden', version: 1, inputs: [{ id: 'access', label: 'Access', type: 'choice', tier: 'recommended', required: true, defaultValue: 'local-and-private', help: 'Choose where the app can be opened.', options: [{ value: 'local-and-private', label: 'Home and private', description: 'Use your local network and Tailscale.', recommended: true, advanced: false }], showWhen: {} }] },
  },
  {
    id: 'immich',
    app: { ...catalogApp, id: 'immich', name: 'Immich', category: 'Photos', shortValue: 'Private photo library', description: 'Keep photos on your own server.', tags: ['Photos', 'Starter'], badge: 'Found on server' },
    name: 'Immich', image: '', summary: 'Private photo library', description: 'Keep photos on your own server.', categoryLabel: 'Photos', serviceKindLabel: 'Photo library', estimatedInstallTime: 'About 5 minutes', difficulty: 'Easy',
    state: 'managed_elsewhere', stateLabel: 'Found on this server', stateDescription: 'Owned by another Autark-OS instance.', statusTone: 'warning', cardTone: 'warning', ownedByCurrentInstance: false, installCopyWarningRequired: true, reviewExistingHref: '/apps/found?service=foreign-immich',
    primaryAction: { id: 'review', label: 'Review existing service', kind: 'route', href: '/apps/found?service=foreign-immich', method: null, disabled: false, reason: '' }, availableActions: [], installed: false, installedApp: null, observedService: observedServices[0], setupSchema: { appId: 'immich', version: 1, inputs: [] },
  },
];

const appState = {
  managedApps: [managedApp],
  runtimeApps: [runtimeApp],
  observedServices,
  pinnedExternalServices: [observedServices[1]],
  foundServices: [observedServices[0]],
  ownershipViews: [],
  updatedAt: fixedAt,
  stale: false,
  refreshStatus: 'idle',
  refreshStartedAt: null,
  refreshCompletedAt: fixedAt,
  nextRefreshAt: '2025-01-15T12:10:00.000Z',
  lastError: null,
};

const emptyAppState = {
  ...appState,
  managedApps: [],
  runtimeApps: [],
  observedServices: [],
  pinnedExternalServices: [],
  foundServices: [],
};

const systemSummary = {
  deviceName: 'Fixture Home Server',
  instanceId: 'fixture-instance',
  lanUrl: 'http://autark-os.local',
  setup: { complete: true, status: 'complete', nextStep: 'done', summary: 'Setup is complete.' },
  docker: { ready: true, summary: 'Docker is ready.' },
  access: { mode: 'local-and-private', summary: 'Local and private access are ready.' },
  apps: { installed: 1, running: 1, needsAttention: 0, readyToOpen: [{ appInstanceId: managedApp.appInstanceId, name: managedApp.name, url: runtimeApp.accessRoute.primaryOpenUrl }] },
  backups: { state: 'protected', summary: 'One app has a verified restore point.' },
  storage: { state: 'warning', summary: 'Storage has room to grow.' },
  issues: [{ id: 'storage-orphan', scope: 'storage', subjectId: 'old-paperless-import', severity: 'warning', reasonCode: 'orphaned_data', title: 'Unused data is available to review', summary: 'An old import folder is using a small amount of space.', primaryAction: action('review-storage', 'Review storage', '/storage'), secondaryActions: [], advancedDetails: {} }],
  updatedAt: fixedAt,
};

const onboardingComplete = {
  status: 'complete', currentStep: 4, deviceName: systemSummary.deviceName, runtimePath: '/var/lib/autark-os', backupDestination: '/var/lib/autark-os/backups', tailscaleConnected: true, privateAccessChoice: 'already-connected', automaticBackupsEnabled: true, recommendedApps: ['vaultwarden'], completedSteps: ['welcome', 'host_check', 'tailscale', 'starter_apps', 'done'], doctor, updatedAt: fixedAt,
};

const onboardingIncomplete = { ...onboardingComplete, status: 'in_progress', currentStep: 1, completedSteps: ['welcome'] };

const networkStatus = { installed: true, connected: true, state: 'Running', message: 'Tailscale is connected.', deviceName: 'fixture-server', dnsName: 'fixture-server.fixture.ts.net', tailnetIps: ['100.64.0.10'], tailnetName: 'fixture.ts.net', loginName: 'fixture@example.com' };

const reconciliation = {
  status: 'healthy', headline: 'Private links are ready', summary: 'Configured private links match the managed app access settings.',
  apps: [{ appId: 'vaultwarden', appName: runtimeApp.appName, status: 'healthy', message: 'Private link is ready.', detail: 'Tailscale Serve routes this app safely.', actionLabel: null, expectedPrivateUrl: runtimeApp.accessRoute.privateUrl, actualPrivateUrl: runtimeApp.accessRoute.privateUrl, expectedPort: 443, actualPort: 443, target: 'http://vaultwarden:8080', expectedLocalPort: 8080, expectedHttpsPort: 443, storedPrivateUrl: runtimeApp.accessRoute.privateUrl, desiredMapping: '443 -> 8080', liveMappings: ['443 -> 8080'], matchReason: 'Configured mapping matches the desired access.', verifiedAt: fixedAt }],
  staleMappings: [], checkedAt: fixedAt,
};

const metrics = { deviceName: systemSummary.deviceName, runAsUser: 'autark', osName: 'Ubuntu', osVersion: '24.04', osArchitecture: 'x86_64', javaVersion: '21', availableProcessors: 4, systemCpuPercent: 12.4, processCpuPercent: 1.1, systemLoadAverage: 0.42, totalMemoryBytes: 8_000_000_000, freeMemoryBytes: 4_200_000_000, usedMemoryPercent: 47.5, runtimeRoot: '/var/lib/autark-os', runtimeTotalBytes: 1_000_000_000_000, runtimeUsableBytes: 430_000_000_000, runtimeUsedPercent: 9, checkedAt: fixedAt };
const version = { version: '0.9.0-fixture', buildSha: 'fixture', buildDate: fixedAt, installPath: '/opt/autark-os', runtimePath: '/var/lib/autark-os', backendJar: '/opt/autark-os/autark-os.jar', updateChannel: 'stable', updateStatus: 'current', updateMessage: 'This fixture is current.', checkedAt: fixedAt };
const settings = { deviceName: systemSummary.deviceName, timeZone: 'America/Chicago', language: 'en', temperatureUnit: 'fahrenheit', dateFormat: 'MMM d, yyyy', timeFormat: '12-hour', startOnBoot: true, telemetryEnabled: false, defaultInstallAccess: 'local-and-private', automaticRepairEnabled: true, automaticBackupsEnabled: true, backupFrequency: 'daily', backupRetentionDays: 14, backupTime: '03:00', updateChannel: 'stable', showAdvancedMetrics: true, updatedAt: fixedAt };
const activity = [{ id: 1, level: 'success', category: 'backup', action: 'backup_completed', title: 'Vaultwarden backup verified', message: 'A verified restore point is ready.', appId: 'vaultwarden', outcome: 'completed', details: 'Fixture event', createdAt: fixedAt }];

const supportSummary = { status: 'ready_with_notes', headline: 'Diagnostics are ready', summary: 'One non-critical storage item can be reviewed.', redacted: true, backendHealth: 'healthy', dockerStatus: 'ready', tailscaleStatus: 'connected', serviceStatus: 'running', version, recentFailures: 0, findings: [{ id: 'storage-orphan', area: 'Storage', severity: 'warning', title: 'Unused data is available to review', message: 'Review the old import folder before cleanup.', actionLabel: 'Open storage', route: '/storage' }], unifiedIssues: systemSummary.issues, redactionRules: [{ id: 'tokens', label: 'Tokens', description: 'Secrets are redacted from support output.' }], commands: [{ id: 'doctor', label: 'Run doctor', description: 'Check core services.', command: 'autark-os doctor', destination: 'terminal' }], checkedAt: fixedAt };

const restorePlan = { restorePointId: restorePoint.id, scope: 'app', source: 'automatic', targetAppId: 'vaultwarden', title: 'Restore Vaultwarden', summary: 'Restore Vaultwarden from its verified checkpoint.', affectedApps: [runtimeApp.appName], warnings: ['A fresh safety checkpoint is created first.'], steps: ['Stop Vaultwarden.', 'Restore the archive.', 'Start Vaultwarden.'], dryRunDetails: ['Archive contents match the app backup contract.'], verificationStatus: 'verified', verificationMessage: 'Archive checksum is verified.', simulation: { status: 'passed', message: 'The restore plan is ready.', details: ['Target storage is available.'], simulatedAt: fixedAt }, restoreConfidence: 'high', executable: true, plannedAt: fixedAt };

function defaultResponse(pathname: string, method: string, scenario: FixtureScenario) {
  const onboarding = scenario === 'onboarding' ? onboardingIncomplete : onboardingComplete;
  const currentAppState = scenario === 'empty' ? emptyAppState : appState;
  const jobs = scenario === 'idle' ? [] : [activeJob];
  if (pathname === '/api/admin/security/status') return { devMode: true, claimed: true, authRequired: false, message: 'Fixture mode', setupCodeCommand: 'sudo autark-os admin setup-code', passwordResetCommand: 'sudo autark-os admin reset-password' };
  if (pathname === '/api/system/onboarding') return onboarding;
  if (pathname === '/api/application-state' || pathname === '/api/application-state/refresh') return currentAppState;
  if (pathname === '/api/system-summary') return systemSummary;
  if (pathname === '/api/recommended-action') return { id: 'review-storage', severity: 'warning', title: 'Review unused data', body: 'A small unused folder can be reviewed before cleanup.', primaryAction: action('review-storage', 'Review storage', '/storage'), secondaryAction: null, sourceIssueIds: ['storage-orphan'], dismissible: true };
  if (pathname === '/api/activity') return activity;
  if (pathname === '/api/jobs') return jobs;
  if (pathname.startsWith('/api/jobs/')) return jobs[0] ?? { ...activeJob, status: 'succeeded' };
  if (pathname === '/api/system/doctor') return doctor;
  if (pathname === '/api/system/setup-status') return setupStatus;
  if (pathname === '/api/system/metrics') return metrics;
  if (pathname === '/api/system/storage') return storageReport;
  if (pathname === '/api/system/settings') return method === 'PUT' ? { settings, appDefaults: { ok: true, severity: 'success', title: 'Settings saved', message: 'Fixture settings saved.', updatedApps: 1, completedAt: fixedAt } } : settings;
  if (pathname === '/api/system/version') return version;
  if (pathname === '/api/system/support/summary') return supportSummary;
  if (pathname === '/api/system/support/logs') return [{ line: 'Fixture log: all services are ready.', level: 'info', redacted: true }];
  if (pathname === '/api/system/support/bundle') return { ...supportSummary, setup: setupStatus, metrics, domainSummaries: [], recentActivity: activity, recentFailures: [], logs: [{ line: 'Fixture log: all services are ready.', level: 'info', redacted: true }], bundleText: 'Fixture support bundle', recentFailureCount: 0, generatedAt: fixedAt };
  if (pathname === '/api/network/tailscale/status') return networkStatus;
  if (pathname === '/api/network/tailscale/devices') return [{ id: 'fixture-server', name: 'Fixture server', dnsName: networkStatus.dnsName, tailnetIps: networkStatus.tailnetIps, operatingSystem: 'linux', online: true, lastSeen: fixedAt, connectionType: 'direct', relay: '', currentAddress: '100.64.0.10:41641', exitNode: false, self: true, user: 'fixture@example.com' }];
  if (pathname === '/api/network/diagnostics') return { status: 'healthy', headline: 'Access is ready', summary: 'Local and private links are working.', checks: [], appChecks: [], checkedAt: fixedAt };
  if (pathname === '/api/network/private-access/reconciliation') return reconciliation;
  if (pathname === '/api/network/tailscale/connect-guide') return { headline: 'Tailscale is connected', summary: 'Private links are ready to use.', steps: ['Open Tailscale from the app header.'], installUrl: 'https://tailscale.com/download', connectCommand: 'sudo tailscale up', advancedNote: 'Fixture guide' };
  if (pathname === '/api/network/devices/access') return { status: 'ready', headline: 'Trusted devices can reach private apps', summary: 'One device is online.', tailscale: networkStatus, privateAccess: reconciliation, devices: [], onboardingSteps: [], checkedAt: fixedAt };
  if (pathname === '/api/backups') return backupReport;
  if (pathname.includes('/api/backups/restore-points/') && pathname.endsWith('/plan')) return restorePlan;
  if (pathname.startsWith('/api/backups/')) return activeJob;
  if (pathname === '/api/discover/apps') return discoverApps;
  if (pathname.includes('/install-preview')) return { valid: true, blockingIssues: [], warnings: [], sections: [{ id: 'create', title: 'Autark-OS will create', items: [{ label: 'Vaultwarden service', description: 'Fixture install plan', tone: 'success' }] }], technicalDetails: { friendly: { headline: 'Ready to install', willCreate: ['Vaultwarden'], willExpose: ['Local link'], willConfigure: [], willBackUp: ['Daily backup'] }, technical: { runtimeRoot: '/var/lib/autark-os', composeProject: 'autark-vaultwarden', network: 'autark', containers: [{ name: 'vaultwarden', image: 'vaultwarden/server:1.32.7' }], ports: ['8080'], volumes: ['vaultwarden-data'], labels: [], backupPaths: ['data'] } }, installOptions: { ports: { hostPort: 8080 }, access: { tailscaleEnabled: true }, storage: { subfolders: { data: 'data' } }, backup: { enabled: true, frequency: 'daily', retention: 14 } } };
  if (pathname.startsWith('/api/discover/apps/')) return discoverApps.find((app) => pathname.includes(app.id)) ?? discoverApps[0];
  if (pathname === '/api/observed-services') return observedServices;
  if (pathname.includes('/adoption-plan')) return { serviceId: 'foreign-immich', displayName: observedServices[0].displayName, available: true, summary: 'Review the fixture recovery plan.', confirmationText: 'RECOVER', blockedReasons: [], warnings: ['Existing data is preserved.'], steps: ['Apply current instance labels.'], containers: ['immich-server'], catalogAppId: 'immich', labels: [], labelsToApply: [], dataPaths: ['/var/lib/immich'], dataPreservation: 'Existing data is preserved.', restartRequired: false, safetyCheckpointAvailable: true, disabledReason: null };
  if (pathname.startsWith('/api/observed-services/')) return { ok: true, severity: 'success', title: 'Fixture action complete', message: 'The fixture state is unchanged.', applicationState: currentAppState };
  if (pathname === '/api/apps/updates') return [];
  if (pathname.startsWith('/api/apps/')) return method === 'GET' ? runtimeApp : activeJob;
  return {};
}

async function fulfill(route: Route, body: unknown, status = 200, headers: Record<string, string> = {}) {
  await route.fulfill({
    status,
    headers,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

export async function installMockApi(page: Page, scenario: FixtureScenario = 'ready') {
  let authenticated = false;
  let claimed = scenario !== 'auth-unclaimed';
  const authScenario = scenario === 'auth-unclaimed' || scenario === 'auth-claimed';
  await page.addInitScript(({ now }) => {
    Date.now = () => now;
    window.localStorage.clear();
    window.sessionStorage.clear();
  }, { now: Date.parse(fixedAt) });

  await page.route((url) => new URL(url).pathname.startsWith('/api/'), async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (authScenario) {
      if (url.pathname === '/api/admin/security/status') {
        await fulfill(route, {
          devMode: false,
          claimed,
          authRequired: true,
          message: claimed ? 'Log in to manage this Autark-OS appliance.' : 'Claim this Autark-OS install before making changes.',
          setupCodeCommand: 'sudo autark-os admin setup-code',
          passwordResetCommand: 'sudo autark-os admin reset-password',
        });
        return;
      }
      if (url.pathname === '/api/admin/security/session') {
        await fulfill(route, { authorized: authenticated, token: '', message: authenticated ? 'Session active.' : 'Administrator authentication required.', expiresAt: null, retryAfterSeconds: 0 }, authenticated ? 200 : 401);
        return;
      }
      if (url.pathname === '/api/admin/security/claim' && request.method() === 'POST') {
        const body = request.postDataJSON() as { setupCode?: string; password?: string };
        const accepted = !claimed && body.setupCode === authSetupCode && body.password === authPassword;
        if (accepted) {
          claimed = true;
          authenticated = true;
        }
        await fulfill(route, { authorized: accepted, token: '', message: accepted ? 'Autark-OS is claimed.' : 'The administrator credentials could not be verified.', expiresAt: fixedAt, retryAfterSeconds: 0 }, accepted ? 200 : 401, accepted ? { 'set-cookie': 'autark-os-admin-session=fixture; HttpOnly; SameSite=Strict; Path=/api' } : {});
        return;
      }
      if (url.pathname === '/api/admin/security/login' && request.method() === 'POST') {
        const body = request.postDataJSON() as { password?: string };
        const accepted = claimed && body.password === authPassword;
        authenticated = accepted;
        await fulfill(route, { authorized: accepted, token: '', message: accepted ? 'Login successful.' : 'The administrator credentials could not be verified.', expiresAt: fixedAt, retryAfterSeconds: 0 }, accepted ? 200 : 401, accepted ? { 'set-cookie': 'autark-os-admin-session=fixture; HttpOnly; SameSite=Strict; Path=/api' } : {});
        return;
      }
      if (url.pathname === '/api/admin/security/logout' && request.method() === 'POST') {
        authenticated = false;
        await fulfill(route, { authorized: false, token: '', message: 'Logged out.', expiresAt: null, retryAfterSeconds: 0 }, 200, { 'set-cookie': 'autark-os-admin-session=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/api' });
        return;
      }
      if (url.pathname !== '/api/health' && !authenticated) {
        await fulfill(route, { code: 'admin_auth_required', message: 'Administrator authentication required.' }, 401);
        return;
      }
    }

    if (scenario === 'loading' && url.pathname === '/api/application-state') {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    if (scenario === 'error' && url.pathname === '/api/system/storage') {
      await fulfill(route, { message: 'Fixture storage service is unavailable.' }, 503);
      return;
    }

    await fulfill(route, defaultResponse(url.pathname, request.method(), scenario));
  });

  return {
    expireAdminSession() {
      authenticated = false;
    },
  };
}

export async function stabilizePage(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
    `,
  });
}

export async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => {
    const clientWidth = document.documentElement.clientWidth;
    const overflowingElements = Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .map((element) => ({
        className: element.className,
        right: Math.round(element.getBoundingClientRect().right),
        tagName: element.tagName.toLowerCase(),
        text: (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
        width: Math.round(element.getBoundingClientRect().width),
      }))
      .filter((element) => element.right > clientWidth + 1)
      .slice(0, 5);
    const widestOverflow = Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .map((element) => ({ element, right: element.getBoundingClientRect().right }))
      .filter(({ right }) => right > clientWidth + 1)
      .sort((left, right) => right.right - left.right)[0]?.element;
    const ancestorChain: Array<{ className: string; scrollWidth: number; tagName: string; width: number }> = [];
    let parent = widestOverflow?.parentElement ?? null;
    while (parent && ancestorChain.length < 8) {
      ancestorChain.push({
        className: parent.className,
        scrollWidth: parent.scrollWidth,
        tagName: parent.tagName.toLowerCase(),
        width: Math.round(parent.getBoundingClientRect().width),
      });
      parent = parent.parentElement;
    }

    return {
      ancestorChain,
      clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflowingElements,
    };
  });
  if (metrics.scrollWidth > metrics.clientWidth) {
    const offenders = metrics.overflowingElements
      .map((element) => `${element.tagName}.${String(element.className).replace(/\s+/g, '.')} "${element.text}" (${element.width}px wide, right: ${element.right}px)`)
      .join(', ');
    const ancestry = metrics.ancestorChain
      .map((element) => `${element.tagName}.${String(element.className).replace(/\s+/g, '.')} (${element.width}px wide, ${element.scrollWidth}px scroll)`)
      .join(' > ');
    throw new Error(`Document overflows horizontally: ${metrics.scrollWidth}px content in a ${metrics.clientWidth}px viewport. Offenders: ${offenders || 'not identified'}. Ancestors: ${ancestry || 'not identified'}.`);
  }
}
