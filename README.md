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

<p align="center">
  <img src="docs/current-app-state/homePage.png" alt="Autark-OS home page screenshot" width="900">
</p>

Autark-OS is a local homelab management app for people who want the value of self-hosting without turning every app into a terminal project. It runs on a Linux host, manages apps with Docker Compose, stores state locally in SQLite, and uses Tailscale for private access when available.

Autark-OS should help users answer four questions quickly:

- What is installed?
- What is ready to use?
- What needs attention?
- What should I do next?

## Current Status

Autark-OS is ready for controlled beta testing on Linux homelab hosts. It is not yet a polished public installer.

The current beta path supports source installs and local release-bundle installs. The planned normal-user path is a GUI installer that checks the device, asks where app data should live, configures private access, and opens Autark-OS in the browser.

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

Use the [Autark-OS GitHub Releases page](https://github.com/autark-labs/project-os/releases) for beta builds.

Recommended executable installer:

```bash
chmod +x Autark-OS-Installer-<version>-amd64.run
./Autark-OS-Installer-<version>-amd64.run
```

On Linux desktops, the `.run` installer can show a graphical confirmation before opening a terminal for install progress. On servers and SSH sessions, it falls back to the guided terminal installer.

Debian/Ubuntu package install:

```bash
sudo apt install ./project-os_<version>_amd64.deb
```

General tarball install:

```bash
tar -xzf project-os-<version>.tar.gz
cd project-os-<version>
./scripts/project-os install
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

### Developers

Use the [local development guide](docs/local-development.md) for separate frontend/backend development.

Quick start:

```bash
./scripts/dev-backend.sh --auto-port
cd frontend
yarn dev
```

If the backend is not on `8082`, point the frontend at it:

```bash
PROJECT_OS_BACKEND_URL=http://localhost:8092 yarn dev
```

## Requirements

Tested beta target:

- Linux host with `systemd`
- `sudo`
- Java 21
- Docker Engine and Docker Compose v2
- Node.js and Yarn 1.x for source installs
- Tailscale for private links and remote access workflows

Docker is required for Marketplace app installs. Tailscale is optional for local-only usage, but strongly recommended because private access is a core Autark-OS workflow.

## Common Commands

Check the installed service:

```bash
project-os doctor
project-os status
project-os where
project-os url
```

Follow logs:

```bash
project-os logs
```

Create a redacted support bundle:

```bash
project-os support-bundle --output ./project-os-support.tar.gz
```

Build and test from source:

```bash
cd frontend
yarn typecheck
yarn build

cd ../backend
./gradlew test
./gradlew bootJar
```

Build release artifacts for GitHub Releases:

```bash
VERSION=0.1.0-beta.2

scripts/build-release-artifacts.sh \
  --version "$VERSION" \
  --channel beta \
  --release-notes-url "https://github.com/autark-labs/project-os/releases/tag/v$VERSION" \
  --output-dir "release/artifacts-$VERSION"
```

## Project Shape

```text
backend/       Spring Boot API, runtime services, jobs, SQLite persistence
frontend/      React, shadcn/Radix UI, app pages, repositories
catalog/       Supported app manifests, compose templates, icons
scripts/       Installer, service helper, release bundle, dev backend scripts
docs/          User guides, runtime architecture, development plans
```

## Documentation

- [Docs index](docs/README.md)
- [Contributing](CONTRIBUTING.md)
- [Non-technical install guide](docs/non-technical-install-guide.md)
- [Beta testing repository](https://github.com/autark-labs/project-os/)
- [Local development](docs/local-development.md)
- [Marketplace runtime architecture](docs/marketplace-runtime.md)
- [Manifest authoring checklist](docs/manifest-authoring-checklist.md)
- [Service user installation](docs/service-user-installation.md)

## Known Beta Gaps

- Public download hosting is through GitHub Releases for beta builds.
- The Linux `.run` installer is guided and executable, but it is not a polished native desktop wizard yet.
- Artifact signing is reserved but not finished.
- Dependency automation is focused on Debian, Ubuntu, and Raspberry Pi OS.
- App catalog coverage is still early and should be tested app by app.
- Public network exposure should remain an intentional advanced workflow.

Autark-OS is being built as a guided runtime, not a generic infrastructure dashboard. The product should stay calm, clear, and honest about app ownership, readiness, safety, and recovery.
