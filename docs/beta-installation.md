# Beta Installation Guide

This guide is for beta testers and developers installing Autark-OS from GitHub Release artifacts, this repository, or a locally built release bundle.

For the intended normal-user path, start with [Install Autark-OS](./non-technical-install-guide.md). That guide describes the GUI and one-command installer flow Autark-OS is moving toward.

## Install Options

Autark-OS beta releases publish three Linux install artifacts:

- **Portable executable installer:** `Autark-OS-Installer-<version>-<arch>.run`, a terminal fallback for offline or support scenarios.
- **Debian package:** `autark-os_<version>_<arch>.deb`, the apt-based path for Debian, Ubuntu, and Raspberry Pi OS users who want package-manager installation.
- **General tarball:** `autark-os-<version>.tar.gz`, the fallback path for support, advanced users, and hosts where package installation is not desired.

Advanced source installs remain available for development.

## Requirements

Tested beta target:

- Linux host with `systemd`
- `sudo`
- Java 21
- Docker Engine with the `docker` group available
- Docker Compose v2 plugin
- Tailscale for private links and remote access workflows
- Node.js and Yarn 1.x when installing from source

Docker is required for Discover app installs. Autark-OS can run without Tailscale, but private HTTPS links will not work until Tailscale is installed, connected, and configured for the `autarkos` operator.

## Install From GitHub Release Artifacts

Download the release files from:

```text
https://github.com/autark-labs/autark-os/releases
```

Verify checksums from the folder containing the downloaded artifacts:

```bash
sha256sum -c SHA256SUMS --ignore-missing
```

### Guided Executable Installer

Use this first for normal beta testing:

```bash
chmod +x Autark-OS-Installer-<version>-amd64.run
./Autark-OS-Installer-<version>-amd64.run
```

When launched from a Linux desktop with `zenity` and a terminal available, the `.run` installer may show a graphical confirmation before terminal progress. On minimal servers or SSH sessions, it runs directly in the current terminal.

Preview host changes first:

```bash
./Autark-OS-Installer-<version>-amd64.run --dry-run
```

Extract the bundled release for support or inspection:

```bash
./Autark-OS-Installer-<version>-amd64.run --extract-only ./autark-os-release
```

### Debian Package

Use this on Debian, Ubuntu, or Raspberry Pi OS when you want apt to install the package:

```bash
sudo apt install ./autark-os_<version>_amd64.deb
```

The package installs a release payload under `/usr/lib/autark-os/release`, then runs the same service installer used by other install paths. The active service files and helper commands are installed under `/opt/autark-os`, `/etc/autark-os`, `/var/lib/autark-os`, and `/var/log/autark-os`.

### General Tarball

Use this for support, manual inspection, or non-package beta installs:

```bash
tar -xzf autark-os-<version>.tar.gz
cd autark-os-<version>
./scripts/autark-os install
```

Preview host changes first:

```bash
./scripts/autark-os install --dry-run
```

## Build Release Artifacts

Maintainers can build all GitHub-hostable artifacts with one command:

```bash
VERSION=0.1.0-beta.2

./scripts/build-release-artifacts.sh \
  --version "$VERSION" \
  --channel beta \
  --release-notes-url "https://github.com/autark-labs/autark-os/releases/tag/v$VERSION" \
  --output-dir "release/artifacts-$VERSION"
```

The output folder contains:

- `Autark-OS-Installer-<version>-<arch>.run`
- `autark-os_<version>_<arch>.deb`
- `autark-os-<version>.tar.gz`
- `autark-os-artifacts.json`
- `SHA256SUMS`
- the expanded `autark-os-<version>/` release bundle used to create the artifacts

Upload the `.run`, `.deb`, `.tar.gz`, `autark-os-artifacts.json`, and `SHA256SUMS` files to the GitHub Release.

## Install From Source

From a checked-out repository:

