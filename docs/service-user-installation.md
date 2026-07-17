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

The installer writes version/build metadata to `/etc/autark-os/autark-os.env`. `autark-os version` reads the live backend when it is reachable and falls back to that env file when the service is stopped. The service check also compares that metadata with the backend JAR that is actually installed. If it reports a release-identity mismatch, run `sudo autark-os update` to replace the installed files from a verified release, or ask support to review the output.

## Local Administrator Credentials

The backend creates two owner-readable files under the runtime `config` folder:

- `admin-setup-code` exists only while the appliance is unclaimed. `sudo autark-os admin setup-code` reads it without exposing it through the API.
- `admin-local-secret` authenticates the loopback-only root password-reset call. It is not an administrator password and must never be copied into support output.

Both files use mode `0600`. The setup code is stored as a one-way hash in the database and its local file is deleted after claim. Browser and CLI session tokens are stored only as hashes in backend memory, so a service restart intentionally ends all sessions.

Use `sudo autark-os admin reset-password` for recovery. The CLI must run as root, reads the local recovery credential, calls the loopback endpoint, and revokes active sessions without changing runtime data.

## Tailscale

The base installer does not install Tailscale or sign the server into an account. Finish the base installation, then use **Access** in Autark-OS when you are ready to configure private access.

When an app first needs a private link, Autark-OS checks the live Tailscale Serve configuration. If the `autarkos` service user does not have Serve permission, Autark-OS uses its installed, tightly limited administrator helper to assign that permission and retries the link. The backend itself continues to run without root privileges. A private URL is shown as ready only after the live HTTPS endpoint points to the app's expected local port.

If support directs a technical administrator to configure an already installed and connected Tailscale client manually, the operator grant is:

```bash
sudo tailscale set --operator=autarkos
```

That grant lets Autark-OS create Tailscale Serve HTTPS links without running the whole backend as root. It is the manual recovery command if the automatic permission step is unavailable.

If Tailscale is missing or not connected, Autark-OS continues with local access.
