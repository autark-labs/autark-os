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
- for active containers only, one Docker-managed writable volume at
  `/var/lib/autark-pro-agent` for encrypted private history;
- one CPU, 512 MiB memory/swap, 128 pids, bounded local logs, and a 15-second
  stop timeout.

The host token file lives below an owner-only directory. Its exact bind-mounted
file is read-only and readable by the fixed container UID; no broader host
directory is mounted. The token is generated once per installation and is
preserved with the encrypted private state during ordinary module removal so a
reinstall can recover compatible history. Explicit future privacy deletion
removes both.

Candidate, active, rollback, network, and state-volume resources use fixed names and
`com.autarkos.pro.*` ownership labels. A same-named resource without the exact
ownership label and digest fails closed and is never changed. Pro containers
are excluded from Found Apps so this internal module cannot be mistaken for a
CE-managed or adoptable application.

The candidate runs in an explicit ephemeral mode without the private volume.
Its smoke surface therefore cannot open or migrate active history. After
verification, CE stops and retains the previous active container, removes the
ephemeral candidate, starts a fresh active container from the same immutable
digest with the durable volume, waits for that container's own healthcheck,
and only then changes routing. Durable state opens lazily on the first routed
analysis. Agent schema changes are transactional; the previous container and
encrypted database remain recoverable after a failed migration.

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
port `8080`, and the allowlisted status, UI-manifest, UI-asset, surface, and
generic refresh routes. It never follows redirects. Every request uses the
per-install token through the protected credential store, and every response
has a route-specific byte limit, deadline, strict decoding, and semantic
contract validation.

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

The signed candidate envelope, digest, fingerprint, sequence, and trusted
release-check server time are persisted as one authority tuple. Install-time
reverification uses the later of that checkpoint and the current entitlement
checkpoint, so a restart cannot weaken expiry or future-manifest checks.
Incomplete legacy tuples are discarded while their accepted sequence floor is
retained.

## Atomic cutover and recovery

The router holds one immutable endpoint in an atomic reference. The runtime
stops and renames the former active container to the rollback name, removes the
verified ephemeral candidate, and starts a fresh active container from the
same immutable digest with the durable state volume. It waits for the promoted
container's authenticated health before changing the route. A partial Docker
cutover is unwound before the persisted state can become active; a failed
Docker command never changes the route.

## Quiet refresh scheduling

CE owns a generic scheduler, not Guardian rules. It requests bounded,
read-only analysis on cadence, after active-agent cutover, after an explicit
authenticated refresh, and after meaningful successful CE mutations.
Mutation events only enqueue work; they never call the agent on the mutation
thread. A trailing debounce coalesces bursts, one analysis runs at a time, and
active backup/restore/app-update conflict lanes defer analysis.

The private agent owns finding identity, lifecycle, notes, and occurrence
history. Repeated rule/version/dedupe identity updates one encrypted record.
Cleared conditions become resolved and later return as regressed. Snoozed and
dismissed findings do not contribute to CE's generic attention summary, while
unrelated findings remain independent. CE receives only the shared bounded
refresh response and can contribute a navigation-only Home recommendation;
the scheduler has no operation-execution path.

Failures never fail the originating CE mutation. Scheduler state appears in
the canonical Pro product state, and a local warning is rate-limited to once
per configured quiet period while cadence retries continue.

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

`scripts/check-pro-agent-client.sh <exact-private-agent-image-reference>` starts the real private Go image with the
hardened profile and proves the public Java client against its authenticated
status, manifest, entrypoint, surface, and generic refresh routes before and
after an agent restart.

`scripts/check-pro-agent-cutover.sh <exact-private-agent-image-reference> <component-version>` publishes that image and an intentionally
broken fixture to a temporary local registry by immutable digest. It performs a
real healthy cutover, attempts the broken candidate, restores the healthy
route, and rechecks active health. Neither test publishes an agent port.
