import { describe, expect, it } from 'vitest';
import { appSpecificSetupInputs, hasAppSpecificSetup } from '../MarketplaceAppSettingsDialog';
import type { DiscoverSetupSchema } from '@/types/discover';

const schema: DiscoverSetupSchema = {
  appId: 'jellyfin',
  version: 1,
  inputs: [
    {
      id: 'displayName',
      label: 'App name',
      type: 'text',
      tier: 'required',
      required: true,
      defaultValue: 'Jellyfin',
      help: 'A friendly app name.',
      options: [],
      showWhen: {},
    },
    {
      id: 'accessMode',
      label: 'Access',
      type: 'choice',
      tier: 'recommended',
      required: true,
      defaultValue: 'private_lan',
      help: 'Choose app access.',
      options: [],
      showWhen: {},
    },
    {
      id: 'jellyfinMediaFolder',
      label: 'Media folder',
      type: 'choice',
      tier: 'app_specific',
      required: true,
      defaultValue: 'create_new',
      help: 'Jellyfin needs a media folder.',
      options: [],
      showWhen: {},
    },
    {
      id: 'jellyfinExistingMediaPath',
      label: 'Existing media folder path',
      type: 'path',
      tier: 'app_specific',
      required: true,
      defaultValue: '',
      help: 'Select an existing path.',
      options: [],
      showWhen: { jellyfinMediaFolder: 'existing_folder' },
    },
    {
      id: 'localBrowserPort',
      label: 'Local browser port',
      type: 'number-or-auto',
      tier: 'advanced',
      required: false,
      defaultValue: 'auto',
      help: 'Leave on Auto.',
      options: [],
      showWhen: {},
    },
  ],
};

describe('appSpecificSetupInputs', () => {
  it('only exposes settings that are unique to the app', () => {
    const answers = { displayName: 'Jellyfin', accessMode: 'private_lan', jellyfinMediaFolder: 'create_new' };

    expect(appSpecificSetupInputs(schema, answers).map((input) => input.id)).toEqual(['jellyfinMediaFolder']);
    expect(hasAppSpecificSetup(schema, answers)).toBe(true);
  });

  it('reveals conditional app settings after their parent choice changes', () => {
    const answers = { displayName: 'Jellyfin', accessMode: 'private_lan', jellyfinMediaFolder: 'existing_folder' };

    expect(appSpecificSetupInputs(schema, answers).map((input) => input.id)).toEqual([
      'jellyfinMediaFolder',
      'jellyfinExistingMediaPath',
    ]);
  });
});
