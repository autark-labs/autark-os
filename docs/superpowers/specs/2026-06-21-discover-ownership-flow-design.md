# Discover Ownership Flow Design

## Purpose

Fix the Discover page so it tells the truth about ownership and gives users a clearer install path. Discover should feel like an app store, not a mixed view of managed apps, linked services, and host inventory. It must still help users handle existing services safely.

This design covers the next implementation slice:

- honest installed/found/linked state across Discover and Applications
- compact, visually stable Discover cards
- a shorter selected-app detail panel with progressive disclosure
- duplicate-install warnings that strongly discourage accidental second copies
- links from Discover to Applications for adoption or review

It does not implement adoption itself inside Discover.

## Product Rules

`Installed` means the current Project OS instance owns and manages the app. A service is not installed just because Project OS can open it, link to it, or detect it.

Discover may allow a user to install a Project OS-managed copy when another matching service exists, but that path is discouraged and must show a strong warning first.

Applications owns existing-service review, adoption, recovery, and linked-service management. Discover only links to those flows.

## Ownership States

The backend Discover view model should expose one canonical state per catalog app:

- `installed_managed`: installed and owned by this Project OS instance.
- `found_on_server`: local resource detected on this server, not yet managed by this instance.
- `linked_service`: user-added or network-linked service that Project OS can open but cannot install-manage.
- `managed_elsewhere`: resource appears to be owned by another Project OS instance.
- `recoverable`: legacy or unscoped local Project OS resource that may be brought under management.
- `blocked`: conflict that should be reviewed before normal install.
- `available`: no known matching service.

The frontend may display friendlier labels, but it must not reinterpret these states into `Installed`.

## Discover Card Behavior

Cards stay compact and scannable. They show only:

- icon
- app name
- one state label
- one short value prop
- setup time and difficulty when space allows
- one primary action
- optional overflow menu

Card state labels:

- `Installed`
- `Existing service`
- `Linked service`
- `Managed elsewhere`
- `Recoverable`
- `Blocked`
- `Available`

Cards should not explain duplicate-service risk. The card only signals that something exists and invites review.

Primary actions:

- installed managed: `Manage`
- available: `Review setup`
- found/recoverable/managed elsewhere/linked: `Review`
- blocked: `Review issue`

The card layout must use stable dimensions so text wrapping does not change card height unpredictably. Long app names and summaries should clamp, not push action rows out of alignment.

## Selected App Detail Behavior

The selected-app detail panel is where Discover explains what the state means.

For available apps:

- show compact app summary
- show guided setup
- show install preview
- keep About, requirements, and technical details collapsed

For existing services:

- show an `Existing service found` section near the top
- explain in plain language that Project OS found a matching service
- make `Review existing in Applications` the preferred action
- put `Install a separate Project OS copy` behind secondary disclosure

Example copy:

> Project OS found Jellyfin already running. Reviewing it first is recommended. If it is the Jellyfin you already use and it runs on this server, Applications can guide you through bringing it under Project OS management. If it is only a network link, Project OS will keep it as a linked service instead.

The detail panel should avoid long lists of features, raw metadata, smoke tests, source links, and technical plan details by default. Those belong in collapsed sections or an advanced technical dialog.

## Duplicate Install Warning

If a user chooses to install a separate managed copy while a matching existing service is known, Discover must show a confirmation dialog before starting the install preview or install.

The warning should be strong and non-technical:

> Project OS already found Jellyfin. Installing a separate copy means you may have two Jellyfins on your server or network.
>
> This can cause strange behavior:
> - Your TV, phone, or browser may open the wrong Jellyfin.
> - Settings and libraries may not match between the two copies.
> - Troubleshooting will be harder because both services may look similar.
>
> Recommended: review the existing service first. Continue only if you intentionally want a second, separate Jellyfin.

Dialog actions:

- primary safe action: `Review existing instead`
- secondary dangerous action: `I understand, install separate copy`

The dangerous action must be explicit and should not look like the default recommendation.

## Applications Integration

Discover routes existing-service review to Applications.

Routes:

- local detected service: `/apps/found?resource=<resourceId>`
- linked service: `/apps?linked=<serviceId>`
- managed elsewhere/recoverable: `/apps/found?resource=<resourceId>`

Applications owns:

- adoption plan generation
- adoption confirmation
- recovery for legacy Project OS resources
- linked-service rename/remove/open actions
- warnings when Project OS cannot truly manage a network-only service

This slice only needs Discover to link correctly and stop mislabeling states.

## Backend Contract

`DiscoverAppView` should include enough state to prevent frontend guessing:

- `state`
- `stateLabel`
- `stateDescription`
- `primaryAction`
- `primaryActionLabel`
- `ownedByCurrentInstance`
- `canInstallManagedCopy`
- `installCopyWarningRequired`
- `reviewExistingHref`
- `installedApp`
- `foundResource`
- `linkedService`

The backend should calculate `installed_managed` only when the installed app belongs to the current Project OS instance. If a linked service or found resource matches the catalog app, it should appear as a separate state and not set `installed=true`.

If the existing repository currently stores linked/adopted/non-current resources in the same table as installed apps, this slice should add enough ownership metadata or filtering to separate them. Backwards compatibility is not required.

## Error Handling

If Discover cannot load ownership state, it should not optimistically show apps as installed. It should show a page-level error or mark uncertain items as requiring review.

If the user tries to install a managed copy while a warning is required, the frontend must block direct install until the warning has been acknowledged.

If Applications review links cannot be generated, show a disabled action with a reason instead of a dead button.

## Testing

Backend tests should cover:

- linked service matching a catalog app is not installed
- found local service matching a catalog app is not installed
- current-instance managed app is installed
- managed-elsewhere app is not installed
- duplicate install warning flags are returned when appropriate
- review links are generated for found/recoverable resources

Frontend tests should cover:

- cards render compact state labels without long explanatory copy
- existing-service detail panel prefers review/adoption path
- separate install shows the strong duplicate warning
- acknowledging the warning allows install
- `Hide installed` hides only current-instance managed installs

Manual validation should include:

- clean server with available apps only
- current-instance installed app
- linked service matching a catalog app
- local found service matching a catalog app
- foreign Project OS app
- narrow mobile viewport for card and detail-panel wrapping

## Definition Of Done

- Discover never labels linked, found, recoverable, or foreign resources as simply installed.
- Existing-service cards stay compact and route to detail instead of explaining everything inline.
- The detail panel strongly recommends reviewing/adopting existing services before installing a second copy.
- Installing a duplicate managed copy requires explicit acknowledgment.
- Applications is the only destination for adoption/recovery review.
- Card heights and action rows remain visually consistent across typical app names and summaries.
- Backend and frontend tests cover the state split.
