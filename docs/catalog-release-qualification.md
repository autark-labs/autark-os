# Catalog Release Qualification

Each directory under `backend/src/main/resources/catalog/apps/` is a shipped catalog app. An app is never hidden by leaving an incomplete directory behind: every entry must include a non-empty `manifest.yaml` and `compose.yaml`, a dedicated icon at `/app-images/<app-id>.svg`, and complete runtime metadata.

## Required catalog contract

Every manifest must state:

- an honest description, support level, support summary, and resource expectations;
- ports, managed storage volumes, a health check, and relative backup paths;
- a user-safe post-install setup guide; and
- the standard lifecycle behavior: Autark-OS creates a safety checkpoint when data exists, removes containers during uninstall, and keeps app data and backup files unless the user later deletes them deliberately.

Catalog copy must describe what the released build does now. Do not describe future wiring, planned automation, or unavailable integrations as though they are available. If a connection must be configured manually, say where the user performs that configuration.

## Support levels

`Advanced` and `Needs testing` apps may be included when their limits are clear. They must not be promoted solely because their manifest parses.

Promote an app to `Ready` only after all of the following are recorded by the FR-026 lifecycle qualification:

1. A supported clean host completes install, first-run setup, and health verification.
2. The app is reachable by its documented local and, when applicable, private-access flow.
3. A real backup captures declared data and a restore verifies user data content.
4. Uninstall creates a safety checkpoint, removes containers, and preserves the declared data paths.
5. The lifecycle passes on every supported architecture, with dates and artifact references stored in the qualification report.
6. The app has a deliberate icon, no fallback presentation, and current user-safe setup guidance.

If a regression occurs, lower the support level immediately and update the support summary and smoke-test status. The catalog validator and catalog-wide tests are release gates; fix the entry rather than deleting its directory to hide an incomplete app.
