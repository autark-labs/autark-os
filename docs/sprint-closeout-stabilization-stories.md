# Sprint Closeout Stabilization Stories

These stories close the gaps found during the sprint-end review. The goal is to finish the unified state/cache direction without reopening broad rewrites.

## Story 1: Recover Active Backup Jobs After Refresh

**Status:** Implemented.

**Problem:** Backup, verification, and restore jobs are durable on the backend, but the Backups page only tracks the active job in local component state. A browser refresh loses the progress banner until the user starts another action.

**Scope:**
- Add a backup jobs query that reads `/api/jobs`.
- Derive active `backup`, `backup_verify`, and `backup_restore` jobs from the jobs list.
- Show the latest active backup job after a browser refresh.
- Continue polling the job and refresh the backup report when it completes.

**Acceptance Criteria:**
- Refreshing the Backups page during backup, verification, or restore shows the in-progress banner again.
- Terminal jobs are not shown as active work.
- Completion refreshes restore points and backup app status.
- Regression coverage proves the active backup job selector filters and sorts correctly.

**Implementation Note:** Backups now reads the durable jobs list through the backup repository, selects the newest active backup-related job, and resumes the existing job progress query after page reload.

## Story 2: Replace Setup Host Inventory With Observed-Service State

**Status:** Implemented.

**Problem:** Setup still reads `HostInventoryProvider`, keeping a second found-resource interpretation path alive and risking slow host scans during setup.

**Scope:**
- Replace setup existing-install checks with observed-service or application-state-backed data.
- Preserve current dev-mode copy and conflict behavior.
- Delete `HostInventoryProvider`, `HostInventoryResource`, and `HostInventoryService` if no internal consumers remain.

**Acceptance Criteria:**
- Setup, Home, My Apps, Discover, and Diagnostics agree on recoverable/foreign/conflict state.
- Setup does not trigger a host inventory scan outside the observed-service refresh path.
- Host inventory classes are deleted or documented as intentionally internal.

**Implementation Note:** Setup status and setup readiness now read cached `ObservedService` rows. The backend `HostInventoryProvider`, `HostInventoryResource`, `HostInventoryService`, and `HostInventoryIgnoreRepository` classes were deleted after setup consumers migrated.

## Story 3: Move Discover Loading And Job Polling Into Repositories

**Status:** Implemented.

**Problem:** Discover still performs page-local loading and manual job polling for install and backup jobs.

**Scope:**
- Add a Discover repository for app catalog, activity, readiness, setup schema, preview, install, and recovered jobs.
- Use React Query for install/backup job polling.
- Remove page-local `setInterval` usage from Discover.

**Acceptance Criteria:**
- Discover has no direct `setInterval` or page-local API orchestration for routine data.
- Install and post-install backup progress survives page refresh.
- Install completion invalidates Discover, app-state, and activity caches once.

**Implementation Note:** Discover now reads catalog, activity, readiness, install preview, install mutations, post-install backup mutations, durable job recovery, and job progress through `discoverRepository`. The page no longer imports API clients directly or owns `setInterval` job polling.

## Story 4: Move Home Summary Data Into A Repository

**Status:** Implemented.

**Problem:** Home still polls summary, recommended action, and activity with local state instead of the frontend repository layer.

**Scope:**
- Add a Home repository for system summary, recommended action, and major activity.
- Keep app and observed-service data from the application-state repository.
- Remove Home page-local polling.

**Acceptance Criteria:**
- Home uses repository hooks for all remote data.
- Background refresh does not blank the page.
- Recommended action and activity refresh consistently across navigation.

**Implementation Note:** Home now reads system summary, recommended action, and major activity through `homeRepository`. The page no longer imports API clients directly or owns interval polling, so background refreshes use React Query cache updates without clearing the visible Home state.

## Story 5: Consolidate Modal Telemetry And Shell Doctor Polling

**Status:** Implemented.

**Problem:** The app management modal and shell header still own direct polling loops, duplicating query cache behavior.

**Scope:**
- Move app-modal telemetry into an app management repository query keyed by app id and modal open state.
- Move shell doctor status into a system repository query.
- Share doctor status with Settings and Discover readiness reads where practical.

**Acceptance Criteria:**
- No page/modal/shell code manually polls doctor or telemetry data.
- Modal telemetry polling stops when the modal closes.
- Header, Settings, and Discover use compatible doctor cache keys.

**Implementation Note:** Shell doctor status now uses `systemRepository` with a shared `['system', 'doctor']` query key. Discover readiness and Settings reuse that doctor query. App management modal telemetry now uses `appManagementRepository`, keyed by app id and modal open state, so telemetry polling stops when the dialog closes.

## Story 6: Split The Largest Files Along Stable Boundaries

**Status:** Implemented.

**Problem:** Several files remain large enough that unrelated behavior can regress together.

**Scope:**
- Extract focused services from `AppLifecycleService` after endpoint consolidation.
- Split `MonitoringPage`, `SettingsPage`, and `MarketplacePage` by tested view-model helpers and section components.
- Avoid visual churn unless a section is already broken.

**Acceptance Criteria:**
- Each extracted unit has a narrow API and tests for its business rules.
- Page entry files coordinate data and layout only.
- Existing user flows remain visually stable.

**Implementation Note:** Monitoring chart/resource/trend view models were extracted into `MonitoringPage.viewModels` with focused tests, leaving `MonitoringPage` to coordinate data and layout. Backend app telemetry aggregation was extracted from `AppLifecycleService` into `AppTelemetryService`, preserving managed-app filtering in lifecycle while moving Docker stats aggregation behind a focused service.
