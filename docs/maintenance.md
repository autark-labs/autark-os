# Maintain, repair, update, and uninstall

## Repair an app

Open **My Apps**, select the app, then choose **Manage app**. If Autark-OS shows a recovery action, review it before choosing **Repair**. Repair preserves data when possible; create a backup first when one is available.

## Update Autark-OS

Beta updates use a verified local release bundle:

```bash
autark-os update --release-bundle /absolute/path/to/autark-os-<version> --dry-run
autark-os update --release-bundle /absolute/path/to/autark-os-<version> --yes
```

The dry run shows the plan without changing the host.

## Uninstall without deleting app data

First review the plan:

```bash
autark-os uninstall --plan
```

Then remove the service and helper files while keeping apps, backups, and the local database:

```bash
autark-os uninstall
```

Only use the following command when you intend to permanently delete all app data and backups:

```bash
autark-os uninstall --remove-data --confirm-delete-data DELETE-AUTARK-OS-DATA
```
