import type { ApplicationView } from './applicationState';
import type { InstallOptions, InstallPlan, MarketplaceApp } from './marketplace';

export type DiscoverSetupOption = {
  value: string;
  label: string;
  description: string;
  recommended: boolean;
  advanced: boolean;
};

export type DiscoverSetupInput = {
  id: string;
  label: string;
  type: 'text' | 'choice' | 'path' | 'number-or-auto' | string;
  tier: 'required' | 'recommended' | 'app_specific' | 'advanced' | string;
  required: boolean;
  defaultValue: unknown;
  help: string;
  options: DiscoverSetupOption[];
  showWhen: Record<string, string>;
};

export type DiscoverSetupSchema = {
  appId: string;
  version: number;
  inputs: DiscoverSetupInput[];
};

export type DiscoverAppView = {
  application: ApplicationView;
  app: MarketplaceApp;
  serviceKindLabel: string;
  estimatedInstallTime: string;
  difficulty: string;
  setupSchema: DiscoverSetupSchema;
};

export type DiscoverInstallIssue = {
  fieldId: string;
  severity: 'error' | 'warning' | string;
  message: string;
};

export type DiscoverInstallPreviewItem = {
  label: string;
  description?: string | null;
  tone: 'default' | 'success' | 'warning' | 'danger' | string;
};

export type DiscoverInstallPreviewSection = {
  id: 'create' | 'connect' | 'protect' | 'check' | 'afterInstall' | string;
  title: string;
  items: DiscoverInstallPreviewItem[];
};

export type DiscoverInstallPreview = {
  valid: boolean;
  blockingIssues: DiscoverInstallIssue[];
  warnings: DiscoverInstallIssue[];
  sections: DiscoverInstallPreviewSection[];
  technicalDetails: InstallPlan;
  installOptions: InstallOptions;
};

export type DiscoverInstallRequestOptions = {
  reinstall?: boolean;
  duplicateAcknowledged?: boolean;
};
