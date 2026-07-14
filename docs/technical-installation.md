# Technical Installation Reference

This guide is for a technically comfortable home-server administrator. It explains the release artifacts, host checks, installed paths, and recovery commands. For a guided first install, use [Install Autark-OS](./non-technical-install-guide.md).

## Supported Hosts

The current beta supports these Linux hosts:

- Debian 12 or 13 on amd64 or ARM64
- Ubuntu 24.04 or 26.04 LTS on amd64 or ARM64
- Raspberry Pi OS 13 Trixie or 12 Bookworm, 64-bit, on a Raspberry Pi 5 or compatible Pi
- Raspberry Pi OS 11 Bullseye, 64-bit, on compatible older Pi hardware

Raspberry Pi OS 11 is not a Pi 5 target. Raspberry Pi OS 13 is the recommended Pi 5 release, with Pi OS 12 retained for existing installations.

The host needs systemd, `sudo`, 2 GB of memory, 10 GB of free disk space, and a supported 64-bit amd64 or ARM64 userspace. Docker Engine and Docker Compose v2 are required before installing apps from **Discover**. Tailscale is optional; it enables private access from trusted devices.

Before installation, run the preflight from an extracted release bundle when one is available:

```bash
./scripts/autark-os install --doctor --json
```

The result identifies the host as supported, untested, or unsupported before the installer changes it.

## Choose A Release Artifact

| Artifact | Best for |
| --- | --- |
| `Autark-OS-Installer-<version>-<arch>.run` | Recommended guided install with automatic dependency setup. |
| `autark-os_<version>_<arch>.deb` | Advanced package-managed install when Docker is already managed. |
| `autark-os-<version>-<arch>.tar.gz` | Manual inspection or environments where a package is not appropriate. |

Download the artifact and `SHA256SUMS` from the Autark-OS release page. Verify the files before running them:

```bash
sha256sum -c SHA256SUMS --ignore-missing
```

Do not continue if a checksum fails.

## Install

### Portable Installer (Recommended)

```bash
chmod +x Autark-OS-Installer-<version>-amd64.run
./Autark-OS-Installer-<version>-amd64.run
```

Use `arm64` instead of `amd64` for a 64-bit Raspberry Pi or ARM server. The package, portable installer, tarball, bundled Java runtime, and release metadata are built separately for each architecture. Installation stops before host changes if they do not match.

The portable installer verifies its embedded release before privilege escalation. After install confirmation, it requests administrator approval once and keeps the dependency and service mutation phase elevated. On a clean host it configures Docker's official Debian or Ubuntu apt repository and installs `docker-ce`, `docker-ce-cli`, `containerd.io`, `docker-buildx-plugin`, and `docker-compose-plugin` as one package family. A working existing Docker Engine and Compose v2 installation is preserved.

The installer never removes a conflicting Docker, Podman, `containerd`, or `runc` installation automatically. It stops with the detected package names so an administrator can review the system intentionally.

### Debian Package (Advanced)

```bash
sudo apt install ./autark-os_<version>_amd64.deb
```

The `.deb` installs the base service but deliberately does not add a third-party Docker repository from a package maintainer script. Ensure `docker info` and `docker compose version` work before using **Discover**, or use the portable installer for automatic Docker setup.

Preview portable-installer host changes first when you want to review them:

```bash
./Autark-OS-Installer-<version>-amd64.run --dry-run
```

### Tarball

```bash
tar -xzf autark-os-<version>-<arch>.tar.gz
cd autark-os-<version>-<arch>
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

The success handoff prints both `http://localhost:<port>` and a LAN address. A real installation also writes resumable state to `/var/lib/autark-os/installer/installer-state.json` and an append-only terminal log to `/var/lib/autark-os/installer/installer.log`. A failed install names its stage and can be retried with the same installer and options.

Open the URL printed by `autark-os url`, complete [First run](./first-run.md), and use **Discover** to install supported apps.

If the service needs attention, review the plan before applying changes:

```bash
autark-os repair --plan
autark-os repair --apply
```

For beta updates, safe uninstall, and recovery guidance, see [Maintenance](./maintenance.md). For service or storage details, see [Service and storage reference](./service-user-installation.md).
