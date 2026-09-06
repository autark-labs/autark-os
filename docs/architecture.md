# Autark-OS Architecture

Autark-OS is a local appliance runtime. A browser UI asks one local backend to
manage a small catalog of self-hosted applications. The product uses Docker,
SQLite, systemd, and Tailscale directly instead of recreating their jobs in
another control plane.

## Main Parts

```text
Browser UI (React, TanStack Query, shadcn/Radix)
                  |
             /api | local session
                  v
Spring Boot backend
  |- canonical application state and action results
  |- durable jobs, backup/restore, activity, diagnostics
  |- SQLite + Flyway migrations
  |- catalog manifests and install plans
  `- Docker Compose, filesystem, system, and Tailscale adapters
                  |
                  v
Linux host: systemd + Docker Engine/Compose v2 + app data
```

The installed service is `autark-os.service`. Its runtime directory is
`/var/lib/autark-os` by default and is configurable during installation. The
service uses systemd's mount dependency for that directory so it does not start
against an absent data mount. The development default is
`../runtime/autark-os`; it is not an installation layout.

## Application Lifecycle

1. **Discover** renders catalog applications and host observations from the
   backend's reconciled application view.
2. **Install** validates the manifest, produces a user-facing plan, and runs a
   durable job. The backend allocates resources, writes runtime configuration,
   invokes Docker Compose, and observes the resulting containers.
3. **Operate** actions such as pause, resume, restart, backup, restore, and
   uninstall return canonical action results and refresh the reconciled view.
4. **Recover** compares stored ownership and manifest intent with observed
   Docker/runtime state. Foreign and legacy resources remain *found* or
   *recoverable*; they are never silently adopted.

Docker/runtime observation is the source for whether an app is actually ready.
SQLite stores Autark-OS ownership, jobs, plans, activity, and recovery metadata;
it must not be used to claim that an absent container is running.

## Boundaries

- **Core is local-first.** It works without a cloud service, native mobile app,
  or Pro control plane.
- **Tailscale is optional private access.** It is preferred for remote access,
  but a local appliance remains useful when signed out.
- **Docker Compose is the runtime.** Autark-OS owns only resources it creates
  and labels; it does not become a general Docker dashboard.
- **SQLite is appliance state.** Flyway owns schema changes. Runtime code does
  not create or repair schema ad hoc.
- **Catalog manifests are declarative input.** They describe approved apps;
  they are not user-supplied arbitrary Compose execution.

## Security Model

The backend is privileged software because it can manage containers and data.
State-changing API routes require the local administrator session. Initial
claim and local recovery use intentionally narrow local-only flows. Docker
group access remains host-level authority, so it is an installation concern,
not a capability exposed to ordinary UI users.

Support reports redact sensitive values. Checksums detect accidental corruption
but do not, by themselves, prove who produced a release artifact. See
[Signed release artifacts](./security/release-signing.md) for the operator
procedure and current authenticity limitation.

## Beta Boundary

The architecture supports more than the controlled beta ships. The release
boundary is the single authoritative [controlled beta scope](./beta-scope.md):
Debian 12 amd64, the portable installer, local storage, and the approved app
roster. Other host combinations or retained compatibility APIs are not beta
certification.