```bash
git clone https://github.com/autark-labs/autark-os.git
cd autark-os
./scripts/bootstrap-autark-os.sh
```

On Debian, Ubuntu, and Raspberry Pi OS, Autark-OS can attempt to install supported host dependencies:

```bash
./scripts/bootstrap-autark-os.sh --auto-install-deps
```

Preview host changes first:

```bash
./scripts/bootstrap-autark-os.sh --auto-install-deps --dry-run
```

The bootstrap script will:

- install frontend dependencies from the lockfile
- run backend tests
- build the React frontend
- package the frontend into the Spring Boot backend jar
- create the `autarkos` system user and group
- create durable host folders under `/opt/autark-os`, `/var/lib/autark-os`, `/etc/autark-os`, and `/var/log/autark-os`
- install `autark-os.service`
- install the `autark-os` helper command
- grant Docker group access to the service user when Docker is available
- configure the `autarkos` Tailscale operator when Tailscale is available and connected
- start Autark-OS on port `8082`

Open Autark-OS:

```text
http://localhost:8082
```

For a remote homelab host:

```text
http://<host-ip>:8082
```

## Install From A Local Release Bundle

Use this path when the target host should not install Node.js or Yarn.

Build a local bundle on a development machine:

```bash
./scripts/build-release-bundle.sh
```

Copy the generated `release/autark-os-<version>` folder to the target host, then install from inside the bundle:

```bash
cd /absolute/path/to/autark-os-<version>
./scripts/autark-os install --guided --auto-install-deps
```

Preview target-host changes without mutating the host:

```bash
cd /absolute/path/to/autark-os-<version>
./scripts/autark-os install --auto-install-deps --dry-run
```

Preview the install plan:

```bash
./scripts/autark-os install --plan
./scripts/autark-os install --plan --json
```

Run preinstall checks:

```bash
./scripts/autark-os install --doctor
./scripts/autark-os install --doctor --json
```

The initial supported host matrix is Debian 12, Ubuntu 22.04/24.04, and Raspberry Pi OS 12 on x86-64 or ARM64, with systemd, 2 GB memory, 10 GB free disk space, and Docker Compose v2 for app workloads. The doctor command reports `supported`, `untested`, or `unsupported` before installation changes the host.

The older bootstrap entry point still works for troubleshooting:

```bash
./scripts/bootstrap-autark-os.sh \
  --release-bundle /absolute/path/to/autark-os-<version> \
  --auto-install-deps
```

## Release Bundle Contents

A release bundle contains:

- `backend/autark-os-backend.jar`
- installer/helper scripts
- `autark-os-release.env` build metadata
- `autark-os-release.json` release metadata
- `autark-os-provenance.json` provenance placeholder
- `SHA256SUMS` checksums

Release-bundle mode verifies checksums when present, installs the prebuilt backend jar, and skips frontend dependency installation and source builds.

## Install Runtime Data On An SSD

Autark-OS stores its SQLite database, app runtime files, Docker Compose projects, backups, and generated service state under the runtime directory.

Use an SSD-backed runtime directory on small devices like Raspberry Pi hosts:

```bash
findmnt
df -h
./scripts/bootstrap-autark-os.sh --runtime-dir /mnt/autark-os-ssd/autark-os
```

Use the real mount path for the SSD. Prefer a stable mount configured in `/etc/fstab` by filesystem UUID instead of a temporary desktop auto-mount path such as `/media/<user>/<drive-name>`.

Preview the target without changing the host:

```bash
./scripts/bootstrap-autark-os.sh \
  --dry-run \
  --install-only \
  --runtime-dir /mnt/autark-os-ssd/autark-os
```

The default binary install path remains `/opt/autark-os`. If binaries should also live on the SSD:

```bash
./scripts/bootstrap-autark-os.sh \
  --runtime-dir /mnt/autark-os-ssd/autark-os \
  --install-dir /mnt/autark-os-ssd/autark-os-bin
```

## Verify The Install

Run:

