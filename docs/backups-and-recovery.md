# Backups and recovery

Use **Backups** before making a major app change. An app is protected only when it has a completed, verified restore point.

## Choose where backups are stored

By default, Autark-OS stores restore points on the same drive as the appliance. This is useful for recovering from an app mistake, but it cannot protect against failure of that drive.

For drive-failure protection, connect and mount an external drive first, then open **Settings → Backups** and enter a dedicated folder such as `/mnt/backup-drive/autark-os-backups`. Autark-OS checks that the folder is absolute, writable, has enough free space, is not a symbolic link or system folder, and is on a different mounted filesystem from Autark-OS.

Keep the drive connected while backups run. If it is disconnected, Autark-OS marks the destination as needing attention and pauses new backups. It never silently falls back to internal storage. Reconnect the same drive at the same mount location, then open **Backups** or **Settings → Backups** to confirm it is ready again.

Before safely removing an external drive, wait for any active backup or restore job to finish. Use the operating system’s normal unmount/eject action; do not unplug it while the drive is being written.

## Create a backup

1. Open **Backups**.
2. Under **Create a manual backup**, choose the smallest scope that covers the change you are about to make.
3. Wait for the job to finish, then confirm that the new restore point is verified.

## Restore safely

1. Open **Backups** and find the restore point.
2. Choose **Details** and review what will be restored.
3. Choose **Restore app** or **Restore all**, review the plan, then choose **Restore now**.

Restoring stops affected apps while data is replaced. Autark-OS shows the plan before it changes anything.

## If a backup or restore fails

Open **Diagnostics**, choose **Generate support report**, and keep the redacted report for support. Do not delete the restore point or app data while investigating.
