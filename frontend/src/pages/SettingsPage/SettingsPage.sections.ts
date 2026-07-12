export const settingsSectionIds = [
  'general',
  'system',
  'network',
  'storage',
  'backups',
  'applications',
  'security',
  'remote-access',
  'advanced',
] as const;

export type SettingsSection = (typeof settingsSectionIds)[number];

type SettingsGroup = {
  id: 'general' | 'backups' | 'network' | 'advanced';
  label: string;
  description: string;
  sections: SettingsSection[];
};

export const settingsGroups: SettingsGroup[] = [
  {
    id: 'general',
    label: 'General',
    description: 'Identity, host behavior, and app defaults',
    sections: ['general', 'system', 'applications'],
  },
  {
    id: 'backups',
    label: 'Backups',
    description: 'Backup schedule, storage, and restore posture',
    sections: ['backups', 'storage'],
  },
  {
    id: 'network',
    label: 'Network',
    description: 'Local links, private access, and security posture',
    sections: ['network', 'remote-access', 'security'],
  },
  {
    id: 'advanced',
    label: 'Advanced',
    description: 'Low-level host details and support checks',
    sections: ['advanced'],
  },
];

export type SettingsGroupId = (typeof settingsGroups)[number]['id'];

export function visibleSettingsGroups(showAdvanced = true) {
  return showAdvanced ? settingsGroups : settingsGroups.filter((group) => group.id !== 'advanced');
}

export function defaultSettingsGroup(groupId: string): SettingsGroupId {
  return settingsGroups.find((group) => group.id === groupId)?.id ?? 'general';
}

export function sectionsForGroup(groupId: string): SettingsSection[] {
  return settingsGroups.find((group) => group.id === groupId)?.sections ?? settingsGroups[0].sections;
}