```bash
autark-os doctor
autark-os doctor --json
autark-os where
autark-os status
autark-os url
```

Check the service-user setup directly:

```bash
sudo /opt/autark-os/bin/install-autark-os-service.sh --check
```

Follow backend logs:

```bash
autark-os logs
```

Useful service commands:

```bash
autark-os setup
autark-os setup --non-interactive
autark-os setup --print-next-step
autark-os start
autark-os stop
autark-os restart
autark-os version
autark-os where
autark-os port
autark-os url
```

## Support Bundle

Export a redacted support bundle when an install fails or support asks for a setup summary:

```bash
autark-os support-bundle --output ./autark-os-support.tar.gz
```

For a failed guided or release-bundle install, include installer state, release metadata, and stage logs when available:

```bash
autark-os support-bundle \
  --release-bundle /absolute/path/to/autark-os-<version> \
  --state-dir /tmp/autark-os-installer-state \
  --installer-log /var/log/autark-os/installer.log \
  --output ./autark-os-support.tar.gz
```

The bundle includes doctor results, the shared install plan, OS and disk summaries, dependency states, service status, selected installer options, and redacted config/log snippets. Tokens, auth keys, passwords, bearer tokens, and common secret values are masked before the archive is written.

## Missing Docker Or Tailscale

The installer checks for Docker and Tailscale and prints warnings when they are missing. On Debian, Ubuntu, and Raspberry Pi OS, `--auto-install-deps` can attempt supported dependency installation.

If Docker is missing, Autark-OS can still start, but Marketplace installs will fail until Docker is installed and available to the `autarkos` service user.

If Tailscale is missing or not connected, Autark-OS can still manage local apps, but private HTTPS links will not work.

After installing or connecting Tailscale, rerun:

```bash
sudo /opt/autark-os/bin/install-autark-os-service.sh
autark-os restart
```

## Update A Beta Install

Check release metadata:

```bash
autark-os update --check --metadata-url file:///absolute/path/to/autark-os-release.json
autark-os update --check --metadata-url file:///absolute/path/to/autark-os-release.json --json
```

Apply an update from a verified local release bundle:

```bash
autark-os update --release-bundle /absolute/path/to/autark-os-<version> --yes
```

Preview changes without changing the host:

```bash
autark-os update --release-bundle /absolute/path/to/autark-os-<version> --dry-run
```

Source rebuild updates remain available for development:

```bash
git pull
./scripts/bootstrap-autark-os.sh
```

## Uninstall A Beta Install

Preview the safe uninstall plan:

```bash
autark-os uninstall --plan
autark-os uninstall --plan --json
```

Remove Autark-OS service files and binaries while preserving runtime data, apps, backups, and the SQLite database:

```bash
autark-os uninstall
```

Run without changing the host:

```bash
autark-os uninstall --dry-run --yes
```

Also remove config and logs while preserving runtime data:

```bash
autark-os uninstall --remove-config --remove-logs
```

Remove all Autark-OS runtime data only when you intend to delete app data, backups, installed app records, and the SQLite database:

```bash
autark-os uninstall --remove-data --confirm-delete-data DELETE-AUTARK-OS-DATA
```

Manual cleanup remains available if the helper command is unavailable:

```bash
sudo systemctl disable --now autark-os.service
sudo rm -rf /opt/autark-os
```

The installer creates a `autarkos` system user and group. Remove them only after deleting or reassigning any files they own:

```bash
sudo userdel autarkos
sudo groupdel autarkos
```

## Known Beta Gaps

- Host dependency installation is automated only for Debian, Ubuntu, and Raspberry Pi OS apt-based hosts.
- Public download, signing, and versioned update delivery are not finished.
- Docker and Tailscale setup use their official install scripts when `--auto-install-deps` is enabled.
- Unsupported Linux distributions are still guided manually.
- App catalog coverage is early and should be tested app by app.
- Public network exposure should remain an intentional advanced workflow.
