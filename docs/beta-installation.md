# Beta Installation Guide

This guide is for beta testers and developers installing Project OS from this repository or from a locally built release bundle.

For the intended normal-user path, start with [Install Project OS](./non-technical-install-guide.md). That guide describes the GUI and one-command installer flow Project OS is moving toward.

## Install Options

Project OS is moving toward three install paths:

- **GUI installer:** the intended non-technical path. Planned, not yet available as a public beta artifact.
- **One-command installer:** the intended remote-support and terminal path. The public download URL is planned.
- **Advanced CLI install:** the current beta path from source or a local release bundle.

## Requirements

Tested beta target:

- Linux host with `systemd`
- `sudo`
- Java 21
- Docker Engine with the `docker` group available
- Docker Compose v2 plugin
- Tailscale for private links and remote access workflows
- Node.js and Yarn 1.x when installing from source

Docker is required for Marketplace app installs. Project OS can run without Tailscale, but private HTTPS links will not work until Tailscale is installed, connected, and configured for the `projectos` operator.

## Install From Source

From a checked-out repository:

```bash
git clone https://github.com/autark-labs/project-os.git
cd project-os
./scripts/bootstrap-project-os.sh
```

On Debian, Ubuntu, and Raspberry Pi OS, Project OS can attempt to install supported host dependencies:

```bash
./scripts/bootstrap-project-os.sh --auto-install-deps
```

Preview host changes first:

```bash
./scripts/bootstrap-project-os.sh --auto-install-deps --dry-run
```

The bootstrap script will:

- install frontend dependencies from the lockfile
- run backend tests
- build the React frontend
- package the frontend into the Spring Boot backend jar
- create the `projectos` system user and group
- create durable host folders under `/opt/project-os`, `/var/lib/project-os`, `/etc/project-os`, and `/var/log/project-os`
- install `project-os.service`
- install the `project-os` helper command
- grant Docker group access to the service user when Docker is available
- configure the `projectos` Tailscale operator when Tailscale is available and connected
- start Project OS on port `8082`

Open Project OS:

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

Copy the generated `release/project-os-<version>` folder to the target host, then install from inside the bundle:

```bash
cd /absolute/path/to/project-os-<version>
./scripts/project-os install --guided --auto-install-deps
```

Preview target-host changes without mutating the host:

```bash
cd /absolute/path/to/project-os-<version>
./scripts/project-os install --auto-install-deps --dry-run
```

Preview the install plan:

```bash
./scripts/project-os install --plan
./scripts/project-os install --plan --json
```

Run preinstall checks:

```bash
./scripts/project-os install --doctor
./scripts/project-os install --doctor --json
```

The older bootstrap entry point still works for troubleshooting:

```bash
./scripts/bootstrap-project-os.sh \
  --release-bundle /absolute/path/to/project-os-<version> \
  --auto-install-deps
```

## Release Bundle Contents

A release bundle contains:

- `backend/project-os-backend.jar`
- installer/helper scripts
- `project-os-release.env` build metadata
- `project-os-release.json` release metadata
- `project-os-provenance.json` provenance placeholder
- `SHA256SUMS` checksums

Release-bundle mode verifies checksums when present, installs the prebuilt backend jar, and skips frontend dependency installation and source builds.

## Install Runtime Data On An SSD

Project OS stores its SQLite database, app runtime files, Docker Compose projects, backups, and generated service state under the runtime directory.

Use an SSD-backed runtime directory on small devices like Raspberry Pi hosts:

```bash
findmnt
df -h
./scripts/bootstrap-project-os.sh --runtime-dir /mnt/project-os-ssd/project-os
```

Use the real mount path for the SSD. Prefer a stable mount configured in `/etc/fstab` by filesystem UUID instead of a temporary desktop auto-mount path such as `/media/<user>/<drive-name>`.

Preview the target without changing the host:

```bash
./scripts/bootstrap-project-os.sh \
  --dry-run \
  --install-only \
  --runtime-dir /mnt/project-os-ssd/project-os
```

