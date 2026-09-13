# Ownership Model Refactor

Status: Proposed

## Context

Autark-OS currently represents applications through several overlapping models:

- managed application records
- runtime application views
- observed Docker services
- pinned external services
- found services
- catalog ownership views

These concepts are exposed together through the canonical application-state response and are interpreted by Home, My Apps, Discover, Access, Backups, Storage, Monitoring, Settings, Support, and onboarding.

The current model supports useful safety distinctions, but it also allows product states that are difficult to explain and difficult to operate. In particular, the existing adoption flow can create a managed database record without reconstructing and verifying the complete managed runtime contract. An adopted application may consequently appear managed while some lifecycle operations remain unavailable or while its Docker ownership labels still identify another Autark-OS instance.

This refactor will narrow the MVP around applications installed or fully recovered by Autark-OS. It will remove generic linked-service and partial-adoption behavior, establish one canonical application model, and require recovery to result in complete management.

## Decision

The managed-application concept remains a foundational Autark-OS safety boundary. It will not be removed.

The MVP will remove the broader product concept of treating arbitrary discovered services as app-like objects that can be pinned, manually matched, or partially adopted. Docker discovery will remain an internal capability for collision detection, diagnostics, cleanup, and identification of recoverable Autark applications.

Recovery will be limited to resources with verifiable Autark-OS provenance. A recovery operation must either produce a fully managed application or leave the resource explicitly recoverable. Autark-OS will not create a reduced-capability managed state.

A separate recovery capsule is intentionally out of scope for this refactor.

## Goals

- Establish clear and enforceable definitions for managed, recoverable, blocked, and available applications.
- Provide one canonical application view for every active product surface.
- Remove linked-service, pinning, manual matching, and partial-adoption behavior end to end.
- Replace adoption with a strict plan-and-apply recovery mechanism.
- Ensure a recovered app has the same lifecycle capabilities as an app installed by the current Autark-OS instance.
- Prevent Autark-OS updates from silently losing managed applications.
- Delete obsolete endpoints, models, services, frontend components, state transformations, and tests.
- Reduce the number of ownership concepts, state writers, files, and production lines of code.

## Non-goals

- Adopting arbitrary Docker containers.
- Importing user-supplied Compose files.
- Providing a generic Docker dashboard.
- Preserving pinned external services as first-class applications.
- Automatically taking ownership of resources belonging to another active Autark-OS instance.
- Adding a recovery capsule or a second live source of application truth.

## Target application model

Every catalog application will have one canonical `ApplicationView`. Product surfaces will not merge managed apps with observed services or independently derive ownership.

The model will keep separate concerns separate:

```ts
type ApplicationRelationship =
  | "managed"
  | "recovery_required"
  | "blocked"
  | "available";

type RuntimeState =
  | "ready"
  | "starting"
  | "stopped"
  | "degraded"
  | "missing"
  | "unknown";
```

The canonical view should also expose independently typed fields for:

- catalog availability, such as installable, coming soon, or unsupported
- current operation, such as installing, repairing, uninstalling, or failed
- runtime state
- application relationship
- backend-calculated available actions and disabled reasons
- recovery information when the relationship is `recovery_required`
- conflict information when the relationship is `blocked`

`failed_install` is an operation result, not an ownership state. `coming_soon` is catalog availability, not an ownership state. Runtime health does not determine ownership.

## Definitional boundaries

### Managed

An application is managed when:

- an installed-application record exists
- ownership metadata is complete and belongs to the current Autark-OS instance
- its runtime directory and usable Compose definition exist
- all existing app containers have compatible app, app-instance, and Autark-instance labels
- the lifecycle service can operate on it

A stopped or missing container does not make an application unmanaged. It makes a managed application stopped or missing and should enable an appropriate start or repair action.

### Recovery required

An application requires recovery when Autark provenance exists but the complete management contract cannot currently be proven. Examples include:

- same-instance containers exist but the installed-application record is missing
- runtime files exist but registration is incomplete
- the resources belong to a previous Autark-OS instance
- legacy Autark resources can be identified but require reconstruction

Recovery required is not a reduced form of managed.

### Blocked

An application is blocked when an external container, port, volume, or other resource conflicts with installation and there is insufficient Autark provenance to recover it.

Autark-OS may explain the conflict and provide safe resolution guidance, but it must not offer adoption.

