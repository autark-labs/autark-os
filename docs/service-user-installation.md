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

The base installer does not install Tailscale, start account sign-in, or grant operator access. Finish the base installation, then use **Access** in Autark-OS when you are ready to configure private access.

If support directs a technical administrator to configure an already installed and connected Tailscale client manually, the operator grant is:

```bash
sudo tailscale set --operator=autarkos
```

That grant lets Autark-OS create Tailscale Serve HTTPS links without running the whole backend as root. Review it before applying it; it is not part of unattended base installation.

If Tailscale is missing or not connected, Autark-OS continues with local access.
