# AGENTS.md

Guidance for AI coding agents working in this repository.

Autark-OS should feel like a calm, powerful appliance: install an app, open it, access it safely, and recover it when something goes wrong. Code should protect that product promise. Favor readable implementation, clear user states, and small validated slices over broad rewrites.

---

## 1. Core Product Principles

### Treat Autark-OS as a guided runtime, not a generic dashboard

The app should help users answer:

- What is installed?
- What is ready to use?
- What needs attention?
- What should I do next?

Avoid surfacing raw infrastructure details unless the user is in an advanced or diagnostics flow.

### Do not blur ownership states

Autark-OS must distinguish between:

- **Managed apps**: owned by the current Autark-OS instance.
- **Found apps**: detected on the host but not owned by this instance.
- **Linked services**: user-added shortcuts or externally managed services.
- **Conflicts**: resources that block install or recovery.

Never show a foreign or legacy app as simply “Installed” for the current instance. Use language such as “Found on this server,” “Owned by another Autark-OS instance,” “Recoverable,” or “Linked service.”

### One clear next action

Each page should have one obvious primary action. Do not add multiple competing banners, alerts, or hero actions. When in doubt, use the canonical recommended-action/state model instead of inventing page-specific health logic.

---

## 2. Development Workflow

### Work in lean slices

Each change should be small enough to validate both behavior and look/feel before moving on.

A good slice includes:

1. Backend or state-model change, if needed.
2. Frontend rendering of that state.
3. Loading, empty, success, and error states.
4. A visible way to test the feature manually.
5. Tests or smoke coverage for the important path.

Avoid landing invisible infrastructure unless it directly unlocks the current slice.

### No partial state-model implementations

When a request is to consolidate, replace, or make a single source of truth for a product concept, the work is not done until every active backend and frontend consumer uses that source or the user has explicitly approved a temporary exception.

Required behavior:

- Identify every endpoint, service, page, component, and client that reads or derives the affected state before editing.
- Add regression coverage for the exact cross-page or cross-endpoint mismatch being fixed.
- Migrate all active consumers in the same corrective pass.
- Do not leave parallel interpretation paths that can produce different user-facing answers.
- Do not call an implementation complete because the primary page works while secondary pages still compose state independently.
- If full migration is too large or risky, stop and ask before landing a partial implementation.

For application state specifically, Home, My Apps, Discover, Access, Backups, Storage, Monitoring, Settings, Support, and onboarding/setup must not independently decide what is installed, pinned, found, recoverable, or managed. Those states must come from the canonical application-state model.

### No partial cross-surface product behavior

When implementing a user-facing behavior pattern, update every active surface that exposes that behavior in the same pass. Examples include disabled-action explanations, install job progress, ownership labels, action notifications, app status badges, and recovery/cleanup safety copy.

Required behavior:

- Identify the active pages, dialogs, drawers, popovers, cards, and shared components that expose the behavior before editing.
- Update every active surface or stop and ask for an explicit lean-slice exception before coding.
- A lean-slice exception must name the excluded surfaces, explain why they are excluded, and leave a concrete follow-up story or checklist.
- Do not report a behavior as implemented if only the primary page, happy path, or newest component reflects it.
- Prefer shared components and contract tests for cross-surface behaviors so future changes cannot quietly drift back into partial implementations.

### Prefer additive refactors over broad rewrites

Refactor behind stable APIs/components when possible. Do not churn unrelated files. Preserve working behavior while simplifying the implementation.

### No dead controls

Every visible button, link, card click, dropdown item, and menu action must do one of the following:

- Perform the action.
- Navigate to the right screen.
- Open a modal/drawer/popover.
- Be hidden until it is implemented.
- Be explicitly disabled with a reason.

Never leave placeholder actions in production UI.

---

## 3. Code Readability Standards

### Optimize for the next human reader

Prefer clear names over clever abstractions.

Good:

```ts
const isForeignProjectOsApp = app.ownershipState === "foreign_project_os";
const canRecoverApp = app.availableActions.includes("recover");
```

Avoid:

