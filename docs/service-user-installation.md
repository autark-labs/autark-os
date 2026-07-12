# Autark-OS Service And Storage Reference

This reference is for people who administer the host running Autark-OS. Normal installations create the service user, durable folders, Docker access, and systemd unit automatically. You do not need to run these commands for ordinary app use.

## Check Or Repair The Installed Service

Use the installed helper first:

```bash
autark-os doctor
autark-os status
autark-os logs
autark-os repair --plan
```

Apply the reviewed repair plan only when it addresses the problem you found:

```bash
autark-os repair --apply
```

If support directs you to rerun the underlying service installer, it is installed with Autark-OS:

```bash
sudo /opt/autark-os/bin/install-autark-os-service.sh --check
sudo /opt/autark-os/bin/install-autark-os-service.sh --dry-run
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

When Tailscale is installed, the service setup runs:

```bash
tailscale set --operator=autarkos
```

That one-time grant lets Autark-OS create Tailscale Serve HTTPS links without running the whole backend as root.

If Tailscale is missing or not connected, Autark-OS continues with local access. Install and connect Tailscale, then run `autark-os repair --plan` to review the next step.
