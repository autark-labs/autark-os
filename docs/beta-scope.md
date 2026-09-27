# Controlled beta scope

The release eligibility record is [`beta-scope.json`](../backend/src/main/resources/beta-scope.json). Backend policy and browser onboarding/navigation consume that same file. Change it deliberately with regression tests; do not add a runtime flag service, entitlement dependency or a second catalog.

Qualification is **pending**, not passed. Restricting scope does not fix or certify installation, runtime reconciliation or restore safety. The remaining remediation stories and a real-host rehearsal are release gates.

## Primary qualification target

- Debian 12 amd64, systemd, Docker Engine with Compose v2, local Linux filesystem storage.
- Portable `.run` installer; browser-based local administrator setup.
- Core updates through `autark-os update`, with the existing release verification and recovery path.
- Installer prerequisite floor: 2 GB RAM and 10 GB free disk before app data and backups. Record actual Docker/Compose versions, filesystem, memory, disk and artifact digest in qualification evidence.

The broader installer host matrix remains a compatibility check, not a claim that every accepted host has passed beta qualification. Raspberry Pi/ARM64, other distributions and alternate installation paths are not part of this primary release gate.

## Application and backup boundary

The record selects 35 new-install candidates. FreshRSS, Homepage and Syncthing remain the three onboarding/starter suggestions (`starter: true`); select **All apps** in Discover to browse the expanded roster. Eligibility is not certification. Every candidate uses one unprivileged container, managed persistent folders and a stopped-app (`cold_file`) backup contract. Syncthing additionally needs UDP, sync-folder permissions and external-data boundary testing.