```ts
const flag = x.state !== "owned" && x.a?.includes("r");
```

### Keep functions small and purposeful

A function should generally do one job:

- classify a resource
- map backend state to UI copy
- submit an action
- render a visual section

If a component contains several unrelated decisions, split it into smaller components or helper functions.

### Prefer explicit types

Use typed data contracts for app state, ownership state, install jobs, backup status, access status, and action results. Avoid `any` unless there is no reasonable alternative, and replace temporary loose types as soon as the shape stabilizes.

### Keep business rules out of visual components

Visual components should not independently decide whether an app is installed, recoverable, protected, or safe to delete. Prefer backend-owned or shared view models.

Good:

```tsx
<AppStatusBadge status={app.userStatus} tone={app.statusTone} />
```

Avoid spreading ownership logic throughout cards, pages, and modals.

---

## 4. UI Component Standards

### Use shadcn/ui heavily

Default to shadcn/ui and Radix primitives before creating custom UI.

Prefer these building blocks:

- `Button`
- `Card`
- `Badge`
- `Alert`
- `Dialog`
- `Sheet`
- `Popover`
- `DropdownMenu`
- `Tooltip`
- `Tabs`
- `Accordion`
- `Table`
- `Separator`
- `ScrollArea`
- `Skeleton`
- `Command`
- `Sonner`

Create custom components by composing shadcn primitives, not by bypassing them.

### Build project-level components for repeated patterns

Use reusable Autark-OS components for repeated product concepts:

- `PageHeader`
- `AppCard`
- `StatusBadge`
- `ActionToast`
- `RecommendedActionCard`
- `EmptyState`
- `IssueBanner`
- `InstallPlanDialog`
- `TailscalePopover`
- `OwnershipResolutionCard`
- `AdvancedDisclosure`
- `JobProgress`

Do not duplicate the same card, badge, alert, or status treatment on multiple pages.

### Keep pages calm

Use high-energy visuals for moments that should feel magical:

- Home hero
- Discover app cards
- Successful install completion
- Setup completion

Use quieter layouts for operational pages:

- My Apps
- Access
- Backups
- Storage
- Settings
- Diagnostics

Avoid nested cards unless the nesting reveals meaningful detail.

---

## 5. Tailwind And Styling Guidelines

### Favor semantic design tokens

Prefer shadcn/Tailwind theme tokens over raw colors and magic values.

Good:

```tsx
<Card className="border-border bg-card text-card-foreground shadow-sm" />
```

Good:

```tsx
<p className="text-sm text-muted-foreground" />
```

Avoid:

```tsx
<div className="bg-[#15122a] text-[#f6f3ff] border-[#3c315f]" />
```

Raw hex values and arbitrary one-off colors should be rare and justified.

### Prefer human-readable Tailwind usage

Tailwind class strings should be easy to scan. Group classes roughly by purpose:

1. layout
2. sizing
3. spacing
4. typography
5. color/theme
6. border/radius/shadow
7. interaction/state
8. responsive variants

Example:

```tsx
<div
  className={cn(
    "flex items-center justify-between gap-3",
    "rounded-xl border border-border bg-card p-4 shadow-sm",
    "transition-colors hover:bg-accent/40"
  )}
>
```

Prefer `cn()` for conditional classes.

Good:

```tsx
<Badge
  className={cn(
    "rounded-full px-2.5 py-0.5 text-xs font-medium",
    statusTone === "success" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    statusTone === "warning" && "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
  )}
/>
```

For repeated variants, prefer `class-variance-authority` or a dedicated status component over copy-pasted conditionals.

### Avoid unreadable arbitrary values

Avoid this unless there is a strong visual reason:

```tsx
className="mt-[17px] w-[423px] rounded-[19px] bg-[linear-gradient(...)]"
```

Prefer theme spacing, named tokens, CSS variables, or a small reusable component.

### Do not use inline `style` for normal UI

Avoid:

```tsx
<div style={{ marginTop: 17, background: "#19152d" }} />
```

Inline styles are acceptable only for truly dynamic values, such as measured dimensions, CSS variable assignment, generated chart positions, or user-controlled preview values.

