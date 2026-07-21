# Autark Pro Agent Runtime

The public core owns the only Docker boundary for the private
`autark-pro-agent`. The agent never receives the Docker socket, a generic
command API, host root, application data, or control-plane credentials.

## Image acquisition

1. `ProModuleManager` accepts a release only after signed-manifest policy
   verification.
2. `RegistryCredentialClient` obtains a fresh, proof-bound token for that exact
   repository and digest.
3. `ProcessProDockerEngine` writes the token as Docker's `registrytoken` to an
   owner-only temporary Docker configuration.
4. Docker pulls only `repository@sha256:digest`.
5. The bundled Cosign verifier checks that exact digest against the fixed
   GitHub Actions issuer, private-agent repository, release workflow, version
   tag, push trigger, component, channel, version, and `subject=index`
   annotation policy.
6. The temporary configuration is deleted after success, pull failure, or
   signature failure. Startup
   cleanup removes a file left by process interruption.
7. Local `RepoDigests` must contain the exact assigned reference before the
   candidate can start.

The token is never placed in a command argument, environment variable, log,
job, module-state record, or support response.

Portable releases bundle checksum-pinned, architecture-matched Cosign under
`tools/cosign`, and the service installer places it root-owned under the
Autark-OS installation. A missing or failing verifier prevents Pro image
activation without preventing Community Edition startup or login.

## Candidate policy

The candidate runs with:

- fixed UID/GID `65532:65532`;
- read-only root filesystem;
- all Linux capabilities dropped;
- `no-new-privileges`;
- the Docker daemon's default seccomp and AppArmor profiles;
- private PID and IPC namespaces;
- no privileged mode, devices, host namespace, or Docker socket;
- no published port;
- a dedicated Docker `--internal` bridge, so default external egress is absent;
- one 64 MiB `noexec,nosuid,nodev` tmpfs at `/tmp`;
- one exact read-only bind of the agent API token file;
- one CPU, 512 MiB memory/swap, 128 pids, bounded local logs, and a 15-second
  stop timeout.

The host token file lives below an owner-only directory. Its exact bind-mounted
file is read-only and readable by the fixed container UID; no broader directory
is mounted. The token is generated once per local module installation and
removed with the module.

Candidate, active, rollback, and network resources use fixed names and
`com.autarkos.pro.*` ownership labels. A same-named resource without the exact
ownership label and digest fails closed and is never changed. Pro containers
are excluded from Found Apps so this internal module cannot be mistaken for a
CE-managed or adoptable application.

## Verification

The Java policy suite checks every required option and prohibits privilege,
host namespaces, public ports, broad mounts, and socket access. It also checks
the complete Cosign argument policy, private registry configuration handoff,
missing-verifier behavior, signature mismatch, and cleanup after rejection.
The private control-plane registry harness additionally:

- proves Docker can pull the exact digest using the native scoped token;
- inspects a real Docker container and internal network;
- verifies resource, namespace, mount, limit, logging, seccomp, and egress
  properties; and
- fails CI when a prohibited option appears.

## Authenticated local API

The public core resolves only the owned container's literal private IPv4
address on the internal bridge. `HttpProAgentClient` accepts only that address,
port `8080`, and the allowlisted status, UI-manifest, UI-asset, and surface
routes. It never follows redirects. Every request uses the per-install token
through the protected credential store, and every response has a route-specific
byte limit, deadline, strict decoding, and semantic contract validation.

The core treats all agent data as untrusted. Candidate verification requires,
in order:

1. Docker reports the candidate container healthy within the configured
   startup deadline.
2. Authenticated status reports ready, the exact candidate version, API v1,
   and the supported host snapshot version.
3. The UI manifest matches the candidate component version, exposes only
   bounded surface and asset identifiers, and binds the entrypoint SHA-256.
4. The fetched entrypoint matches that digest.
5. A bounded normalized smoke snapshot produces a valid opaque response for a
   declared surface.

Failure at any step leaves the candidate without routing authority.

## Atomic cutover and recovery

The router holds one immutable endpoint in an atomic reference. The runtime
stops and renames the former active container to the rollback name, renames the
verified candidate to the active name, enables the active restart policy, and
only then changes the router. A partial Docker cutover is unwound before the
persisted state can become active; a failed Docker command never changes the
route.

The complete previous generation tuple—digest, component version, agent API
range, and manifest fingerprint—is persisted. Startup derives exactly one
route from that durable active digest and completes an interrupted candidate or
active-runtime rollback idempotently.

The active monitor verifies Docker health, crash-loop restart count, local
authentication, and API readiness. Three consecutive failures restore the
previous generation when present. With no previous generation, Pro becomes
degraded while CE remains available. The rollback generation is retained for
`autark.pro.rollback-retention` (seven days by default, bounded to one minute
through 90 days) and is discarded only after the distinct active generation
passes health verification.

## Live verification

`scripts/check-pro-agent-client.sh` starts the real private Go image with the
hardened profile and proves the public Java client against its authenticated
status, manifest, entrypoint, and surface routes.

`scripts/check-pro-agent-cutover.sh` publishes that image and an intentionally
broken fixture to a temporary local registry by immutable digest. It performs a
real healthy cutover, attempts the broken candidate, restores the healthy
route, and rechecks active health. Neither test publishes an agent port.
