export const themeStorageKey = 'autark-os.theme';

export const defaultThemeId = 'project-slate';

export const autarkOsThemes = [
  {
    id: 'project-slate',
    label: 'Project Slate',
    description: 'Balanced slate, cyan, and sky controls.',
  },
  {
    id: 'harbor',
    label: 'Harbor',
    description: 'Cooler blue panels with crisp cyan actions.',
  },
  {
    id: 'forest',
    label: 'Forest',
    description: 'Deep green panels with teal highlights.',
  },
  {
    id: 'ember',
    label: 'Ember',
    description: 'Warm dark panels with orange actions.',
  },
];

const themeIds = new Set(autarkOsThemes.map((theme) => theme.id));

export function resolveThemeId(value) {
  return themeIds.has(value) ? value : defaultThemeId;
}

export function readStoredTheme(storage = globalThis.localStorage) {
  try {
    const stored = storage?.getItem(themeStorageKey);
    return themeIds.has(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function storeTheme(themeId, storage = globalThis.localStorage) {
  const nextTheme = resolveThemeId(themeId);
  storage?.setItem(themeStorageKey, nextTheme);
  return nextTheme;
}

export function applyThemeToDocument(documentRef = globalThis.document, themeId = defaultThemeId) {
  const nextTheme = resolveThemeId(themeId);
  if (documentRef?.documentElement?.dataset) {
    documentRef.documentElement.dataset.theme = nextTheme;
  }
  return nextTheme;
}
