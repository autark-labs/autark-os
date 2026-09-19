# Runtime and storage

Autark-OS is a privileged appliance controller. The installed systemd service runs
the backend as root and calls Docker, Tailscale, and filesystem operations directly.
There is no dedicated Linux service account, sudoers rule, file-operation helper,
backup-path allowlist file, or Tailscale operator grant.

This deliberately trusts the backend with the host. Keep its administrator login
enabled, install trusted releases and catalog images, and do not expose the control
UI to the public internet. Application containers do not receive the Docker socket
or inherit the backend's root identity; their images retain their native users.

## Locations

| Purpose | Installed appliance | Source development |
| --- | --- | --- |
| Program | `/opt/autark-os` | Checkout and `backend/build/libs` |
| Runtime, database, instance identity | `/var/lib/autark-os` | `.autark-os-dev/runtime` |
| App Compose files and data | `<runtime>/apps/<app-id>` | Same layout |
| Default restore points | `<runtime>/backups` | Same layout |
| Host configuration | `/etc/autark-os/autark-os.env` | Launcher arguments |

App files retain the UID, GID, and permissions required by their image. Backups and
restores preserve those attributes. The backend can operate on them as root;
host administrators can inspect them with sudo. Do not recursively chown app data
to your desktop user or make it world-writable. Use an app's own sharing/export
features for ordinary access. Choose a durable mounted disk for appliance data.

The systemd unit uses `NoNewPrivileges`, a private temporary directory, protected
system/home/kernel paths, and a writable configuration directory. Runtime and
external backup destinations must be outside protected home/system paths.
These restrictions are not isolation from the host: access to Docker is powerful.

## Administration

```bash
autark-os where
autark-os status
sudo autark-os doctor
sudo autark-os logs
sudo autark-os admin setup-code
sudo autark-os admin reset-password
```

Claim the new installation in the browser using its local setup code. The
`config/admin-setup-code` and `config/admin-local-secret` files are secrets, not
support artifacts. Administrator sessions and mutation protections remain enabled.

Tailscale is optional. When configured, the backend manages Serve directly as root
and verifies the resulting route. No operator permission repair is necessary.

## Development reset and validation

Use [the development workflow](development.md). Build and test as your login user;
only the backend Java process is elevated. This refactor starts fresh: there is no
service-account or old-runtime migration. Do not point the new runner at an old
development database. Stop its backend and remove only that instance's identified
containers and disposable runtime when resetting. Never globally prune a shared
Docker host.

Local lifecycle checks do not replace packaged systemd and Pi validation.

The 2026-09-19 refactor was validated with a fresh root backend against real Docker:
FreshRSS and Syncthing passed install, pause/resume, backup, restore, uninstall,
and leftover-data cleanup. Syncthing stores its complete `/var/syncthing` tree in
one managed bind mount. Docker discovery reads JSON rows so multiline image
labels cannot corrupt the inventory. No previous runtime was migrated.

Remaining qualification: native sudo/systemd startup, Pi trials, and Homepage's
allowed-host configuration. Homepage can return its HTML page while rejecting
API requests for an unconfigured host; this is a catalog/access issue, not a
runtime permissions issue. See its [host configuration](https://gethomepage.dev/installation/).
