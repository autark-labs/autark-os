# Project OS

Project OS is a local homelab management app for discovering, installing, monitoring, repairing, backing up, and privately exposing self-hosted services.

It currently runs as a single Spring Boot backend that serves both the API and the built React frontend. Installed apps are managed locally with Docker Compose, state is stored in SQLite under the Project OS runtime directory, and private access is designed around Tailscale.

## Beta Status

Project OS is ready for controlled beta testing on a Linux homelab host where the tester is comfortable running a few terminal commands.

It is not yet a polished public installer. The repo installer builds from this repository and expects developer tooling. A local release-bundle path is available for beta installs that should not require Node.js or Yarn on the target host.

## Choose Your Install Option

Project OS is moving toward three installation paths. They share the same service installer and host checks, but they are meant for different users.

For the normal-user path, start with the [non-technical install guide](docs/non-technical-install-guide.md).

### Option 1: GUI Installer

Recommended for non-technical users.

This is the target normal-user experience: download an installer, let Project OS check the device, choose storage and private access with guided screens, then open Project OS in the browser. This path is planned, not yet available in the beta repository.

### Option 2: One-Command CLI Installer

Recommended for guided docs, support sessions, and remote terminal installs.

This is the target command-line experience:

```bash
curl -fsSL https://install.project-os.dev | bash
```

This path should download a signed release artifact, verify it, install supported dependencies with confirmation, install Project OS, run doctor checks, and print the browser URL. This public download path is planned. The current beta approximation is the local release-bundle install below.

### Option 3: Advanced CLI Installer

Recommended for beta testers, developers, and scripted installs.

This path uses the checked-out repository or a locally built release bundle. It is the currently supported beta path and may require terminal troubleshooting.

## Requirements

Tested target environment:

- Linux host with `systemd`
- `sudo`
- Java 21
- Node.js
- Yarn 1.x
- Docker Engine with the `docker` group available
- Docker Compose v2 plugin
- Tailscale, optional but strongly recommended for private HTTPS app links

Docker is required for Marketplace app installs. Tailscale is required for private links and remote access workflows.

## Production-Like Beta Install From Source

Advanced CLI path.

From a checked-out repository:

```bash
git clone <project-os-repo-url>
cd project-os-v2
./scripts/bootstrap-project-os.sh
```

On Debian, Ubuntu, and Raspberry Pi OS, Project OS can also attempt to install supported host dependencies first:

```bash
./scripts/bootstrap-project-os.sh --auto-install-deps
```

This path installs or configures Java 21, Docker, Docker Compose support, Tailscale, the Project OS service user, and the systemd service where supported. Unsupported Linux distributions should use the normal dependency guidance for now. Preview host mutations first with:

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

## Beta Release-Bundle Install

One-command CLI preview path for beta testers.

For a target host where you do not want to install Node.js or Yarn, build a local release bundle on a development machine:

```bash
./scripts/build-release-bundle.sh
```

Copy the generated `release/project-os-<version>` folder to the target host, then install from the bundle:

```bash
cd /absolute/path/to/project-os-<version>
./scripts/project-os install --guided --auto-install-deps
```

Preview the same target-host changes without mutating the host:

```bash
cd /absolute/path/to/project-os-<version>
./scripts/project-os install --auto-install-deps --dry-run
```

The older script entry point still works for beta troubleshooting:

```bash
./scripts/bootstrap-project-os.sh --release-bundle /absolute/path/to/project-os-<version> --auto-install-deps
```

The release bundle contains:

- `backend/project-os-backend.jar`
- installer/helper scripts
- `project-os-release.env` build metadata
- `project-os-release.json` release metadata
- `project-os-provenance.json` provenance placeholder
- `SHA256SUMS` checksums

Release-bundle mode verifies checksums when present, installs the prebuilt backend jar, and skips frontend dependency installation and source builds.

Preview the shared install plan without changing the target host:

```bash
cd /absolute/path/to/project-os-<version>
./scripts/project-os install --plan
./scripts/project-os install --plan --json
```

The install plan includes a storage section with mounted drive candidates, a recommended runtime path when a suitable external drive is detected, and warnings for likely unstable desktop auto-mount paths such as `/media/<user>/<drive>`.

Check the target host before installation:

```bash
cd /absolute/path/to/project-os-<version>
./scripts/project-os install --doctor
./scripts/project-os install --doctor --json
```

For support or resumable installer experiments, write explicit installer state to a safe directory:

```bash
./scripts/bootstrap-project-os.sh --release-bundle /absolute/path/to/project-os-<version> --plan --state-dir /tmp/project-os-installer-state
```

Preview the public-installer flow against a local release bundle:

```bash
./scripts/install-project-os.sh \
  --release-url file:///absolute/path/to/project-os-<version> \
  --dry-run \
  --yes
```

Run the public-installer preview in guided mode:

```bash
./scripts/install-project-os.sh \
  --release-url file:///absolute/path/to/project-os-<version> \
  --dry-run
```

Technical implementation details for the installer live in [Installer Technical Implementation](docs/installer-technical-implementation.md).

