# Project OS Documentation

This folder contains user guides, beta installation notes, runtime architecture, manifest guidance, and development planning records.

Use this page as the map. The README at the repository root is the public landing page.

## Start Here

- [Install Project OS](./non-technical-install-guide.md): plain-language install guide for first-time users and support-assisted installs.
- [Beta testing repository](https://github.com/autark-labs/project-os/): source install, release-bundle install, update, uninstall, and support commands.
- [Local development](./local-development.md): run the backend and frontend separately during development.

## Runtime And Operations

- [Marketplace runtime architecture](./marketplace-runtime.md): how catalog manifests become managed local apps.
- [Manifest authoring checklist](./manifest-authoring-checklist.md): required fields and review checks before adding or updating a catalog app.
- [Service user installation](./service-user-installation.md): `projectos` service user, durable host paths, systemd, Docker, and Tailscale operator setup.
- [Application state prune list](./application-state-prune-list.md): active cleanup list for legacy app-state surfaces.

## Current UI Reference Screenshots

Screenshots in [current-app-state](./current-app-state/) capture the present UI during active development. They are useful for visual QA, but they are not product documentation.

## Development Notes

The `docs/development/` folder contains working implementation plans, refactor notes, and stabilization stories. These files are useful for ongoing engineering work, but they may describe temporary states or completed slices.

Start with the [development notes index](./development/README.md), then use these active references:

- [MVP stabilization and maintainability plan](./development/mvp-stabilization-plan.md)
- [Apps behavior overhaul](./development/appsBehaviorOverhaul.md)
- [Application page rebuild final stories](./development/appPageRebuildFinalized.md)
- [Database migration discipline](./development/database-migrations.md)
- [Stability overhaul](./development/stabilityOverhaul.md)

Historical planning records live under:

- [Superpowers specs](./superpowers/specs/)
- [Superpowers plans](./superpowers/plans/)
- [Refactor snapshot](./development/refactor-snapshot-2026-06-20/)

## Documentation Rules

- Keep user guides task-oriented and written in plain language.
- Keep architecture docs focused on stable boundaries and tradeoffs.
- Keep implementation sequencing in development notes.
- Do not link to planned docs until the file exists.
- Prefer one clear entry point per audience: user, beta tester, developer, or maintainer.
