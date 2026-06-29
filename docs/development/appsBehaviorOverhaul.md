# Apps Behavior Overhaul Stories

_Last updated: 2026-06-29_

This document defines the next lean-slice refactor for My Apps behavior. The goal is to make every app card, advanced row, management rail, job indicator, and destructive action speak the same language.

The current Applications Page rebuild is close to the right shape. The main remaining risk is state drift: cards, rows, rails, jobs, and destructive dialogs can each start inventing their own meaning for words like "ready", "found", "needs review", and "uninstalling". This pass should replace that ambiguity with a small canonical app behavior model.

---

## Product Goal

Project OS should help users answer:

- What is this thing?
- Can I use it right now?
- Does it need my attention?
- Is Project OS doing something to it?
- What is the one safest next action?

The answer should be consistent in Basic mode, Advanced mode, the management rail, Home shortcuts, Discover, Access, Backups, and future global job surfaces.

---

## Shared State Vocabulary

### Management State

Answers: "What relationship does Project OS have to this app or service?"

```ts
type AppManagementState =
  | "managed"
  | "found"
  | "linked";
```

User-facing labels:

| State | Label | Meaning | Primary controls |
|---|---|---|---|
| `managed` | Managed | Owned by this Project OS instance | Open, start, pause, restart, settings, backup, uninstall |
| `found` | Found on this server | Detected on the host, not owned here | Review, recover, link, ignore where supported |
| `linked` | Linked | User-added shortcut or externally managed service | Open, edit link, remove link |

Mapping note: the current rebuild has `kind: "managed" | "pinned" | "observed"`. This should become or map cleanly to `managementState`, where `pinned` becomes `linked` and unpinned observed services become `found`.

### Readiness State

Answers: "Can the user use it right now?"

```ts
type AppReadinessState =
  | "ready"
  | "starting"
  | "paused"
  | "stopped"
  | "unreachable"
  | "unknown";
```

User-facing labels:

| State | Label | Meaning |
|---|---|---|
| `ready` | Ready | The app is running and the primary open target is reachable enough to use |
| `starting` | Starting | Runtime is coming online or a start job is active |
| `paused` | Paused | Project OS intentionally paused or stopped the app |
| `stopped` | Stopped | The app is down and not clearly an intentional pause |
| `unreachable` | Unreachable | Runtime may exist, but the app URL or private access check failed |
| `unknown` | Unknown | Project OS does not have enough current data |

Rule: a container being "running" is not enough to call the app ready. `ready` should mean the user can reasonably open it.

### Attention State

Answers: "Does the user need to look at this?"

```ts
type AppAttentionState =
  | "none"
  | "needs_review"
  | "conflict"
  | "blocked";
```

User-facing labels:

| State | Label | Meaning | UI treatment |
|---|---|---|---|
| `none` | No attention needed | App has no known user action | No warning indicator |
| `needs_review` | Needs review | Something is off or incomplete, but not necessarily dangerous | Small warning indicator and rail next action |
| `conflict` | Conflict | Resource, ownership, port, route, or data conflict exists | Strong warning indicator and review action |
| `blocked` | Blocked | Project OS cannot safely proceed until the user resolves something | Strongest warning, disable blocked actions with reasons |

Rule: `needs_review`, `conflict`, and `blocked` are modifiers. They do not replace management or readiness. A managed app can be `ready` and still `needs_review` because it has no restore point yet. A found service can be `unknown` and `conflict` because ownership is unclear.

### Operation State

Answers: "Is Project OS doing something to it right now?"

```ts
type AppOperationState =
  | { kind: "idle" }
  | {
      kind:
        | "starting"
        | "stopping"
        | "restarting"
        | "saving_settings"
        | "backing_up"
        | "uninstalling";
      label: string;
      jobId?: string;
      currentStep?: string;
    }
  | {
      kind: "failed";
      label: string;
      message: string;
      jobId?: string;
    };
```

Rule: `uninstalling` is not a permanent app state. It is an operation. While it is active, the app remains visible, destructive/runtime controls are disabled, and the user sees progress or failure.

### Display Priority

Render states in this order:

