# ADR-001: Autark Pro Is an Optional Module in One Installed Product

- Status: Accepted
- Date: 2026-07-19
- Prototype gate: PRO-208

## Context

Autark-OS Community Edition (CE) is the installed appliance and already owns the
browser shell, Spring Boot backend, SQLite state, jobs, app management, backups,
access, diagnostics, and privileged host integrations. Autark Pro must add paid
automation and local intelligence without creating a second appliance
installation or reducing CE functionality.

An earlier development direction described Pro as a separate paid distribution.
That direction is superseded by this decision.

## Decision

Autark Pro is an optional capability layer inside the existing Autark-OS
installation:

1. The existing `/pro` route evolves from an information page into activation,
   entitlement, module-lifecycle, and Guardian presentation.
2. The public Spring Boot core owns device identity, entitlement verification,
   release verification, module lifecycle, normalized host data, generic schema
   rendering, and all privileged host access.
3. The public core downloads and runs an entitled closed-source
   `autark-pro-agent` OCI image by immutable digest.
4. The private agent implements rules and product intelligence behind a
   versioned, authenticated local API. It does not supply executable browser UI.
5. Pro is disabled by default. Absence, invalid entitlement, incompatibility,
   outage, or agent failure cannot prevent CE startup, login, navigation, or
   actions.
6. Local rights and hosted-service eligibility are separate. Maintenance expiry
   enters retained use and does not remove an eligible installed agent.

No second React application, second Spring Boot core, replacement OS image, or
separate Autark-OS Pro installation is part of this architecture.

## Data Flow

```text
Browser
  | same-origin, administrator-authenticated /api/v1/pro/*
  v
Public Autark-OS core
  |-- verifies signed grants, leases, manifests, and image identity
  |-- persists lifecycle state in the existing local SQLite database
  |-- reads CE services and builds bounded normalized snapshots
  |-- owns Docker and host privilege
  |
  | authenticated private transport; versioned JSON only
  v
Private autark-pro-agent container
  |-- unprivileged, no host mounts, no Docker socket, no external egress
  |-- returns schema-constrained capabilities and findings

Public core -- outbound TLS --> Pro control plane
Public core -- short-lived pull credential --> Private OCI registry
```

The companion app and hosted connection features are outside the PRO-208
prototype gate. They remain separate clients of versioned control-plane and
device contracts when later implemented.

## Consequences

- CE remains installable, testable, and complete without private artifacts.
- The public repository contains shared contracts and presentation code, but no
  proprietary rules or private agent source.
- Pro lifecycle work must extend existing persistence, jobs, activity, and
  runtime abstractions instead of introducing a parallel appliance backend.
- UI changes must keep one application shell and use backend-authoritative
  feature state.
- Release packaging may include Pro-aware public code, but never embeds an agent
  image, registry credential, entitlement signing key, or production secret.

## Rejected Alternatives

- A separate Pro OS image or paid Autark-OS distribution.
- A closed-source privileged backend replacing the public core.
- A browser-delivered private JavaScript application or agent-provided HTML.
- A lease that disables purchased local features when maintenance ends.