This is a curated selection of common self-hosted tools that fit the current runtime, not a measured popularity ranking. Upstream installation references are linked from each manifest. The [Awesome Selfhosted directory](https://github.com/awesome-selfhosted/awesome-selfhosted) informed discovery; upstream deployment documentation and image manifests determined inclusion.

| Group | Apps |
| --- | --- |
| Dashboards and utilities | Homepage, Heimdall, Uptime Kuma, Gotify, Changedetection.io, Stirling PDF |
| Reading, notes and publishing | FreshRSS, Memos, SilverBullet, Flatnotes, Trilium Notes, DokuWiki, Wiki.js, Grav |
| Household and productivity | Actual Budget, Mealie, Grocy, Wallos, Kanboard |
| Media libraries | Jellyfin, Audiobookshelf, Navidrome, Kavita, Komga, Tautulli |
| Files, development and security | Syncthing, Gitea, Gokapi, Vaultwarden |
| Downloads and library tools | Prowlarr, Radarr, Sonarr, SABnzbd, NZBGet, Transmission |

Twenty-two manifests are new; ten previously excluded apps are now eligible alongside the three starters. More complex integrations remain excluded: multi-container databases, host networking/device discovery, host DNS takeover, Docker-admin access and shared media-library orchestration are not added in this pass. Bazarr is excluded because its useful subtitle workflow depends on shared libraries this runtime does not configure.

### Setup boundaries

- The installer uses managed folders, not arbitrary existing-folder imports. Media apps may need content copied into those folders and a library selected in the upstream app.
- New dashboards are loopback-bound and optionally published through Tailscale; they do not open a LAN administration port. New Actual Budget and Vaultwarden installs use private HTTPS in this integration. Tailscale is therefore needed to use their remote browser interfaces, not for Core generally. Owners can still turn off private exposure afterward.
- Some upstream apps ship a default login or no separate login. Their guides identify this; complete account setup before sharing access. Flatnotes deliberately uses upstream's no-login mode: anyone permitted to reach its private link can read, edit and delete notes. Tailnet access rules matter.
- Gitea must use SQLite during its upstream setup. Wiki.js is configured with SQLite. No external database is provisioned.
- Tautulli needs an existing Plex server/account. SABnzbd and NZBGet need a Usenet provider. Download tools and media managers have independent managed folders; Autark does not wire up a shared download/import pipeline or supply indexers, subscriptions or content.
- No automatic app-image updating is introduced. New images are pinned to verified multi-architecture index digests; existing candidates retain their explicit version tags.
- Known Access UI limitation: its generic Home/Server/Private selector still offers Home for private-dashboard apps. The backend rejects that move with a reason and does not open a LAN port. Disabling the incompatible option in the UI is a follow-up; this catalog change does not redesign access capabilities.

### Catalog validation — 2026-09-27

All 35 image references expose AMD64 and ARM64 variants. All 35 passed local AMD64 container startup, HTTP response and stop/start checks using Compose generated by the actual Autark renderer and provisioned catalog files. The temporary harness isolated container names, networks, loopback ports and storage; it did not install through the browser or durable install jobs. HTTP 401 is expected for authenticated endpoints such as NZBGet and Stirling PDF. Komga's first pull encountered a registry connection reset; a subsequent pull and runtime check passed.

This evidence does **not** qualify first-run account setup, application functionality, preserved user data, backup/restore, private HTTPS or ARM64 execution. Manifests retain `Needs testing`; full appliance/Pi trials remain required. Temporary test containers were removed without touching existing apps. Local raw evidence is under `/tmp/autark-catalog-smoke.g1iGhk/runtime/apps/` and is not a release dependency.

The maintained regression contract checks the 35-app roster, three starters, single-service/unprivileged rendering, managed folders, backup declarations and private dashboard choices. Catalog packaging now uses `manifest.yaml` plus declared provisioned files; unused source `compose.yaml` stubs were removed because the runtime renderer owns the executable Compose file.

Local regression evidence for this pass:

- `cd backend && ./gradlew clean test bootJar --console=plain` (executed by the local release builder): 688 passed, 3 existing opt-in skips; production JAR built with all 35 eligible manifests and icons.
- `cd frontend && yarn typecheck && yarn lint && yarn test && yarn check:ui-tokens`: passed, including 273 tests across 86 files.
- `cd frontend && yarn test:e2e --config /tmp/autark-readiness-playwright.config.mjs e2e/discover-action-contract.spec.ts e2e/discover-dense-rail.spec.ts`: 20 passed against the existing development frontend on port 5173 with mocked API fixtures. The temporary config only overrides the base URL and disables test-owned server startup.

These automated checks cover catalog eligibility, rendering/storage contracts, setup validation, starter filtering, install-preview confirmation and existing Discover interactions. They do not substitute for installing each app through the Pi UI and using real application data.

The intended backup promise is narrow: stop the supported app as required, copy only the supported persistent paths, restore their contents and required metadata, and prove the app can use its restored data. This is not whole-host recovery, replication, a database-dump platform or protection for arbitrary external folders. A local restore point is not protection against losing the host disk. Do not claim protection without a successful restore point or publish restore guarantees before qualification.

## What remains in Core

- Local administrator authentication, Home, My Apps, a small Discover catalog, install/open/start/stop/restart and data-preserving uninstall.
- Managed/found/linked ownership distinctions and existing reviewed recovery workflows.
- Existing backup/restore capability checks, basic monitoring, action history and support diagnostics; their safety fixes remain release gates.
- Optional Tailscale private access using Tailscale itself. Local operation does not require Tailscale, Pro, a hosted control plane or a native mobile client.
- Advanced storage, diagnostics and activity remain behind the existing Advanced navigation. No new navigation system is introduced.

## Deferred work and compatibility

| Boundary | Behavior |
| --- | --- |
| Apps outside the roster | Omitted from Discover. Direct setup, preview and install requests return an actionable 409. Existing manifests and management/recovery APIs are retained. |
| Separate-copy installs for excluded apps | Canonical ownership and observed-service actions are explicitly unavailable, including failed-install retry actions. Review of existing resources remains separate from a new install. |
| Pro activation and private-extension installation/update | Removed from primary navigation and activation controls; direct activation/check/install requests return 409. Existing `/pro` status, license checks, module rendering, confirmed removal and deactivation remain available for compatibility/support. |
| Native mobile | No Core release dependency or beta distribution requirement. Mobile-browser core flows remain in scope. |
| Managed-app updates | Capability and plan endpoints explain deferral; apply returns 409 without creating a job. Existing jobs and recovery records are not deleted. Reviewed rollback of an existing installation is deliberately retained as recovery, not advertised as a new beta update workflow. |
| Automatic repair | Off for new settings defaults. Existing owner settings are not overwritten. Docker restart policies remain unchanged; Guardian correctness is a separate story. |
| Public exposure, Docker-admin apps, host DNS takeover | Not added to the roster or required for Core. Existing owner networking is not reconfigured. |
| Arbitrary storage and foreign resources | No automatic adoption, migration or deletion is introduced. Existing advanced review/confirmation paths remain; they are not a promise to support every layout. |

Do not remove excluded manifests, databases, data folders, volumes, ownership metadata, jobs or recovery records to enforce scope. Exclusion concerns new installation, not erasing or silently adopting what users already have.

## Qualification and maintenance

Keep the existing Java/Spring, SQLite, Docker Compose, Tailscale, systemd, TanStack Query and Radix/shadcn stack. This scope uses one static record and checks at existing API/action boundaries; it adds no background worker, migration, cloud call or new package.

Core CI retains local Pro contract/CE-isolation tests; those are not a requirement to deploy Pro services. Do not remove isolation tests merely because new activation is deferred.

Before release:

- Rehearse fresh install, interrupted install, reboot and Core update/recovery on the recorded primary host.
- Qualify each roster app through install, open, lifecycle, uninstall/reinstall and backup/restore with realistic data and permissions.
- Prove excluded direct API requests cannot create jobs or resources, and excluded existing apps remain represented and manageable.
- Prove Core works with Pro absent/unavailable and Tailscale signed out; verify desktop and narrow-screen navigation.
- Resolve remaining P0 findings. Record evidence before changing `qualificationStatus` or describing the release as ready.

Historical document removal belongs to the documentation-cleanup story. Delete obsolete `docs/development` material after consolidating still-needed information; do not create another archive of duplicated plans. This scope change itself removes no historical documents or user data.