1. Active operation: spinner/progress and operation label.
2. Readiness badge: Ready, Starting, Paused, Stopped, Unreachable, Unknown.
3. Management badge: Managed, Found, Linked.
4. Attention indicator: Needs review, Conflict, Blocked.
5. One next action in the rail when attention or readiness requires it.

---

# Concept 1: Canonical User-Visible App States

## Story 1.1: Introduce a Split App Behavior View Model

### User Outcome

As a user, I see consistent app state language everywhere instead of one page saying "Ready" while another says "Needs review" for the same app.

### Scope

Add a canonical frontend-facing app behavior model that separates management, readiness, attention, and operation state. The model can initially live in the Applications Page rebuild layer, but it should be shaped so it can move into the shared application-state repository.

### Candidate Files

- Modify `frontend/src/pages/ApplicationsPageRebuild/extensions/ApplicationsPage.types.ts`.
- Modify `frontend/src/pages/ApplicationsPageRebuild/extensions/ApplicationsPage.liveModel.ts`.
- Modify `frontend/src/pages/ApplicationsPageRebuild/extensions/ApplicationVisuals.tsx`.
- Modify `frontend/src/pages/ApplicationsPageRebuild/BasicApplicationsView.tsx`.
- Modify `frontend/src/pages/ApplicationsPageRebuild/AdvancedApplicationsView.tsx`.
- Modify `frontend/src/pages/ApplicationsPageRebuild/ApplicationDetailsRail.tsx`.
- Add or update `frontend/src/pages/ApplicationsPageRebuild/__tests__/ApplicationsPageRebuild.stateModel.contract.test.mjs`.

### Implementation Plan

- [ ] Add `AppManagementState`, `AppReadinessState`, `AppAttentionState`, and `AppOperationState` types.
- [ ] Keep the existing `status` field only as a temporary display projection if needed.
- [ ] Update `ApplicationSurfaceItem` to include `managementState`, `readinessState`, `attentionState`, and `operationState`.
- [ ] Update `buildApplicationSurfaceItems` so managed apps derive those four states from canonical app, health, access, telemetry, and observed-service data.
- [ ] Map current `kind` values to `managementState`.
- [ ] Add a contract test proving managed, found, linked, attention, and paused cases are all represented without relying on a single `status` string.
- [ ] Update basic cards, advanced rows, and the rail to render the new states.
- [ ] Remove page-local checks that treat `runtimeState === "needs_attention"` as the source of truth.

### Acceptance Criteria

- Basic cards show a readiness badge and management badge.
- Advanced rows show readiness, management, and attention without warping the table.
- The rail facts use the same state labels as cards and rows.
- `Needs review`, `Conflict`, and `Blocked` do not replace readiness labels.
- Found and linked services are never displayed as managed apps.
- A contract test fails if a future change removes the split state model.

### Validation

- Run the Applications Page rebuild contract tests.
- Run frontend typecheck.
- Manually inspect Basic and Advanced with at least one managed app, one linked app, and one found service.

## Story 1.2: Replace One-Off Status Badges With Shared State Components

### User Outcome

As a user, badges look and mean the same thing whether I am on the card grid, operations table, or app rail.

### Scope

Create shared visual components for readiness, management, attention, and operation states. These components should be small, semantic, and easy to reuse across future pages.

### Candidate Files

- Create `frontend/src/pages/ApplicationsPageRebuild/components/AppStateBadges.tsx`.
- Modify `frontend/src/pages/ApplicationsPageRebuild/extensions/ApplicationVisuals.tsx`.
- Modify `frontend/src/pages/ApplicationsPageRebuild/BasicApplicationsView.tsx`.
- Modify `frontend/src/pages/ApplicationsPageRebuild/AdvancedApplicationsView.tsx`.
- Modify `frontend/src/pages/ApplicationsPageRebuild/ApplicationDetailsRail.tsx`.

### Implementation Plan

- [ ] Create `ReadinessBadge`.
- [ ] Create `ManagementBadge`.
- [ ] Create `AttentionIndicator`.
- [ ] Create `OperationBadge`.
- [ ] Use icons only where they improve scanability: check for ready, spinner for operation, warning for attention, link/search/server-style icon for management.
- [ ] Replace the current `ApplicationStatusBadge` and `ApplicationKindBadge` usage on the rebuild page.
- [ ] Keep colors semantic and stable: green for ready, cyan/blue for active operation, slate for paused/unknown, orange for review, red for blocked/conflict.
- [ ] Add source-level contract coverage that cards, rows, and rail import these shared state components.

