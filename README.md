# Project OS

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
  <img src="docs/current-app-state/homePage.png" alt="Project OS home page screenshot" width="900">
</p>

Project OS is a local homelab management app for people who want the value of self-hosting without turning every app into a terminal project. It runs on a Linux host, manages apps with Docker Compose, stores state locally in SQLite, and uses Tailscale for private access when available.

Project OS should help users answer four questions quickly:

- What is installed?
- What is ready to use?
- What needs attention?
- What should I do next?

## Current Status

Project OS is ready for controlled beta testing on Linux homelab hosts. It is not yet a polished public installer.

The current beta path supports source installs and local release-bundle installs. The planned normal-user path is a GUI installer that checks the device, asks where app data should live, configures private access, and opens Project OS in the browser.

## What Project OS Does

- Discovers apps and services already running on the host.
- Installs supported catalog apps with guided install plans.
- Shows app readiness, access links, backup status, and recovery actions.
- Starts, pauses, restarts, repairs, backs up, restores, and uninstalls managed apps.
- Keeps local app data under a Project OS runtime directory.
- Uses Tailscale for private links when the host is signed in and configured.
- Preserves data by default around risky actions.

## Install Paths

### Recommended For First-Time Users

Start with the [non-technical install guide](docs/non-technical-install-guide.md). It explains the intended user flow and the current beta limitations without requiring Project OS internals.

### Beta Testers

Use the [Project OS GitHub repository](https://github.com/autark-labs/project-os/) for beta testing, source installs, release-bundle installs, updates, uninstall, and support-bundle commands.

Short source install path:

```bash
git clone https://github.com/autark-labs/project-os.git
cd project-os
./scripts/bootstrap-project-os.sh
```

On Debian, Ubuntu, and Raspberry Pi OS, the installer can attempt supported dependency setup:

```bash
./scripts/bootstrap-project-os.sh --auto-install-deps
```

Open Project OS after install:

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

Docker is required for Marketplace app installs. Tailscale is optional for local-only usage, but strongly recommended because private access is a core Project OS workflow.

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
- [Non-technical install guide](docs/non-technical-install-guide.md)
- [Beta testing repository](https://github.com/autark-labs/project-os/)
- [Local development](docs/local-development.md)
- [Marketplace runtime architecture](docs/marketplace-runtime.md)
- [Manifest authoring checklist](docs/manifest-authoring-checklist.md)
- [Service user installation](docs/service-user-installation.md)

## Known Beta Gaps

- Public download, signing, and versioned update delivery are not finished.
- GUI installer flow is planned, but the current beta primarily uses scripts and release bundles.
- Dependency automation is focused on Debian, Ubuntu, and Raspberry Pi OS.
- App catalog coverage is still early and should be tested app by app.
- Public network exposure should remain an intentional advanced workflow.

Project OS is being built as a guided runtime, not a generic infrastructure dashboard. The product should stay calm, clear, and honest about app ownership, readiness, safety, and recovery.
