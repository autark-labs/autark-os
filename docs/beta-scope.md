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

The record selects FreshRSS, Homepage and Syncthing as the new-install candidates. They declare cold-file backup contracts; none is certified by this scope change. Syncthing additionally needs UDP, sync-folder permissions and external-data boundary testing.

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