### Acceptance Criteria

- A user can scan the grid and understand readiness without opening the rail.
- A user can distinguish Managed, Found, and Linked without reading a paragraph.
- Attention indicators are compact and do not compete with the one rail next action.
- Operation state visibly overrides normal badges while work is active.

### Validation

- Run contract tests for shared badge usage.
- Run typecheck.
- Manually validate card and table density at desktop and narrow widths.

---

# Concept 2: Operation And Job Surface

## Story 2.1: Add App Operation State From Local Actions And Durable Jobs

### User Outcome

As a user, when I start, stop, restart, save settings, back up, or uninstall an app, I can see that Project OS is doing work and I know which controls are temporarily unavailable.

### Scope

Introduce an app-level operation selector that merges short-lived local action state with durable backend jobs. Local action state is enough for start, stop, restart, and settings save. Durable jobs should be used for uninstall, backup, restore, install, and future longer-running operations.

### Candidate Files

- Modify `frontend/src/pages/ApplicationsPageRebuild/ApplicationsPage.tsx`.
- Modify `frontend/src/pages/ApplicationsPageRebuild/extensions/ApplicationsPage.types.ts`.
- Modify `frontend/src/pages/ApplicationsPageRebuild/extensions/ApplicationsPage.liveModel.ts`.
- Create `frontend/src/pages/ApplicationsPageRebuild/extensions/ApplicationsPage.operations.ts`.
- Use or extend `frontend/src/api/JobsAPIClient.ts` if present.
- Use or create `frontend/src/repositories/jobRepository.ts`.

### Implementation Plan

- [ ] Create `operationStateForItem(item, localAction, settingsAction, activeJobs)` as a pure selector.
- [ ] Map local runtime actions:
  - `start` -> `{ kind: "starting", label: "Starting" }`
  - `stop` -> `{ kind: "stopping", label: "Pausing" }`
  - `restart` -> `{ kind: "restarting", label: "Restarting" }`
- [ ] Map settings actions:
  - `planning` remains local form state, not app operation.
  - `saving` -> `{ kind: "saving_settings", label: "Saving settings" }`
- [ ] Map durable jobs by `appId` or subject metadata:
  - `backup` -> `{ kind: "backing_up", label: "Creating backup", jobId, currentStep }`
  - `uninstall_app` -> `{ kind: "uninstalling", label: "Uninstalling safely", jobId, currentStep }`
- [ ] Map failed durable jobs:
  - terminal failed uninstall or backup -> `{ kind: "failed", label: "Action failed", message, jobId }`
- [ ] Keep failed operation visible until dismissed or until a successful refresh/action clears it.
- [ ] Add tests for precedence: uninstall job beats local restart, failed job beats idle, local start beats idle.
- [ ] Thread `operationState` into cards, rows, and rail.

### Acceptance Criteria

- Starting an app shows a per-app operation state immediately.
- Saving settings shows an operation state in the rail while the save is running.
- Uninstalling app remains visible and clearly marked until job completion removes or refreshes it.
- Failed uninstall keeps the app visible and shows user-safe failure copy.
- Controls that would conflict with the active operation are disabled with a reason.
- Multiple apps can show independent operation states at the same time.

### Validation

- Unit test the selector with local actions, active jobs, failed jobs, and multiple apps.
- Contract test that Basic, Advanced, and Rail consume `operationState`.
- Manual validation:
  - start one app,
  - restart another,
  - begin uninstall,
  - refresh while uninstalling,
  - simulate failed uninstall.

## Story 2.2: Build Compact And Expanded Job UI Surfaces

### User Outcome

As a user, I can see progress without the page becoming noisy. If I need detail, I can open the app rail or global job surface.

### Scope

Create two operation/job surfaces:

- Compact app-level operation display for cards and rows.
- Expanded operation detail in the app rail.

This story should not build a global all-jobs center unless needed for app migration. It should leave the component API compatible with a future global job indicator.

### Candidate Files