The default binary install path remains `/opt/project-os`. If binaries should also live on the SSD:

```bash
./scripts/bootstrap-project-os.sh \
  --runtime-dir /mnt/project-os-ssd/project-os \
  --install-dir /mnt/project-os-ssd/project-os-bin
```

## Verify The Install

Run:

```bash
project-os doctor
project-os doctor --json
project-os where
project-os status
project-os url
```

Check the service-user setup directly:

```bash
sudo /opt/project-os/bin/install-project-os-service.sh --check
```

Follow backend logs:

```bash
project-os logs
```

Useful service commands:

```bash
project-os setup
project-os setup --non-interactive
project-os setup --print-next-step
project-os start
project-os stop
project-os restart
project-os version
project-os where
project-os port
project-os url
```

## Support Bundle

Export a redacted support bundle when an install fails or support asks for a setup summary:

```bash
project-os support-bundle --output ./project-os-support.tar.gz
```

For a failed guided or release-bundle install, include installer state, release metadata, and stage logs when available:

```bash
project-os support-bundle \
  --release-bundle /absolute/path/to/project-os-<version> \
  --state-dir /tmp/project-os-installer-state \
  --installer-log /var/log/project-os/installer.log \
  --output ./project-os-support.tar.gz
```

The bundle includes doctor results, the shared install plan, OS and disk summaries, dependency states, service status, selected installer options, and redacted config/log snippets. Tokens, auth keys, passwords, bearer tokens, and common secret values are masked before the archive is written.

## Missing Docker Or Tailscale

The installer checks for Docker and Tailscale and prints warnings when they are missing. On Debian, Ubuntu, and Raspberry Pi OS, `--auto-install-deps` can attempt supported dependency installation.

If Docker is missing, Project OS can still start, but Marketplace installs will fail until Docker is installed and available to the `projectos` service user.

If Tailscale is missing or not connected, Project OS can still manage local apps, but private HTTPS links will not work.

After installing or connecting Tailscale, rerun:

```bash
sudo /opt/project-os/bin/install-project-os-service.sh
project-os restart
```

## Update A Beta Install

Check release metadata:

```bash
project-os update --check --metadata-url file:///absolute/path/to/project-os-release.json
project-os update --check --metadata-url file:///absolute/path/to/project-os-release.json --json
```

Apply an update from a verified local release bundle:

```bash
project-os update --release-bundle /absolute/path/to/project-os-<version> --yes
```

Preview changes without changing the host:

```bash
project-os update --release-bundle /absolute/path/to/project-os-<version> --dry-run
```

Source rebuild updates remain available for development:

```bash
git pull
./scripts/bootstrap-project-os.sh
```

## Uninstall A Beta Install

Preview the safe uninstall plan:

```bash
project-os uninstall --plan
project-os uninstall --plan --json
```

Remove Project OS service files and binaries while preserving runtime data, apps, backups, and the SQLite database:

```bash
project-os uninstall
```

Run without changing the host:

```bash
project-os uninstall --dry-run --yes
```

Also remove config and logs while preserving runtime data:

```bash
project-os uninstall --remove-config --remove-logs
```

Remove all Project OS runtime data only when you intend to delete app data, backups, installed app records, and the SQLite database:

```bash
project-os uninstall --remove-data --confirm-delete-data DELETE-PROJECT-OS-DATA
```

Manual cleanup remains available if the helper command is unavailable:

```bash
sudo systemctl disable --now project-os.service
sudo rm -rf /opt/project-os
```

The installer creates a `projectos` system user and group. Remove them only after deleting or reassigning any files they own:

```bash
sudo userdel projectos
sudo groupdel projectos
```

## Known Beta Gaps

- Host dependency installation is automated only for Debian, Ubuntu, and Raspberry Pi OS apt-based hosts.
- Public download, signing, and versioned update delivery are not finished.
- Docker and Tailscale setup use their official install scripts when `--auto-install-deps` is enabled.
- Unsupported Linux distributions are still guided manually.
- App catalog coverage is early and should be tested app by app.
- Public network exposure should remain an intentional advanced workflow.