### Available

An application is available when it is installable and no managed instance, recoverable Autark instance, or blocking conflict exists.

## Target backend responsibilities

### `ApplicationInventoryService`

- Read installed-application records.
- Read current Docker evidence.
- Apply the ownership and recovery truth table.
- Produce the canonical `ApplicationView` list.
- Remain the only source of application relationship state.

### `ApplicationStateService`

- Coordinate refresh and freshness.
- Attach operation and job state.
- Publish the canonical application-state response.
- Avoid independently classifying ownership or runtime resources.

### `DockerInventoryReader`

- Read Docker containers and labels.
- Return low-level observed evidence.
- Avoid product-language classification and all mutation behavior.
- Avoid persistence unless a demonstrated product requirement needs it.

### `AppRecoveryService`

- Build recovery plans from fresh evidence.
- Apply reviewed recovery plans.
- Verify the complete management contract.
- Commit managed state only after successful verification.
- Restore the original runtime arrangement if recovery fails.

Existing process and Docker interfaces should remain where they provide useful test seams. Files should be combined only when their responsibilities are genuinely the same; reducing file count must not produce a new god service.

## Development stories

### Story 0: Establish a clean refactor baseline

Before changing the model:

- resolve or isolate current uncommitted work
- capture realistic fixtures for all ownership and recovery cases
- add behavior-level characterization tests for installation, ownership checks, lifecycle authorization, and duplicate prevention
- inventory every active consumer of the retiring contracts
- create a deletion ledger covering files, endpoints, routes, types, repository methods, and database structures

Required fixtures:

- clean server
- healthy managed app
- stopped managed app
- managed app with a missing container
- same-instance container with a missing database record
- previous-instance Autark app
- legacy Autark app
- unrelated Docker conflict
- failed installation

Acceptance criteria:

- existing tests pass
- a Pi smoke baseline is recorded
- every planned removal has an identified consumer or migration path
- no production behavior changes in this story

### Story 1: Remove linked and pinned external services end to end

Remove from the product UI:

- pin and unpin controls
- manual catalog matching
- linked services on Home
- linked services in My Apps
- linked services in the Access matrix
- observed-service management tabs
- related deep links and navigation behavior

Remove from the backend:

- pin and unpin endpoints
- catalog-match endpoints
- related action models and service methods
- pinned-service collections in application state
- mutation and cache helpers supporting those actions

Retain:

- low-level Docker discovery
- conflict detection
- Autark provenance detection
- useful diagnostic visibility

Acceptance criteria:

- My Apps, Home, and Access contain managed apps only
- an unrelated Docker service can block a conflicting installation but cannot be pinned or managed
- no dead controls or routes remain
- the story is materially net-negative in production code

#### Story 1 implementation ledger

Local implementation completed 2026-09-12. Raspberry Pi smoke validation remains required before release.

Removed:

- observed-service pin, unpin, and manual catalog-match HTTP endpoints
- corresponding backend actions, mutations, repository helpers, DTO fields, and frontend API methods
- the `pinned_external` ownership/status state and the linked management state
- `pinnedExternalServices` from the canonical application-state response and frontend repository view
- linked-service cards and counts from Home and My Apps
- pinned-service rows and filters from Access
- observed-service catalog-match and management-tab components
- observed-service My Apps and Access deep-link variants

Replaced:

- previously pinned observations now classify as found Docker evidence after refresh
- recovery and conflict review links now open the dedicated existing-app review flow
- stale Docker cleanup no longer gives pinned records special persistence
- My Apps, Home, and Access now derive their visible application collections from managed apps only

Retained intentionally:

- Docker discovery and persisted evidence for duplicate-install protection, Autark provenance, recovery review, and diagnostics
- ignored-service visibility behavior, which is independent of the retired pinning feature
- historical pin columns and record fields until the explicit upgrade-data decision in Story 6
- the existing adoption API and flow until Story 3 replaces it atomically with strict recovery

Validation:

- backend: 661 tests, 0 failures, 0 errors, 3 skipped
- frontend: 96 files and 332 tests passed
- TypeScript, ESLint, production frontend build, and whitespace validation passed
- production source delta: 1,240 net lines removed

### Story 2: Replace the canonical application contract

Replace the parallel application-state collections:

```text
managedApps
runtimeApps
observedServices
pinnedExternalServices
foundServices
ownershipViews
```

