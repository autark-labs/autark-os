# ADR-003: Pro Repository, Service, and Contract Boundaries

- Status: Accepted
- Date: 2026-07-19

## Context

The prototype spans public CE code, a private agent, a private Supabase control
plane, an OCI registry, and later a companion application. Shared contracts are
necessary, but proprietary code and signing material must not cross repository
boundaries.

## Decision

### Public `autark-os`

Owns:

- device identity and protected local persistence abstractions;
- signed grant, lease, release, and image verification;
- entitlement, feature authorization, and trusted-time reduction;
- control-plane and registry-token clients;
- Pro module lifecycle, candidate routing, rollback, and removal;
- authenticated local agent client;
- normalized CE snapshots and redaction;
- known schema validation and open-source React presentation;
- local Pro jobs, findings, and lifecycle audit records.

May contain versioned JSON Schema/OpenAPI contracts and golden examples that are
safe to publish. It must not contain private agent rules, private repository
URLs, access tokens, registry credentials, signing material, or proprietary
source.

### Private `autark-os-pro-client`

Builds the distributed component named `autark-pro-agent`.

Owns:

- the non-root agent service and `/v1` local API implementation;
- Guardian, change, capacity, and backup-confidence rules;
- private rule tests and release workflow;
- multi-architecture OCI build, scan, SBOM, provenance, and signing steps.

It consumes published schemas and golden contract fixtures. It does not copy
public privileged integrations or gain direct host access.

### Private `autark-os-pro`

Owns:

- Supabase migrations, RLS, and Edge Functions;
- organizations, devices, activation, signed entitlement documents, releases,
  rollout assignments, scoped registry-token issuance, and control-plane audit;
- staging and production service configuration separated by signing identity;
- server-side issuer and release-publisher code.

It does not receive device private keys, raw local Guardian snapshots, Docker
access, or CE administrator credentials.

### Companion `project-os-mobile`

Is outside the PRO-208 prototype scope. Later it may own sign-in, device
enrollment, redacted status, alerts, and approvals. It never becomes the source
of truth for local entitlement or receives a permanent appliance credential.

## Shared Contract Policy

- Shared artifacts are versioned schemas, OpenAPI descriptions, golden JSON
  examples, and documented error codes.
- Contract artifacts flow outward from an explicitly reviewed source; private
  implementation source never flows into the public repository.
- Unknown schema versions, features, actions, routes, and envelope types fail
  closed.
- Breaking changes are allowed during this pre-public prototype, but the first
  stable prototype contracts are versioned before release packaging.

## Service Trust Boundaries

| Boundary | Authentication | Trust decision |
| --- | --- | --- |
| Browser to CE core | Existing local administrator session | Presentation request only; backend authorizes |
| CE core to control plane | Device challenge proof and TLS | Core independently verifies signed responses |
| CE core to registry | Short-lived repository-scoped pull credential | Digest, manifest, and image signature still verified |
| CE core to agent | Per-install local credential on private transport | Every response is size- and schema-validated |
| Control plane to database | Server-only narrowly scoped role | RLS and server authorization both apply |
| Release CI to registry/control plane | Protected workload identity | Separate test/staging/production issuers |

## Operational Consequences

- Control-plane deployment may proceed independently from CE and agent release,
  but compatibility must be expressed in signed metadata.
- A control-plane outage cannot break CE or immediately disable a cached valid
  module.
- A registry or release service response is authorization input, not proof of
  artifact integrity.
- Companion and hosted-service work cannot add an inbound privileged path.
