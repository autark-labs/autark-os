import assert from 'node:assert/strict';
import test from 'node:test';
import { restorePointDetails } from '../BackupsPage.restoreDetails.js';

test('summarizes full restore points with included app names and checksum', () => {
  const details = restorePointDetails({
    id: 1,
    appId: 'full',
    appName: 'Full backup',
    scope: 'full',
    includedAppIds: 'vaultwarden,jellyfin',
    verificationStatus: 'verified',
    restoreConfidence: 'high',
    checksumSha256: 'abc123',
    path: '/var/lib/project-os/backups/1.zip',
  }, [
    { appId: 'vaultwarden', appName: 'Vaultwarden' },
    { appId: 'jellyfin', appName: 'Jellyfin' },
  ]);

  assert.deepEqual(details.includedApps, ['Vaultwarden', 'Jellyfin']);
  assert.equal(details.checksum, 'abc123');
  assert.match(details.verification, /Verified/);
});
