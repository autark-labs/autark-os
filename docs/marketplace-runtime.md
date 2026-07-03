# Marketplace And Runtime Architecture

Autark-OS is not a Docker Compose launcher. It is a guided local runtime for discovering, installing, operating, backing up, and recovering self-hosted apps.

The user should not need to understand Docker, Compose projects, Tailscale Serve, storage mounts, Linux services, or container labels to use the main product flow. Those details remain available in advanced and diagnostics views.

## Runtime Model

```text
React frontend
    |
    | REST API
    v
Spring Boot backend
    |
    | owns product state and actions
    v
Local runtime
    |-- catalog manifests
    |-- Docker Compose projects
    |-- runtime filesystem
    |-- SQLite database
    |-- Tailscale private links
    |-- durable Autark-OS jobs
```

The frontend never talks to Docker or Tailscale directly. It renders backend-owned view models and submits user actions to backend endpoints.

## Core Responsibilities

### Discover

Discover is the user-facing app catalog. It should feel like an app store, not a Docker catalog.

Discover is responsible for:

- showing supported catalog apps
- explaining what each app does
- showing whether an app is available, installed, found, recoverable, or blocked
- presenting install plans
- starting install jobs

Discover should consume catalog and ownership view models. It should not parse Compose files or decide ownership state locally.

### Backend Agent

The backend agent is the local execution engine. It is not an AI system.

The backend is responsible for:

- catalog loading and manifest validation
- install planning
- Docker Compose execution
- application lifecycle actions
- backup and restore jobs
- health and access checks
- private-link reconciliation
- canonical application state
- durable activity and job records

The backend should stay small enough to run comfortably on Raspberry Pi, Intel N100 mini PCs, and similar home-server hardware.

### Manifests

The manifest is the product contract for a catalog app.

It describes:

- what the app is
- who it is for
- which ports, volumes, and backups it needs
- how Autark-OS should check health
- whether private access is recommended
- which settings are safe to expose
- what the user should know before install

Compose templates are implementation details. The frontend should not depend on Compose structure.

## Catalog Structure

```text
catalog/
└── apps/
    ├── syncthing/
    │   ├── manifest.yaml
    │   ├── compose.yaml
    │   └── icon.svg
    └── vaultwarden/
        ├── manifest.yaml
        ├── compose.yaml
        └── icon.svg
```

Future versions may support remote catalogs and signed manifests. The local catalog remains the source of truth for the current beta.

## Runtime Directory

Managed app files live under the Autark-OS runtime directory:

```text
/var/lib/project-os/
├── apps/
│   ├── syncthing/
│   └── vaultwarden/
├── backups/
├── catalog/
├── logs/
└── project-os.db
```

Apps should not write arbitrary host paths. Autark-OS owns placement, labels, generated Compose files, and backup paths.

## Install Flow

```text
User selects Install
        |
        v
Load manifest
        |
        v
Validate manifest and host readiness
        |
        v
Generate install plan
        |
        v
User approves plan
        |
        v
Create runtime directories
        |
        v
Render or copy Compose definition
        |
        v
Start Docker Compose project
        |
        v
Run health and access checks
        |
        v
Record managed app state
```

Install should be a guided operation. The user should see what Autark-OS will create, expose, preserve, and check before the runtime changes.

## Jobs

Long-running operations should be durable Autark-OS jobs:

- install
- repair
- backup
- restore
- uninstall
- update

A job should expose current step, completed steps, failed step, user-safe error copy, and technical detail for diagnostics.

Action endpoints should not be treated as the source of truth for app readiness. They should start or update work, then the frontend should render canonical application state.

## Canonical Application State

The backend owns app state. Active pages should consume canonical state rather than independently deciding what is installed, ready, found, recoverable, or blocked.

Important state dimensions:

- `managementState`: managed, found, linked, recoverable, conflict
- `readinessState`: ready, starting, paused, stopped, unreachable, unknown
- `attentionState`: none, needs review, conflict, blocked
- `operationState`: idle, installing, starting, stopping, restarting, backing up, restoring, repairing, uninstalling, failed
- `availableActions`: safe actions for the current state
- stable display order or sort key

## API Direction

Current API names may continue to evolve, but the intended boundaries are:

```http
GET  /api/application-state
POST /api/application-state/refresh

GET  /api/discover/apps
GET  /api/discover/apps/{id}
POST /api/discover/apps/{id}/plan
POST /api/discover/apps/{id}/install

POST /api/apps/{id}/start
POST /api/apps/{id}/stop
POST /api/apps/{id}/restart
POST /api/apps/{id}/repair
POST /api/apps/{id}/uninstall

POST /api/backups/apps/{id}/run
POST /api/backups/restore-points/{id}/restore
```

Pages can have their own view models, but ownership, readiness, attention, and operations should come from canonical app state.

## Security Model

The runtime must reject or gate:

- arbitrary host filesystem mounts
- privileged containers by default
- unknown storage locations
- unsafe capabilities
- unvalidated manifests
- destructive cleanup without a reviewed plan

Risky actions should explain what will stop, what will change, what data is preserved, and what recovery path exists.

## Design Principle

Keep the boundaries simple:

```text
Discover shows apps.
Manifests describe apps.
The backend plans and runs apps.
Canonical state tells every page what is true.
Jobs track work that can outlive a request.
```

This separation keeps Autark-OS maintainable as the catalog grows and as more recovery, backup, access, and update workflows move into the product.
