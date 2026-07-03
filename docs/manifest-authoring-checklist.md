# Manifest Authoring Checklist

Use this checklist before adding or updating a catalog app manifest.

## Required App Identity

- `id` uses lowercase letters, numbers, and dashes.
- `metadata.name` is the friendly app name users will recognize.
- `metadata.category`, `description`, `shortValue`, and `tags` are written for non-technical users.
- `user.plainLanguage` explains what the app does without container or networking jargon.
- `technical.summary` explains what Autark-OS will deploy for advanced users.

## Runtime Contract

- `runtime.image` is pinned to a specific version or digest when practical.
- `runtime.containerName` and `runtime.composeProject` are unique.
- `runtime.runtimeRoot` is exactly `/var/lib/project-os/apps/<app-id>`.
- `runtime.ports` uses `host:container` or `host:container/protocol`.
- Preferred host ports do not collide with other manifests for the same protocol.
- `runtime.volumes` use `host:container` and every host path stays under the app runtime root.
- `runtime.backupPaths` are relative paths inside the managed app folder.
- `runtime.privileged` is `false` unless a future story explicitly supports the risk.

## Access Expectations

- `access.kind` is one of:
  - `web`: single primary browser UI.
  - `api`: service endpoint intended for apps or integrations.
  - `background`: no user-facing browser UI.
  - `multi-port`: multiple user-visible or infrastructure ports.
- `access.defaultMode` is one of:
  - `local`
  - `private`
  - `local-and-private`
  - `none`
- `access.privateAccessRecommended` reflects whether Tailscale should be encouraged.
- `access.requiresFirstRunSetup` is `true` when the app needs account creation, pairing, onboarding, or initial admin setup.
- `access.notes` explains why the selected access mode is appropriate.
- Web/API/multi-port apps have a `metadata.accessUrl`.
- Background apps leave `metadata.accessUrl` blank.

## One-Click Install Readiness

- Preferred port is sensible and can be moved by automatic port allocation.
- Container port maps to the real UI or service endpoint.
- Volumes cover all durable data needed for restart/reinstall.
- Backup paths include databases, config, and uploaded user data.
- First-run credentials or onboarding caveats are documented in `access.notes` or `technical.includes`.
- Network-sensitive apps explain local-vs-private behavior clearly.

## Test Expectations

- `MarketplaceCatalogServiceTests.everyCatalogManifestGeneratesAnInstallPlan` passes.
- `MarketplaceCatalogServiceTests.everyCatalogManifestDeclaresAccessExpectations` passes.
- New validation failures should be handled in `ManifestValidatorTests`.
- Run `cd backend && ./gradlew test` before considering a manifest ready.
