# Develop Autark-OS

This guide is for contributors working from a source checkout. It is separate
from the appliance installer: do not use a development checkout as beta
qualification evidence.

## Prerequisites

- Java 21 (the backend Gradle toolchain)
- Node.js with Yarn 1.22.22
- Docker Engine and Docker Compose v2 for realistic application lifecycle work
- Linux is recommended for installer, systemd, Docker, and filesystem changes

Tailscale is optional for routine frontend/backend development. Do not test
private-access claims with a mock when a change affects that workflow.

## First Run

Install frontend dependencies, then run the backend and browser client in
separate terminals:

```bash
cd frontend
yarn install --frozen-lockfile
cd ..
./scripts/dev-backend.sh --auto-port
```

The backend starts with the `dev` Spring profile and chooses an available port
when requested. In a second terminal, point Vite at the port printed by the
backend script:

```bash
cd frontend
AUTARK_OS_BACKEND_URL=http://localhost:8092 yarn dev
```

Replace `8092` with the reported port. If a production service already owns
8082, either keep it running and use `--auto-port`, or stop it deliberately:

```bash
./scripts/dev-backend.sh --stop-service
```

The development profile enables its development-only authentication mode. It
must never be used as production configuration.

## Validate A Change

Run the smallest relevant checks first:

```bash
cd frontend
yarn typecheck
yarn test
yarn build

cd ../backend
./gradlew test
./gradlew bootJar
```

For installer or packaging changes, also run the targeted contract test under
`scripts/tests/`; use the release contract suite only when the changed behavior
needs its broader coverage. Finish every change with:

```bash
git diff --check
```

## Change Safely

- Start from the [controlled beta scope](./beta-scope.md). Do not add a cloud,
  mobile, Pro, update, or broad-host dependency to a Core beta slice.
- Treat the backend reconciled application view as the source for ownership,
  readiness, recovery, and available actions. Do not recreate those rules in a
  page.
- Model install, recovery, cleanup, backup, restore, and update work as durable
  jobs when it can outlive an HTTP request.
- Keep Docker, filesystem, Tailscale, and privileged helper details behind
  backend boundaries. User-facing UI should state the next safe action.
- Add a regression test when a state can disagree across surfaces or after a
  failed operation.

For catalog changes, follow the [manifest authoring checklist](./development/manifest-authoring-checklist.md).
For SQLite changes, follow [database migration discipline](./development/database-migrations.md).
For contribution and review expectations, see [CONTRIBUTING.md](../CONTRIBUTING.md).

## Build Local Release Artifacts

Build the ready-to-install AMD64 and ARM64 artifacts on this workstation before
publishing a release or smoke-testing a Raspberry Pi. The target device never
compiles source code. This command builds the application and runs the release
job's unit and frontend checks once on the local host, then validates and
packages that application for both architectures. It does not start containers,
contact a target device, or call `systemctl`.

```bash
tools/build-local-release.sh --version 0.9.1-beta.24
```

The command refuses uncommitted source by default, matching a GitHub release.
For an intentional development smoke build, add `--allow-dirty`; the bundle
still records the current base commit as its provenance.

Artifacts are written to:

```text
build/releases/<version>/
  amd64/
  arm64/
```

Each architecture directory has the same artifact layout as GitHub: a Debian
package, tarball, self-extracting installer, extracted bundle, checksum file,
and artifact manifest. Local candidates are unsigned (`unsigned-reserved`), so
they are for local smoke testing only; GitHub remains responsible for signed
published releases.

The AMD64 bundle uses the Java 21 `jlink` selected on `PATH`. Use a compatible
JDK distribution such as the Temurin JDK used by release CI: Ubuntu's system
OpenJDK can require a newer glibc than Debian 12 and fail before installation.
Select the compatible JDK's `bin` directory on `PATH` before building; merely
setting Gradle's toolchain does not select the packaging runtime.

The bundler checks every runtime ELF file's glibc requirements using `readelf`
(from binutils), including imported runtimes. Requirements must fit the oldest
declared host for that architecture: glibc 2.36 on AMD64 and 2.31 on ARM64.
This check does not replace running the finished artifact on the target host.

The ARM64 bundle uses a pinned, checksum-verified Temurin Java 21 runtime downloaded
once into `build/cache/`; it is copied into the bundle and never executed on
this workstation. This avoids QEMU, Docker Buildx, cross-compiling, and Pi-side
build work while preserving the same installer and application payload.

## Test A Release On A Reachable Pi

Use [`tools/dev-pi.sh`](../tools/dev-pi.sh) from this workstation to control a
development Pi through ordinary SSH. It is a developer-only helper and is not
included in release artifacts. It uses the Pi's installed `autark-os update`
flow rather than copying files into `/opt` itself, so a deployment keeps normal
checksum verification, update snapshots, health verification and rollback.

Create the ignored local target configuration:

```bash
cat > tools/dev-pi.env <<'EOF'
AUTARK_PI_HOST=your-pi-host-or-address
AUTARK_PI_USER=your-ssh-user
EOF
```

Then use one terminal on this workstation:

```bash
tools/dev-pi.sh status
tools/dev-pi.sh deploy --bundle-dir /absolute/path/to/extracted-arm64-release-bundle
tools/dev-pi.sh collect
tools/dev-pi.sh tunnel --local-port 18082
```

`deploy`, `verify`, `collect`, and `logs` may request the Pi user's sudo
password in the local terminal. Do not add a broad passwordless-sudo rule just
to automate this. The helper writes its logs and downloaded redacted support
bundles under `.autark-os-dev/pi/`, which is ignored by Git. The tunnel exposes
the Pi UI locally at `http://localhost:18082`; stop it with `Ctrl+C`.
