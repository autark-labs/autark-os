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

## Privilege Boundary And Service Hardening

Autark-OS runs the backend as the unprivileged `autarkos` system user. Its runtime data and logs are writable to that user; program files, the backend JAR, the systemd unit, the sudoers rule, and host configuration are owned by `root` and are not writable by `autarkos`.

Autark-OS needs Docker access to manage supported apps. On standard Docker installations, membership in the `docker` group is effectively host-administrative access. Treat anyone who can control the Autark-OS backend or its catalog images as trusted to administer this host. Ordinary managed app containers do not receive the Docker socket or Autark-OS file helper.

The systemd service uses a private temporary directory, read-only system paths, protected home/kernel/control-group settings, a restricted network socket list, a cleared capability set, a restrictive umask, and explicit writable runtime, log, and configuration paths. The configuration exception is only for the root-owned approved-backup destination record.

`NoNewPrivileges`, `RestrictSUIDSGID`, and `MemoryDenyWriteExecute` remain disabled for now. The first two would prevent the service from invoking the bounded root helper through `sudo`; the last would prevent the Java runtime from using its normal just-in-time compiler. The helper is root-owned, its checksum is recorded during installation, and it accepts only named operations and managed runtime/approved backup paths; it cannot run arbitrary commands. This is intentionally a narrow exception until the helper can be replaced by a dedicated root service with a more restrictive interface.

Run this after an upgrade or if you suspect local permission changes:

```bash
sudo /opt/autark-os/bin/install-autark-os-service.sh --check
```

If it reports hardening or ownership drift, rerun the same installer with your normal installation paths. Do not manually loosen the unit, sudoers file, or `/opt/autark-os` permissions to work around an app problem; use Diagnostics or support guidance instead.

The reviewed hardening profile requires systemd 247 or newer. The installer checks that before changing service files, so an unsupported host leaves its current install in place for normal update rollback or recovery. Use a supported Debian, Ubuntu, or Raspberry Pi OS release rather than manually removing hardening directives.

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
