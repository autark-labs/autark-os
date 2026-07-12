# Technical Installation Reference

This guide is for a technically comfortable home-server administrator. It explains the release artifacts, host checks, installed paths, and recovery commands. For a guided first install, use [Install Autark-OS](./non-technical-install-guide.md).

## Supported Hosts

The current beta supports these Linux hosts:

- Debian 12
- Ubuntu 22.04 or 24.04
- Raspberry Pi OS 12

The host needs systemd, `sudo`, 2 GB of memory, 10 GB of free disk space, and a supported x86-64 or ARM64 processor. Docker Engine and Docker Compose v2 are required before installing apps from **Discover**. Tailscale is optional; it enables private access from trusted devices.

Before installation, run the preflight from an extracted release bundle when one is available:

```bash
./scripts/autark-os install --doctor --json
```

The result identifies the host as supported, untested, or unsupported before the installer changes it.

## Choose A Release Artifact

| Artifact | Best for |
| --- | --- |
| `autark-os_<version>_<arch>.deb` | Debian-family systems using the package manager. |
| `Autark-OS-Installer-<version>-<arch>.run` | Guided terminal installation, support-assisted installs, or portable media. |
| `autark-os-<version>.tar.gz` | Manual inspection or environments where a package is not appropriate. |

Download the artifact and `SHA256SUMS` from the Autark-OS release page. Verify the files before running them:

```bash
sha256sum -c SHA256SUMS --ignore-missing
```

Do not continue if a checksum fails.

## Install

### Debian Package

```bash
sudo apt install ./autark-os_<version>_amd64.deb
```

### Portable Installer

```bash
chmod +x Autark-OS-Installer-<version>-amd64.run
./Autark-OS-Installer-<version>-amd64.run
```

Preview the host changes first when you want to review them:

```bash
./Autark-OS-Installer-<version>-amd64.run --dry-run
```

### Tarball

```bash
tar -xzf autark-os-<version>.tar.gz
cd autark-os-<version>
./scripts/autark-os install
```

For an air-gapped or copied release, follow [Portable and offline installation](./offline-install.md).

## Installed Paths

The normal installation keeps application data separate from program files:

| Location | Purpose |
| --- | --- |
| `/opt/autark-os` | Installed helper scripts and program files. |
| `/etc/autark-os` | Service configuration and version metadata. |
| `/var/lib/autark-os` | SQLite data, app runtime files, backups, and restore points. |
| `/var/log/autark-os` | Service logs. |
| `/etc/systemd/system/autark-os.service` | The systemd service unit. |

For long-running installations, place the runtime directory on a stable SSD mount. Avoid desktop auto-mount paths that may disappear after a reboot. Review the proposed storage location during guided installation; see [Service and storage reference](./service-user-installation.md) for the service model.

## Verify And Operate

After installation, use the installed helper:

```bash
autark-os doctor
autark-os status
autark-os url
autark-os version
```

Open the URL printed by `autark-os url`, complete [First run](./first-run.md), and use **Discover** to install supported apps.

If the service needs attention, review the plan before applying changes:

```bash
autark-os repair --plan
autark-os repair --apply
```

For beta updates, safe uninstall, and recovery guidance, see [Maintenance](./maintenance.md). For service or storage details, see [Service and storage reference](./service-user-installation.md).