- Create `frontend/src/pages/ApplicationsPageRebuild/components/AppOperationStatus.tsx`.
- Modify `frontend/src/pages/ApplicationsPageRebuild/BasicApplicationsView.tsx`.
- Modify `frontend/src/pages/ApplicationsPageRebuild/AdvancedApplicationsView.tsx`.
- Modify `frontend/src/pages/ApplicationsPageRebuild/ApplicationDetailsRail.tsx`.
- Modify `frontend/src/pages/ApplicationsPageRebuild/ApplicationManagementPanel.tsx`.

### Implementation Plan

- [ ] Create `CompactOperationStatus`.
- [ ] Render spinner, label, and current step when operation is active.
- [ ] Render failure state with warning icon and short error copy.
- [ ] Create `ExpandedOperationStatus`.
- [ ] Render job step detail if `currentStep` exists.
- [ ] Render retry or diagnostics controls only if real actions exist; otherwise show no dead button.
- [ ] Place compact status:
  - Basic card lower metadata area.
  - Advanced row operation/status area.
- [ ] Place expanded status:
  - Top of the right rail under app identity.
  - Top of management panel when operation is active.
- [ ] Add tests or source contracts proving compact and expanded surfaces are used.

### Acceptance Criteria

- Active operation state is visible on the card or row without opening details.
- Expanded details appear in the rail without pushing core actions far below the fold.
- Operation status does not create a second competing next-action card.
- Failed operation copy is user-actionable and not raw Docker/job error text.

### Validation

- Run frontend tests and typecheck.
- Manually validate active operation display on Basic and Advanced.
- Manually validate mobile rail does not clip operation copy.

---

# Concept 3: Destructive Action Pattern Hardening

## Story 3.1: Create A Shared Plan-Confirm-Run Pattern

### User Outcome

As a user, before Project OS removes, recovers, cleans up, restores, or resets anything risky, I can see what will happen and confirm it intentionally.

### Scope

Create a shared frontend pattern for destructive or high-impact app actions. It should support loading a plan, displaying user-safe impact, requiring confirmation when needed, running the action, and handing off to operation/job state.

### Destructive Action Contract

```ts
type DestructiveActionPlan = {
  title: string;
  summary: string;
  severity: "warning" | "danger";
  preservesDataByDefault: boolean;
  requiresTextConfirmation?: string;
  steps: string[];
  warnings: string[];
  blockedReasons: string[];
  runLabel: string;
};
```

### Candidate Files

- Create `frontend/src/pages/ApplicationsPageRebuild/components/DestructiveActionDialog.tsx`.
- Create `frontend/src/pages/ApplicationsPageRebuild/extensions/ApplicationsPage.destructiveActions.ts`.
- Modify `frontend/src/pages/ApplicationsPageRebuild/ApplicationManagementPanel.tsx`.
- Modify `frontend/src/api/InstalledAppsAPIClient.ts`.
- Reuse current backend uninstall plan and uninstall job endpoints where available.

### Implementation Plan

- [ ] Create a reusable `DestructiveActionDialog` using `AlertDialog`.
- [ ] Require every instance to receive:
  - a real `loadPlan` function,
  - a real `runAction` function,
  - a disabled reason when unavailable.
- [ ] Render loading state while the plan loads.
- [ ] Render blocked reasons before warnings.
- [ ] Render data preservation status prominently.
- [ ] Require text confirmation only when the plan asks for it.
- [ ] Disable the run button when blocked, loading, missing confirmation, or another operation is active.
- [ ] On run success, close the dialog and let `operationState` show progress.
- [ ] On run failure before job creation, show sticky failure copy in the dialog and global notification.
- [ ] Add a source contract that forbids destructive action buttons in the management panel from bypassing `DestructiveActionDialog`.

### Acceptance Criteria

- No destructive app action is a direct button click.
- The user sees what Project OS will stop, remove, preserve, or change.
- Data preservation defaults are visible.
- Blocked plans cannot be run.
- The dialog never shows fake or no-op actions.
- Starting the action hands off to the app operation/job surface.

### Validation

- Frontend tests for loading, blocked, confirmation-required, run-success, and run-failure states.
- Manual validation with uninstall plan success, blocked plan, and plan load failure.