---

## 6. State, Data, And API Guidelines

### Keep frontend state derived from backend view models

The frontend should render canonical state, not reconstruct it from raw Docker, setup, backup, or Tailscale details.

Prefer endpoints/view models like:

- system summary
- recommended action
- reconciled app views
- host inventory
- ownership conflicts
- access status
- backup status
- install/update job status

### Mutations should return useful action results

State-changing actions should return a consistent result shape that can drive global notifications.

Example:

```ts
type ActionResult = {
  ok: boolean;
  severity: "success" | "info" | "warning" | "error";
  title: string;
  message?: string;
  nextAction?: {
    label: string;
    href?: string;
    method?: string;
  };
};
```

Do not make every page invent its own success/error handling.

### Long-running operations should be jobs

Install, recover, cleanup, backup, restore, and update operations should be durable jobs when they can outlive a request.

A job should expose:

- current step
- completed steps
- failed step
- user-safe error message
- technical error detail for diagnostics
- cancelability, if supported

The UI should be able to refresh during a job and continue showing accurate progress.

---

## 7. Ownership, Recovery, And Cleanup Rules

### Never silently adopt resources

Docker containers, volumes, compose projects, or services from another instance should not be imported automatically.

Safe flow:

1. Detect.
2. Classify.
3. Explain.
4. Offer actions.
5. Require confirmation for destructive changes.

### Separate recovery from cleanup

Recovery means bringing an existing app under current Autark-OS management while preserving data.

Cleanup means removing old resources. Cleanup should default to preserving data. Permanent data deletion requires explicit confirmation.

### Use plan-then-apply for destructive or complex actions

For adoption, recovery, cleanup, uninstall, restore, and migration, prefer a two-step pattern:

```txt
Generate plan → Review plan → Apply plan
```

The plan should explain:

- what will be stopped
- what will be created
- what will be renamed or relabeled
- what data will be preserved
- what data could be deleted
- how to undo or recover, if possible

---

## 8. Notifications And Feedback

### Use global notifications for action feedback

Actions should show a sticky top notification or toast that persists across navigation when appropriate.

Guidelines:

- Success: short and auto-dismissable.
- Info: short and dismissable.
- Warning/error: sticky until dismissed.
- Long-running action: persistent progress notification or job card.

Page-local red flashes are not enough.

### Make errors user-actionable

Good:

```txt
Vaultwarden could not start because port 8080 is already in use.

Choose a different port or stop the service using that port.
```

Avoid:

```txt
Docker error: bind failed.
```

Technical detail belongs in Diagnostics or an expandable section.

---

## 9. Page-Specific Guidance

### Home

Home should be welcoming, branded, and calm.

Include:

- hero/header treatment
- current server status
- one recommended next action
- managed app shortcuts
- major recent activity only

Do not show noisy health polls, refresh events, repeated diagnostics, or low-level repair chatter.

### My Apps

My Apps should show current-instance managed apps by default.

Foreign, legacy, or external resources should appear only as a banner or separate “Found on this server” flow.

Card behavior must be predictable:

- clicking the card opens details
- `Open` opens the app
- `Manage` opens management
- disabled actions explain why

### Discover

Discover should feel like an app store, not a Docker catalog.

Each app card should clearly show one of:

- Available
- Installed
- Found on this server
- Recoverable
- Blocked by conflict

The install plan should explain what Autark-OS will do in user language, with technical details behind disclosure.

### Access

Access should make Tailscale and app reachability easy to understand.

Use a simple mental model:

- Open Internet
- Private / Tailscale
- Home Network / LAN
- This Server

Avoid complex network topology unless it is in an advanced view.

The Tailscale shell/header control should be the primary quick interaction for sign-in, status, and troubleshooting.

### Diagnostics

Diagnostics is for support and advanced troubleshooting. It should not compete with Home, Settings, or Activity Log.

Default view:

- health checks
- support bundle
- technical logs

Raw Docker, Tailscale, and ownership details should be behind accordions or advanced disclosure.

---

## 10. Accessibility And Interaction

### Use accessible primitives