with:

```text
applications: ApplicationView[]
```

Migrate every active consumer in the same corrective pass:

- Home
- My Apps
- Discover
- Access
- Backups
- Storage
- Monitoring
- Settings
- Support
- onboarding and setup

Candidates for deletion or consolidation after cutover include:

- `AppOwnershipService`
- `AppOwnershipState`
- `AppOwnershipView`
- `AppOwnershipAction`
- `AppReconciliationService`
- `AppReconciliationItem`
- the public `ObservedServiceView`
- compatibility selectors and frontend state transformations
- portions of `AppInstanceViewService` whose responsibility moves into canonical inventory assembly

Acceptance criteria:

- every active surface reads the same `ApplicationView`
- no frontend component independently decides whether an app is installed or recoverable
- Discover and My Apps cannot disagree about application relationship
- old parallel DTOs, compatibility selectors, and unused source files are deleted
- repository search finds no active references to the retired contract

This is an atomic vertical cutover. A long-lived compatibility model is not acceptable.

#### Story 2 implementation ledger

Local implementation completed 2026-09-12. Raspberry Pi validation was intentionally deferred during the refactor.

Replaced:

- the six parallel application-state collections with one `applications: ApplicationView[]` contract
- the ownership DTO family with `ApplicationView`, `ApplicationRelationship`, `ApplicationAction`, and `ApplicationInventoryService`
- Discover's duplicated installed/found projection with the canonical `ApplicationView`
- recovery and Support filtering based on observed-service labels with filtering based on the canonical relationship
- independent Home, My Apps, Access, Backups, Storage, Monitoring, Settings, Support, and setup consumers with canonical application/runtime queries

Removed:

- `AppOwnershipService`, `AppOwnershipState`, `AppOwnershipView`, and `AppOwnershipAction`
- frontend `appOwnership` types and `DiscoverInstalledAppSummary`
- backend `DiscoverInstalledAppSummary`
- compatibility selectors and cache transforms for `managedApps`, `runtimeApps`, `observedServices`, `foundServices`, and `ownershipViews`
- the unused backup-repository dependency from canonical inventory assembly

Hardened:

- an absent runtime status now renders as `Needs review` instead of silently falling through to `Ready`
- optimistic runtime and job updates mutate only the runtime nested in the matching canonical application
- Discover and My Apps regression coverage exercises the same application relationship record
- managed-runtime consumers ignore a missing runtime payload without changing the application's canonical relationship

Validation:

- backend: 652 tests executed, 0 failures, 0 errors, 3 skipped
- frontend: 96 files and 319 tests passed
- TypeScript, ESLint, production frontend build, and whitespace validation passed
- production source delta: approximately 900 net lines removed

### Story 3: Replace adoption with strict recovery

Delete the current adoption mutation and partial-management behavior.

Introduce a focused recovery API:

```text
GET  /api/app-recovery
GET  /api/app-recovery/{appId}/plan
POST /api/app-recovery/{appId}/apply
```

Internally classify recovery evidence as:

- `current_instance_registration_lost`
- `previous_instance`
- `legacy_autark`
- `insufficient_evidence`

These are recovery reasons and diagnostic evidence, not additional primary application states.

A recovery plan must verify:

- catalog application identity
- app-instance identity when available
- runtime path
- Compose validity
- volume and bind-mount mappings
- current containers and ownership labels
- port conflicts
- existing managed-record conflicts
- availability of the complete managed lifecycle after recovery

Delete behavior that:

- writes a managed database record without reconciling Docker ownership
- substitutes default settings for unknown settings and calls the result managed
- represents a missing Compose file as managed
- bypasses observed Docker ownership for an explicitly adopted database record

Acceptance criteria:

- recovery either produces a fully managed application or produces no managed record
- arbitrary Docker containers are not recoverable
- missing Compose remains `recovery_required`
- no `adopted_missing_compose` state remains
- customer-facing code and APIs no longer use the term `adopt`

### Story 4: Implement the complete recovery transaction

Create an isolated wireframe for the recovery review and confirmation flow before production UI implementation.

The customer flow should be:

```text
Recovery needed -> Review plan -> Confirm ownership transfer -> Recover -> Verify
```

Applying a recovery plan must:

