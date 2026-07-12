# Autark-OS

<div align="center">
  <h3>A calm control center for self-hosted apps.</h3>
  <p>
    Install apps, open them from one place, keep access private, back up data, and recover when something breaks.
  </p>
  <p>
    <strong>Guided app installs</strong> · <strong>Docker Compose runtime</strong> · <strong>Tailscale private links</strong> · <strong>Backups and restore</strong>
  </p>
</div>

Autark-OS is a local homelab management app for people who want the value of self-hosting without turning every app into a terminal project. It runs on a Linux host, manages apps with Docker Compose, stores state locally in SQLite, and uses Tailscale for private access when available.

Autark-OS should help users answer four questions quickly:

- What is installed?
- What is ready to use?
- What needs attention?
- What should I do next?

## Current Status

Autark-OS is ready for controlled beta testing on Linux homelab hosts. It is not yet a polished public installer.

Supported initial hosts: Debian 12, Ubuntu 22.04/24.04, and Raspberry Pi OS 12 on x86-64 or ARM64 with systemd, 2 GB memory, and 10 GB free disk. Run `./scripts/autark-os install --doctor --json` before installing.

The current beta path supports Debian packages, portable installers, and local release bundles. After installation, open the printed local address to complete setup in your browser.

## What Autark-OS Does

- Discovers apps and services already running on the host.
- Installs supported catalog apps with guided install plans.
- Shows app readiness, access links, backup status, and recovery actions.
- Starts, pauses, restarts, repairs, backs up, restores, and uninstalls managed apps.
- Keeps local app data under an Autark-OS runtime directory.
- Uses Tailscale for private links when the host is signed in and configured.
- Preserves data by default around risky actions.

## Install Paths

### Recommended For First-Time Users

Start with the [non-technical install guide](docs/non-technical-install-guide.md). It explains the intended user flow and the current beta limitations without requiring Autark-OS internals.

### Beta Testers

Use the [Autark-OS GitHub Releases page](https://github.com/autark-labs/autark-os/releases) for beta builds.

Primary package install on a supported Debian-family host:

```bash
sudo apt install ./autark-os_<version>_amd64.deb
```

The package runs the host preflight before service setup. After it completes, open the printed local URL and finish first-run setup. Docker Engine and Docker Compose v2 must be ready before you can install catalog apps.

Direct download alternative:

```bash
chmod +x Autark-OS-Installer-<version>-amd64.run
./Autark-OS-Installer-<version>-amd64.run
```

On Linux desktops, the `.run` installer can show a graphical confirmation before opening a terminal for install progress. On servers and SSH sessions, it falls back to the guided terminal installer.

General tarball install:

```bash
tar -xzf autark-os-<version>.tar.gz
cd autark-os-<version>
./scripts/autark-os install
```

Verify downloaded artifacts:

```bash
sha256sum -c SHA256SUMS --ignore-missing
```

Open Autark-OS after install:

```text
http://localhost:8082
```

From another device on the same network:

```text
http://<host-ip>:8082
```

## Requirements

Tested beta target:

- Linux host with `systemd`
- `sudo`
- Docker Engine and Docker Compose v2
- Tailscale for private links and remote access workflows

Docker is required for Discover app installs. Tailscale is optional for local-only usage, but strongly recommended because private access is a core Autark-OS workflow.

## Common Commands

Check the installed service:

```bash
autark-os doctor
autark-os status
autark-os where
autark-os url
```

Follow logs:

```bash
autark-os logs
```

Create a redacted support bundle:

```bash
autark-os support-bundle --output ./autark-os-support.tar.gz
```

In **Diagnostics**, choose **Generate support report** to prepare a redacted plain-text report. Use **Download report** to save a `.txt` file, **Copy report** to place it on the clipboard, or **View technical logs** to expand recent redacted logs.

## Project Shape

```text
backend/       Spring Boot API, runtime services, jobs, SQLite persistence
frontend/      React user interface
catalog/       Supported app definitions, install templates, and icons
scripts/       Installer, service helper, and release bundle tools
docs/          Installation, operation, recovery, and technical-admin guides
```

## Documentation

- [Docs index](docs/README.md)
- [Contributing](CONTRIBUTING.md)
- [Non-technical install guide](docs/non-technical-install-guide.md)
- [First run](docs/first-run.md)
- [Portable and offline installation](docs/offline-install.md)
- [Backups and recovery](docs/backups-and-recovery.md)
- [Maintenance](docs/maintenance.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Technical installation](docs/technical-installation.md)
- [Service and storage reference](docs/service-user-installation.md)

## Known Beta Gaps

- Public download hosting is through GitHub Releases for beta builds.
- The Linux `.run` installer is guided and executable, but it is not a polished native desktop wizard yet.
- Artifact signing is reserved but not finished.
- Dependency automation is focused on Debian, Ubuntu, and Raspberry Pi OS.
- App catalog coverage is still early and should be tested app by app.
- Public network exposure should remain an intentional advanced workflow.

Autark-OS is being built as a guided runtime, not a generic infrastructure dashboard. The product should stay calm, clear, and honest about app ownership, readiness, safety, and recovery.
