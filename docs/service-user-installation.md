# Autark-OS Service User Installation

Autark-OS should run as a stable system service user on homelab hosts. The bootstrap script creates that user, prepares durable host directories, grants Docker/Tailscale access when available, and installs a systemd unit.

## Script

From the repository root:

```bash
sudo ./scripts/install-autark-os-service.sh
```

The script is idempotent and safe to rerun. It preserves `/var/lib/autark-os`.
After the first successful run, the setup script is also installed at `/opt/autark-os/bin/install-autark-os-service.sh`, so Autark-OS can show a stable repair command later:

```bash
sudo /opt/autark-os/bin/install-autark-os-service.sh
```

The installer also installs a helper command:

```bash
autark-os doctor
autark-os status
autark-os logs
autark-os version
```

Useful modes:

```bash
sudo ./scripts/install-autark-os-service.sh --dry-run
sudo ./scripts/install-autark-os-service.sh --check
sudo ./scripts/install-autark-os-service.sh --no-start
```

Install runtime data on a specific disk or mount:

```bash
sudo ./scripts/install-autark-os-service.sh \
  --runtime-dir /mnt/autark-os-ssd/autark-os
```

The runtime directory contains the SQLite database, app runtime files, generated Docker Compose projects, backups, and service state. Use an absolute path on a stable mount. For Raspberry Pi installs, prefer an SSD mounted by UUID in `/etc/fstab` rather than a removable desktop auto-mount path.

Additional path overrides:

```bash
sudo ./scripts/install-autark-os-service.sh \
  --runtime-dir /mnt/autark-os-ssd/autark-os \
  --install-dir /mnt/autark-os-ssd/autark-os-bin \
  --log-dir /mnt/autark-os-ssd/autark-os-logs
```

## What It Creates

- System user/group: `autarkos`
- Runtime directory: `/var/lib/autark-os`
- Config directory: `/etc/autark-os`
- Log directory: `/var/log/autark-os`
- Install directory: `/opt/autark-os`
- Systemd unit: `/etc/systemd/system/autark-os.service`
- Helper command: `/opt/autark-os/bin/autark-os`

These defaults can be changed with `--runtime-dir`, `--install-dir`, `--config-dir`, and `--log-dir`. Rerunning the installer with the same flags updates the systemd unit and environment file in place.

The installer writes version/build metadata to `/etc/autark-os/autark-os.env`. `autark-os version` reads the live backend when it is reachable and falls back to that env file when the service is stopped.

## Tailscale

When Tailscale is installed, the script runs:

```bash
tailscale set --operator=autarkos
```

That one-time grant lets Autark-OS create Tailscale Serve HTTPS links without running the whole backend as root.

If Tailscale is missing or not connected, the script prints a warning and continues. Install/connect Tailscale, then rerun the script.

## Backend Artifact

The script looks for a built backend jar in:

```bash
backend/build/libs/*.jar
```

You can also pass one explicitly:

```bash
sudo AUTARK_OS_BACKEND_JAR=/path/to/autark-os.jar ./scripts/install-autark-os-service.sh
```

If no jar exists, the service unit is installed but not started.
