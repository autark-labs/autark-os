# Application State Prune List

This list tracks duplicate or legacy application-state surfaces to remove after the canonical app-state refactor is stable.

Canonical surfaces:

- Managed apps: `AppInstanceViewProvider` / `GET /api/app-instances`
- Observed/found/recoverable/pinned services: `ObservedServiceService` / `GET /api/observed-services`
- Marketplace ownership: `AppOwnershipProvider` / `GET /api/app-ownership`
- Discover marketplace: `DiscoverService` / `GET /api/discover/apps`

Prune after consumers are migrated:

- `GET /api/apps` as a user-facing app-list source. Keep lifecycle mutations only until they are moved to an app-instance action namespace.
- `InstalledAppsAPIClient.listApps()` after Access and Settings no longer need `AppRuntimeView`. Devices and standalone Updates pages have been removed.
- `HostInventoryAPIClient`, `FoundResourcesBanner`, and `frontend/src/types/host.ts`.
- `HostInventoryController`, `HostInventoryService`, `HostInventoryProvider`, `HostInventoryIgnoreRepository`, `HostResourceActionService`, `HostInventoryResource`, and `DevHostInventoryController`.
- Host-inventory usage in `SetupStatusService` and `SystemSetupService`; replace with observed-service conflict/recovery state.
- `MarketplaceController`, `MarketplaceAPIClient`, and `MarketplaceInstallClient`; Discover is the marketplace API.
- `foundResource` fields on `AppOwnershipView`, `DiscoverAppView`, and matching frontend types.
- Activity-log special handling for old `/api/marketplace` and `/api/apps` namespaces once action routes move.

Already migrated to canonical managed-app state:

- `BackupService` reports, full backup eligibility, and restore affected-app resolution.
- `AppLifecycleService` list, telemetry, access checks, health snapshots, reliability summary, setup-guide context, and single-app lookup guard.
- `AppUpdateService` status listing and single-app lookup guard.
- `StorageService` app storage reporting and orphan protection.
- Home page found/pinned service rendering.
- Support/Diagnostics found-service rendering.
- Network pinned external service filtering.