## Story 3.2: Migrate Uninstall To The Shared Destructive Pattern First

### User Outcome

As a user, uninstalling an app feels safe and trackable. The app remains visible while Project OS removes it, and failure does not make the app disappear.

### Scope

Use uninstall as the first real implementation of the destructive action pattern. This is the highest-value path because uninstall is already job-oriented in the old page and has the clearest safety requirements.

### Candidate Files

- Modify `frontend/src/pages/ApplicationsPageRebuild/ApplicationManagementPanel.tsx`.
- Modify `frontend/src/pages/ApplicationsPageRebuild/ApplicationsPage.tsx`.
- Modify `frontend/src/pages/ApplicationsPageRebuild/extensions/ApplicationsPage.operations.ts`.
- Modify `frontend/src/api/InstalledAppsAPIClient.ts`.
- Use existing backend:
  - `GET /api/apps/{id}/uninstall-plan`
  - `POST /api/apps/{id}/uninstall`

### Implementation Plan

- [ ] Confirm current uninstall plan endpoint shape.
- [ ] Add a mapper from backend uninstall plan to `DestructiveActionPlan`.
- [ ] Replace the current wireframe uninstall dialog in the management panel with `DestructiveActionDialog`.
- [ ] Run uninstall through `POST /api/apps/{id}/uninstall`.
- [ ] Invalidate application state and jobs after job creation.
- [ ] Keep the app visible while `operationState.kind === "uninstalling"`.
- [ ] Disable start, stop, restart, settings save, backup, and additional uninstall while uninstalling.
- [ ] On job success, refresh application state and remove the app from the visible list only after the backend no longer returns it.
- [ ] On job failure, keep the app visible and set operation failure copy.
- [ ] Add regression tests for visible-while-uninstalling and visible-after-failed-uninstall.

### Acceptance Criteria

- Clicking uninstall loads and displays a real plan.
- User cannot run uninstall until the plan is available and unblocked.
- Starting uninstall returns a job and shows `Uninstalling safely`.
- A second app can be acted on while the first app is uninstalling.
- Failed uninstall leaves the app visible.
- Successful uninstall removes the app only after refreshed state confirms removal.

### Validation

- Frontend tests for plan load, job start, active uninstall state, failed job state, and final refresh.
- Manual validation:
  - uninstall one app,
  - start another app while uninstall runs,
  - refresh during uninstall,
  - simulate failure,
  - confirm app remains visible with actionable copy.

---

# Recommended Lean-Slice Order

1. Story 1.1: Add the split app behavior view model.
2. Story 1.2: Replace status/kind badges with shared state components.
3. Story 2.1: Add operation state selector from local actions and jobs.
4. Story 2.2: Add compact and expanded operation surfaces.
5. Story 3.1: Add shared destructive action dialog.
6. Story 3.2: Migrate uninstall to the destructive pattern.

This order keeps each slice user-visible and avoids building generic infrastructure that is not immediately exercised.

---

# Migration Notes From Current Rebuild

The current rebuild already has useful starting points:

- `ApplicationSurfaceItem` centralizes per-item data for the rebuild.
- `buildApplicationSurfaceItems` already maps managed apps and observed services.
- `BasicApplicationsView`, `AdvancedApplicationsView`, and `ApplicationDetailsRail` already share the same item model.
- Per-app local action loading exists for start, stop, restart, and settings save.
- The old Applications Page already has uninstall job behavior that can be ported.

The refactor should preserve this structure and make the state contract more explicit. Avoid reintroducing the old large modal, inline row expansion, or page-local health logic.

---

# Definition Of Done

This overhaul is ready to call complete when:

- Basic, Advanced, and Rail all render management, readiness, attention, and operation from the same item contract.
- Found and linked services are not shown as managed apps.
- Active operations remain visible across cards, rows, and rail.
- Uninstall is plan-first, job-backed, and keeps apps visible while running.
- Failed destructive jobs leave the app visible with user-safe copy.
- No destructive action bypasses the shared plan-confirm-run pattern.
- Source or unit tests protect the state contract and uninstall behavior.
- Manual validation covers managed, found, linked, ready, paused, unreachable, needs review, conflict or blocked, active operation, failed operation, and uninstall.