Open Project OS:

```text
http://localhost:8082
```

For a remote homelab host, use:

```text
http://<host-ip>:8082
```

## Install Runtime Data On An SSD

Project OS stores its SQLite database, app runtime files, Docker Compose projects, backups, and generated service state under the runtime directory. Use an SSD-backed runtime directory on small devices like a Raspberry Pi:

```bash
findmnt
df -h
./scripts/bootstrap-project-os.sh --runtime-dir /mnt/project-os-ssd/project-os
```

Use the actual mount path for your SSD. Prefer a stable mount configured in `/etc/fstab` by filesystem UUID instead of a temporary desktop auto-mount path such as `/media/<user>/<drive-name>`.

You can preview the target without changing the host:

```bash
./scripts/bootstrap-project-os.sh --dry-run --install-only --runtime-dir /mnt/project-os-ssd/project-os
```

The default binary install path remains `/opt/project-os`. If you also want binaries on the SSD:

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
```

You can also check the service-user setup directly:

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

Export a redacted installer/setup support bundle when an install fails or when support asks for a setup summary:

```bash
project-os support-bundle --output ./project-os-support.tar.gz
```

For a failed guided or release-bundle install, include the installer state, release metadata, and stage log when you have them:

```bash
project-os support-bundle \
  --release-bundle /absolute/path/to/project-os-<version> \
  --state-dir /tmp/project-os-installer-state \
  --installer-log /var/log/project-os/installer.log \
  --output ./project-os-support.tar.gz
```

The bundle includes doctor results, the shared install plan, OS and disk summaries, dependency states, service status, selected installer options, and redacted config/log snippets. Tokens, auth keys, passwords, bearer tokens, and common secret values are masked before the archive is written.

## If Docker Or Tailscale Are Missing

The standard installer checks for Docker and Tailscale and prints warnings when they are missing. On Debian, Ubuntu, and Raspberry Pi OS, `./scripts/bootstrap-project-os.sh --auto-install-deps` can attempt to install supported dependencies automatically.

If Docker is missing, Project OS can still start, but Marketplace installs will fail until Docker is installed and available to the `projectos` service user.

If Tailscale is missing or not connected, Project OS can still manage local apps, but private HTTPS links will not work until Tailscale is installed, connected, and the operator permission is configured.

After installing or connecting Tailscale, rerun:

```bash
sudo /opt/project-os/bin/install-project-os-service.sh
project-os restart
```

## Updating A Beta Install

Check release metadata for an available update:

```bash
project-os update --check --metadata-url file:///absolute/path/to/project-os-release.json
project-os update --check --metadata-url file:///absolute/path/to/project-os-release.json --json
```

Apply an update from a verified local release bundle:

```bash
project-os update --release-bundle /absolute/path/to/project-os-<version> --yes
```

The update flow verifies bundle checksums when `SHA256SUMS` exists, creates a pre-update metadata snapshot under the runtime directory, preserves the previous backend jar for rollback, replaces release-managed scripts and backend jar, restarts the service, and runs the post-update doctor.

Preview the file changes without changing the host:

```bash
project-os update --release-bundle /absolute/path/to/project-os-<version> --dry-run
```

Source rebuild updates remain available for beta development fallback:

```bash
git pull
./scripts/bootstrap-project-os.sh
```

## Development Mode

Production normally owns port `8082` through `project-os.service`.

Check the current port/service state:

```bash
./scripts/dev-backend.sh --status
```

Run backend dev mode by stopping the production service for the session:

```bash
./scripts/dev-backend.sh --stop-service
```

Or keep production running and choose another backend port:

```bash
./scripts/dev-backend.sh --auto-port
```

Run the frontend dev server:

```bash
cd frontend
yarn dev
```

If the backend is not on `8082`, point the frontend at it:

```bash
PROJECT_OS_BACKEND_URL=http://localhost:8092 yarn dev
```

## Build And Test Commands

Frontend:

```bash
cd frontend
yarn typecheck
yarn lint
yarn build
```

Backend:

```bash
cd backend
./gradlew test
./gradlew bootJar
```

The backend `bootJar` task builds and embeds the frontend automatically.

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

Manual cleanup remains available for beta troubleshooting if the helper command is unavailable:

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
- Release-bundle installs exist, but public download, signing, and versioned update delivery are not finished.
- Docker and Tailscale setup use their official install scripts when `--auto-install-deps` is enabled; unsupported Linux distributions are still guided manually.
- Tailscale private links require host-level Tailscale permissions.
- App catalog coverage is still early and should be tested service by service.
- Public network exposure should remain an intentional advanced workflow.

## Additional Docs

- [Non-technical install guide](docs/non-technical-install-guide.md)
- [Street-to-seat installation](docs/street-to-seat-installation.md)
- [Service user installation](docs/service-user-installation.md)
- [Installation flow and hardening](docs/installation-flow-and-hardening.md)
- [Pi beta install and next development](docs/pi-beta-install-and-next-development.md)
- [Local development](docs/local-development.md)
- [Docs index](docs/README.md)