1. Acquire an app-specific operation lock.
2. Re-read Docker and filesystem state.
3. Reject a stale or changed plan.
4. Create a normal safety checkpoint or recovery archive.
5. Preserve mounted application data.
6. Reconstruct or validate the managed Compose definition.
7. Stop the previous Compose project when necessary.
8. Recreate containers with current ownership labels.
9. Restore and verify access configuration.
10. Verify container health and application access.
11. Commit installed-app, ownership, and settings records.
12. Refresh canonical application state.
13. Emit a durable activity result.

If verification fails, Autark-OS must restore the original runtime arrangement and leave the application recoverable.

Acceptance criteria:

- a recovered app supports start, stop, restart, repair, settings, backup, update, and uninstall
- Docker labels and database ownership agree
- the lifecycle layer cannot distinguish a recovered app from a normally installed app
- recovery cannot overwrite another managed instance of the same catalog app
- previous-instance transfer requires explicit confirmation
- another active Autark-OS owner cannot be silently displaced
- no partial managed result is possible

### Story 5: Harden Autark-OS updates against lost applications

Before updating, record a compact inventory of:

- managed app IDs
- app-instance IDs
- owner instance ID
- runtime paths
- Compose projects
- ownership state

Continue snapshotting SQLite while the service is stopped.

After updating:

- refresh canonical inventory
- verify that every prior managed app remains managed or is explicitly recovery-required
- fail validation if an app silently becomes available, becomes a generic conflict, or disappears
- roll back the Autark release and database snapshot when the invariant fails

Required integration cases:

- normal version update with several managed apps
- database migration failure
- installed-app row disappearing
- ownership metadata disappearing
- runtime-root configuration changing unexpectedly
- a new release misclassifying existing Docker labels

Acceptance criteria:

- backend health alone cannot declare an update successful when managed inventory regressed
- an update cannot silently lose an application
- rollback restores the prior application inventory
- the Pi update smoke workflow reports the before-and-after inventory comparison

### Story 6: Delete obsolete infrastructure and close the schema

Perform the final deletion pass after all active consumers have moved.

Likely deletion targets include:

- `ObservedServiceController`
- `ObservedServicesAPIClient.ts`
- `observedService.ts`
- the existing `ResolveExistingAppsPage` implementation
- old adoption DTOs and action results
- observed-service pin and match persistence code
- ownership compatibility converters
- frontend helpers that synthesize managed apps from observed services
- tests that assert deleted implementation details

Historical database migrations must not be edited. If obsolete tables are to be removed, add a new migration after making an explicit decision about existing pinned-link data. Dormant historical data is preferable to silently deleting user data without a reviewed migration policy.

Acceptance criteria:

- no unused endpoint, client, type, component, repository method, or route remains
- no production code references pinning, manual matching, or partial adoption
- fresh installation and database upgrade paths both work
- production lines of code and file count are measurably lower
- complete frontend, backend, packaging, and Pi smoke validation passes

## Refactor controls

This refactor has a higher-than-normal risk of leaving parallel behavior behind. Apply the following controls throughout the epic:

- Do not keep a long-lived compatibility layer.
- Do not leave two active application-state models at the end of a story.
- Maintain an added, replaced, and deleted ledger for every story.
- Require production code to be net-negative except where the complete recovery transaction adds necessary behavior.
- Do not combine unrelated responsibilities solely to reduce file count.
- Preserve process and Docker boundaries that provide meaningful test seams.
- Prefer behavior tests over assertions about source-code text.
- Require every mutation to return or trigger refresh of canonical application state.
- Exercise every state fixture against all relevant product surfaces.
- Smoke-test the Pi after Stories 1, 2, 4, and 5.
- Keep unrelated visual redesign out of the state-model cutover.
- Do not release between the canonical-state cutover and complete recovery unless recovery is clearly unavailable rather than partially functional.

## Success criteria

The refactor is complete when Autark-OS has:

- one canonical application model
- one ownership decision path
- one internal Docker evidence path
- one recovery mechanism that either completes fully or does not claim management
- no generic linked-service management in the MVP
- no partial managed states
- no cross-page ownership disagreement
- update validation that detects lost managed applications
- materially fewer ownership-related concepts, files, and state transformations

The primary measure is reduced conceptual complexity and fewer conflicting state transitions. File and line-count reductions are expected consequences, not substitutes for a clear architecture.
