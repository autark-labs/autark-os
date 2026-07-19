# ADR-002: The Public Core Owns the Pro Privilege Boundary

- Status: Accepted
- Date: 2026-07-19
- Security impact: Release blocking

## Context

Autark-OS controls Docker Compose applications, host files, backups, access
configuration, and operating-system services. The private Pro agent is a
downloaded, independently released component. Treating that component as
trusted host code would turn a Pro release or registry compromise into full
appliance compromise.

The CE core currently performs Docker work through public Java code including
`DockerComposeExecutor`, `ProcessDockerComposeExecutor`, and
`SystemCommandRunner`. It persists jobs through `AutarkOsJobService` and records
user-visible events through `ActivityLogService`.

## Decision

The public Spring Boot core is the only Pro component allowed to invoke Docker,
host command, file, backup, access, or future broker abstractions.

The private agent:

- runs as a fixed non-root user;
- has a read-only root filesystem and `no-new-privileges`;
- drops every Linux capability;
- receives no Docker socket, host root, host PID/IPC namespace, arbitrary bind
  mount, privileged flag, or public port;
- has bounded CPU, memory, process, request, response, and log resources;
- has no external egress in the prototype;
- reads only versioned normalized data sent by the core;
- returns only schema-validated data and typed identifiers;
- cannot execute commands, load arbitrary plugins, read files, or call CE APIs
  directly.

The core authenticates the local agent channel with a per-install credential,
checks API and schema compatibility, validates all returned data, and treats the
agent as unavailable on any validation failure.

## Prohibited Interfaces

The following are prohibited in the agent image and core-to-agent contract:

- `/var/run/docker.sock` or any container-engine socket;
- arbitrary shell, command, script, Docker flag, path, environment, SQL, file
  read/write, network proxy, or port-forwarding parameters;
- host root or broad Autark runtime mounts;
- SSH server/client control, permanent support keys, or inbound management
  listeners;
- dynamic JavaScript, HTML, CSS, iframe, module import, executable template, or
  unrestricted URL fields;
- direct Supabase service-role, registry, signing, or CE administrator
  credentials.

## Public Runtime Adapter

The existing `DockerComposeExecutor` is app-oriented. Pro lifecycle work may add
a dedicated public `ProAgentRuntime` adapter backed by narrowly constructed
Docker commands. That adapter must accept typed, validated component state
rather than arbitrary command arguments. It must be unit- and runtime-policy
tested.

The generic `SystemCommandRunner` remains an internal implementation detail. It
must never be exposed through an HTTP endpoint, agent request, capability
descriptor, or future operations broker.

## Sensitive Transition Policy

Before a sensitive transition continues, the core must be able to persist the
new lifecycle state and the required redacted audit record. Existing CE activity
logging is best-effort; Pro lifecycle audit work must add an explicit
fail-closed path where a story identifies an auditable security boundary.

CE startup is the exception: corrupt or unavailable Pro state isolates Pro in a
recoverable error and cannot prevent the base appliance from starting.

## Enforcement

- Public contract schemas reject unknown executable or unrestricted fields.
- Container-policy tests inspect the actual candidate runtime.
- CI scans the agent image and verifies its configured user and filesystem.
- Release integration tests use real signed metadata and immutable digests.
- Any expansion of runtime privilege requires a new ADR and threat-model update.
