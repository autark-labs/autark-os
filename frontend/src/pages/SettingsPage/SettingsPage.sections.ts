export const settingsGroups = [
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

export function defaultSettingsGroup(groupId: string) {
  return settingsGroups.some((group) => group.id === groupId) ? groupId : 'general';
}

export function sectionsForGroup(groupId: string) {
  return settingsGroups.find((group) => group.id === groupId)?.sections ?? settingsGroups[0].sections;
}
