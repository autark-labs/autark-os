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

Managed application updates are currently unavailable. This is intentional:
Autark-OS will not offer an update until it can preserve each app's saved
settings, storage, access configuration, secrets, and recovery state through a
reversible update process.

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