shadcn/Radix components should handle much of the accessibility foundation. Preserve that behavior when composing custom components.

### Required interaction standards

- Buttons must be keyboard reachable.
- Dialogs must have titles and descriptions.
- Form fields must have labels.
- Icons used as controls need accessible names.
- Color must not be the only status indicator.
- Loading states should not trap the user.
- Destructive actions require clear confirmation.

### Mobile matters

Primary flows should work on narrow screens:

- setup
- install
- open app
- Tailscale status
- ownership resolution
- backup creation

Avoid layouts where the first mobile viewport is only navigation or decorative chrome.

---

## 11. Testing And Validation

### Add tests where behavior can regress

Prioritize coverage for:

- ownership classification
- app reconciliation
- install/recover/cleanup plans
- recommended action priority
- backup state labels
- access status mapping
- action result handling

### Validate before reporting completion

For implementation work, agents should run targeted validation before telling the user the work is complete.

Minimum expectation:

- Run the smallest relevant backend, frontend, or contract tests that cover the changed behavior.
- If the change is UI-only and automated coverage is unavailable, run an appropriate smoke check or clearly state what was manually validated.
- Report the exact validation command and result.
- If validation cannot be run, say why before claiming the work is complete.
- Do not describe a change as done, fixed, or passing without validation evidence.

### Manual validation checklist for UI slices

Before considering a slice done, verify:

- loading state
- empty state
- success state
- warning/error state
- mobile layout
- keyboard interaction for dialogs/popovers
- no dead buttons
- no foreign resources shown as installed
- global notification appears for mutations

### Prefer realistic fixtures

Use fixtures that represent real server states:

- clean install
- existing legacy Autark-OS apps
- foreign Autark-OS instance apps
- external Docker containers
- Tailscale signed out
- Tailscale connected
- no restore point yet
- app container missing
- port conflict

---

## 12. Copy And Tone

### Use plain language

Good:

```txt
Autark-OS found apps from another installation.
```

Avoid:

```txt
Foreign compose resources detected with non-matching instance labels.
```

Use technical detail only when it helps the user decide what to do.

### Be honest about safety

Do not say an app is protected unless a successful restore point exists.

Do not say Autark-OS manages an app unless the current instance owns it.

Do not imply Tailscale is ready in production when the app is using a development mock.

### Prefer action-oriented labels

Good:

- `Review existing apps`
- `Recover app`
- `Create backup`
- `Open app`
- `Check Tailscale`

Avoid vague labels:

- `Proceed`
- `Submit`
- `Run`
- `Fix`

---

## 13. Security And Safety

### Treat Autark-OS as privileged software

Autark-OS can control apps, containers, network access, and backups. Be conservative.

Minimum expectations:

- protect state-changing routes
- never leak secrets in logs or support bundles
- redact tokens, hostnames, private URLs, and credentials where appropriate
- do not enable public exposure by default
- gate destructive actions behind explicit confirmation
- avoid arbitrary user-provided compose execution unless intentionally designed and sandboxed

### Dangerous actions need clear UX

For actions that stop containers, delete resources, alter networking, or change data paths:

- show a plan first
- explain impact
- preserve data by default
- require confirmation for deletion
- emit a durable activity event

---

## 14. What To Avoid

Avoid:

- treating Docker discovery as app installation
- showing foreign apps as installed
- page-specific health logic that contradicts other pages
- no-op buttons or placeholder interactions
- large custom UI when shadcn components fit
- inline styles for ordinary layout and color
- arbitrary Tailwind values without a reason
- deeply nested cards
- noisy activity feeds on Home
- exposing raw infrastructure details in primary user flows
- destructive cleanup without a reviewed plan

---

## 15. Definition Of Done

A change is done when:

- the user-facing state is clear and honest
- the happy path works
- loading, empty, and error states are handled
- destructive actions are safe and confirmed
- global action feedback appears where appropriate
- the UI uses shadcn primitives where practical
- Tailwind classes are semantic and readable
- mobile layout is acceptable
- tests or fixtures cover the critical behavior
- no unrelated files were churned
