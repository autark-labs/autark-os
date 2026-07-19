# Maintain, repair, update Autark-OS, and uninstall

## Repair an app

Open **My Apps**, select the app, then choose **Manage app**. If Autark-OS shows a recovery action, review it before choosing **Repair**. Repair preserves data when possible; create a backup first when one is available.

## Update Autark-OS

Run the unified updater for a normal update:

```bash
autark-os update
```

It checks the installed stable or beta channel, shows the update plan, asks for
confirmation, downloads the correct build for this device, verifies it, creates
a recovery snapshot, installs it, and checks that Autark-OS is healthy. If the
new release does not become healthy, Autark-OS restores the previous program,
configuration, service, and local database automatically.

You can run each part separately when troubleshooting or automating a host:

```bash
autark-os update check
autark-os update plan
autark-os update apply
autark-os update status
```

`autark-os update --check` remains available as an older spelling of
`autark-os update check`.

To apply an installer or release bundle supplied by Autark Labs, extract it and
use the same update engine:

```bash
./Autark-OS-Installer-<version>-arm64.run --extract-only "$HOME/autark-os-update"
autark-os update --release-bundle "$HOME/autark-os-update"
```

Use `amd64` instead of `arm64` on an Intel or AMD server. You can also run a
new portable installer normally. If it finds Autark-OS, it starts this update
flow instead of performing an unrelated second installation.

The most recent recovery snapshot can be restored manually when support asks
you to do so:

```bash
autark-os update rollback
```

Application updates are separate. Updating Autark-OS does not silently update
Vaultwarden, Jellyfin, or other managed applications.

## Update or roll back a managed app

Open **My Apps**, select a managed app, and open **Manage app**. In the
**Overview** tab, use **Review update** to see the current release, target
release, safety steps, and any reason the update is blocked. Autark-OS does not
update managed apps silently.

The current managed update path is deliberately narrow:

- The catalog release may change container images, but not ports, storage
  mappings, environment, service topology, access layout, or backup contracts.
- Saved ports, storage choices, access settings, backup policy, generated
  secrets, and application data remain unchanged by an eligible image update.
- The app must be owned by this Autark-OS instance and healthy before the
  release change starts.
- Backups must be enabled and the configured backup destination must be ready.
- Autark-OS creates and verifies a safety checkpoint before applying the
  release.
- Current and target images are resolved to immutable digests.
- The previous Compose file, manifest, metadata, and image identities are kept
  as a release snapshot.
- If the target release fails verification, Autark-OS restores the saved
  release automatically and records the result in Activity.

Health verification is conservative during beta. If a target release is not
ready when Autark-OS checks it, the saved release is restored. Review Activity
or Diagnostics before retrying a rolled-back release.

After a successful managed update, choose the rollback control beside
**Review update** to review the retained previous release. Rollback creates a
fresh verified safety checkpoint before restoring it. A rollback is available
only when Autark-OS has a retained release snapshot.

An update plan is blocked when the catalog requires a settings or data
migration. This is a safety boundary, not a repair failure. Keep using the
current release until Autark-OS provides a migration-specific plan.

## Uninstall without deleting app data

First review the plan:

```bash
autark-os uninstall --plan
```

Then remove the service and helper files while keeping apps, backups, and the local database:

```bash
autark-os uninstall
```

This also removes the Autark-OS systemd unit, command link, privileged file
helper rule, and installed program files. Docker and Tailscale are preserved
because other software on the server may use them. Managed app containers are
not silently deleted; remove an app from **My Apps** first when you also want
its containers stopped and removed.

Only use the following command when you intend to permanently delete all app data and backups:

```bash
autark-os uninstall --remove-data --confirm-delete-data DELETE-AUTARK-OS-DATA
```

Even this command does not guess that unrelated Docker volumes belong to
Autark-OS. Review Docker resources separately if app data was stored in a named
volume outside the Autark-OS runtime folder.
