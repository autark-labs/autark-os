export type MarketplaceAccess = {
  kind: 'web' | 'api' | 'background' | 'multi-port' | string;
  defaultMode: 'local' | 'private' | 'local-and-private' | 'none' | string;
  privateAccessRecommended: boolean;
  requiresFirstRunSetup: boolean;
  notes: string[];
};

export type MarketplaceUsageField = {
  label: string;
  value: string;
  sensitive: boolean;
  qr: boolean;
};

export type MarketplaceUsage = {
  kind: 'web-app' | 'companion-service' | 'admin-service' | 'background-service' | 'infrastructure' | string;
  primaryAction: string;
  openUrlLabel: string;
  headline: string;
  summary: string;
  privateHttpsRequired: boolean;
  setupSteps: string[];
  fields: MarketplaceUsageField[];
  notes: string[];
};

export type MarketplaceSetupField = {
  label: string;
  value: string;
  sensitive: boolean;
};

export type MarketplaceSetupGeneratedValue = MarketplaceSetupField & {
  recoverable: boolean;
};

export type MarketplaceSetupIntegration = {
  id: string;
  name: string;
  targetAppId: string;
  description: string;
  requiresApproval: boolean;
  plannedActions: string[];
};

export type MarketplaceSetup = {
  kind: 'basic' | 'companion' | 'dashboard' | 'integration' | 'media-stack' | 'infrastructure' | string;
  automation: 'manual' | 'guided' | 'ready' | 'planned' | string;
  generatedValues: MarketplaceSetupGeneratedValue[];
  copyableFields: MarketplaceSetupField[];
  qrFields: MarketplaceSetupField[];
  integrations: MarketplaceSetupIntegration[];
  userSteps: string[];
  automationCapabilities: string[];
};

export type MarketplaceHealth = {
  type: 'http' | 'tcp' | 'container' | 'no-web-ui' | 'none' | string;
  path: string;
  startupGraceSeconds: number;
  successLabel: string;
  startingLabel: string;
  failureLabel: string;
  description: string;
};

export type CatalogSmokeTest = {
  label: string;
  status: 'Passed' | 'Needs hardware test' | 'Needs end-to-end test' | 'Blocked' | 'Not applicable' | string;
  detail: string;
};

export type PostInstallGuide = Omit<MarketplaceUsage, 'fields'> & {
  values: MarketplaceUsageField[];
};

export type ResolvedSetupField = MarketplaceSetupField & {
  qr: boolean;
  recoverable: boolean;
};

export type ResolvedSetupIntegration = MarketplaceSetupIntegration & {
  status: 'ready' | 'missing' | 'available' | string;
};

export type AppSetupGuide = Omit<MarketplaceSetup, 'generatedValues' | 'copyableFields' | 'qrFields' | 'integrations'> & {
  generatedValues: ResolvedSetupField[];
  copyableFields: ResolvedSetupField[];
  qrFields: ResolvedSetupField[];
  integrations: ResolvedSetupIntegration[];
};

export type MarketplaceApp = {
  id: string;
  name: string;
  category: string;
  description: string;
  shortValue: string;
  badge: string;
  downloads: string;
  rating: string;
  image: string;
  version: string;
  lastUpdated: string;
  size: string;
  maintainer: string;
  source: string;
  sourceUrl: string;
  documentationUrl: string;
  installTime: string;
  difficulty: string;
  supportLevel: 'Ready' | 'Needs testing' | 'Advanced' | 'Experimental' | string;
  supportSummary: string;
  accessUrl: string;
  tags: string[];
  bestFor: string[];
  highlights: string[];
  plainLanguage: string;
  technicalSummary: string;
  requirements: string[];
  includes: string[];
  configuration: Array<{ label: string; value: string }>;
  access: MarketplaceAccess;
  usage: MarketplaceUsage;
  setup: MarketplaceSetup;
  health: MarketplaceHealth;
  smokeTests: CatalogSmokeTest[];
  runtime?: {
    ports?: string[];
    runtimeRoot?: string;
    volumes?: string[];
    services?: Array<{
      name: string;
      containerName: string;
      image: string;
      ports: string[];
      volumes: string[];
      environment: string[];
      dependsOn: string[];
      labels: string[];
      privileged: boolean;
    }>;
  };
};

export type InstallOptions = {
  ports: { hostPort: number | null };
  access: { tailscaleEnabled: boolean };
  storage: { subfolders: Record<string, string> };
  backup: { enabled: boolean; frequency: string; retention: number };
  reinstall?: boolean;
};

export type InstallPlan = {
  friendly: {
    headline: string;
    willCreate: string[];
    willExpose: string[];
    willConfigure: string[];
    willBackUp: string[];
  };
  technical: {
    runtimeRoot: string;
    composeProject: string;
    network: string;
    containers: Array<{ name: string; image: string }>;
    ports: string[];
    volumes: string[];
    labels: string[];
    backupPaths: string[];
  };
  customization?: {
    accessUrl: string;
    tailscaleEnabled: boolean;
    storageSubfolders?: Record<string, string>;
    backup?: { enabled: boolean; frequency: string; retention: number };
  };
};

export type InstallResult = {
  appId: string;
  appName: string;
  status: string;
  message: string;
  accessUrl: string;
  logs: string[];
  steps: Array<{ label: string; status: string; detail: string; timestamp: string }>;
  plan?: InstallPlan;
  postInstallGuide?: PostInstallGuide | null;
  setupGuide?: AppSetupGuide | null;
};
