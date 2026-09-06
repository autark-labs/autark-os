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
