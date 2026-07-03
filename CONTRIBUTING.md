# Contributing to Project OS

Thanks for taking the time to contribute. Project OS is still early, and community help is welcome. The main way to propose changes right now is through GitHub pull requests.

Project OS is tied closely to the Autark Labs brand and product direction, so maintainers keep final say over what ships. That does not mean contributions need to be perfect before you open them. It means changes should be easy to review, easy to test, and aligned with the product promise: a calm, guided runtime for self-hosted apps.

## How To Contribute

### 1. Start With The Right Path

Use an issue or discussion first for:

- new product features
- user-facing workflow changes
- install, backup, restore, networking, or security changes
- large refactors
- changes to app ownership, app state, jobs, or canonical backend models
- new catalog apps or manifest changes with non-trivial runtime behavior

Opening a pull request directly is fine for:

- bug fixes with a clear reproduction
- documentation improvements
- small UI polish
- test coverage
- manifest metadata fixes
- obvious cleanup that does not change behavior

If you are unsure, open a short issue describing the problem and the change you want to make.

### 2. Fork, Branch, And Open A Pull Request

1. Fork the repository.
2. Create a focused branch.
3. Make the smallest useful change.
4. Validate it locally.
5. Open a pull request against `main`.

Keep pull requests focused. A good PR usually does one thing: fixes one bug, adds one catalog app, improves one flow, or refactors one bounded area.

## Maintainer Review And Final Control

All changes require maintainer review before merge.

Maintainers may ask for changes, split a PR, delay a change, or decline a contribution if it does not fit the current product direction, safety posture, support burden, or brand. This is especially true for install flows, destructive actions, public exposure, backups, restore, app ownership, and privileged host operations.

Helpful PRs make maintainer review easier by clearly answering:

- What user problem does this solve?
- What changed?
- How was it tested?
- What risks or follow-up work remain?

## Product Principles

Project OS should feel like a calm appliance, not a generic infrastructure dashboard.

Please keep these principles in mind:

- Show users what is installed, what is ready, what needs attention, and what to do next.
- Keep one clear next action on primary surfaces.
- Do not expose raw Docker, Tailscale, filesystem, or network detail unless the user is in an advanced or diagnostics flow.
- Preserve data by default.
- Use plan-then-apply for destructive or complex actions.
- Never show found, foreign, or legacy resources as simply installed by the current Project OS instance.
- Avoid no-op buttons, placeholder controls, or UI that implies functionality that is not implemented.

## Development Setup

Use the local development guide for the full setup:

- [Local development](docs/local-development.md)
- [Beta installation](docs/beta-installation.md)
- [Manifest authoring checklist](docs/manifest-authoring-checklist.md)

Common development loop:

```bash
./scripts/dev-backend.sh --auto-port
cd frontend
yarn dev
```

If the backend is not running on `8082`:

```bash
PROJECT_OS_BACKEND_URL=http://localhost:8092 yarn dev
```

## Validation Before Opening A PR

Run the smallest relevant checks for your change.

Frontend changes:

```bash
cd frontend
yarn typecheck
yarn build
```

Backend changes:

```bash
cd backend
./gradlew test
./gradlew bootJar
```

Release or installer changes:

```bash
scripts/tests/release-artifacts-contract-test.sh
scripts/tests/release-artifacts-dry-run-test.sh
scripts/smoke-install-cycle.sh
```

Before pushing any PR, also run:

```bash
git diff --check
```

If a validation command fails, mention it in the PR and explain whether it is related to your change.

## Pull Request Checklist

Before requesting review, check that your PR:

- has a clear title and summary
- explains user-facing impact
- includes screenshots for visible UI changes
- includes validation commands and results
- avoids unrelated formatting churn
- avoids broad rewrites unless discussed first
- keeps buttons, links, and menu actions functional or explicitly disabled
- preserves loading, empty, success, and error states where relevant
- does not expose secrets, tokens, hostnames, private URLs, or credentials

## Code Guidelines

### Backend And State

- Prefer backend-owned canonical state over page-specific frontend interpretation.
- Long-running operations should be modeled as jobs.
- Mutations should return useful action results and should not pretend an app is ready before it actually is.
- Keep app ownership, readiness, attention, operation, and available-action state consistent across pages.
- Add regression coverage for state mismatches whenever possible.

### Frontend And UI

- Use shadcn/Radix primitives where practical.
- Reuse Project OS primitives and page components instead of copying card, badge, panel, and empty-state styling.
- Keep pages calm and action-oriented.
- Put technical detail behind advanced sections, diagnostics, disclosures, or tooltips.
- Make disabled actions explain why they are unavailable.
- Keep mobile layouts usable for primary flows.

### Styling

- Prefer semantic shadcn tokens, Project OS primitives, and readable Tailwind classes.
- Avoid arbitrary hex colors and one-off visual systems.
- Do not introduce broad global styling rewrites in feature PRs.
- Keep `className` usage readable and grouped by layout, spacing, typography, color, border, and interaction.

### Catalog Manifests

Catalog apps should be safe, understandable, and maintainable.

Manifest PRs should include:

- stable upstream image/version information
- clear port and volume behavior
- backup expectations
- access expectations
- install-plan behavior
- icon and display metadata
- testing notes for install, open, start, stop, restart, backup, restore, and uninstall where applicable

Use the [manifest authoring checklist](docs/manifest-authoring-checklist.md).

## Security And Safety

Project OS controls containers, app data, backups, private access, and privileged host operations. Treat changes accordingly.

Do not include real secrets, tokens, private hostnames, credentials, support bundles, or user data in issues or PRs.

For security-sensitive reports, avoid public proof-of-concept details until maintainers have had a chance to respond. If a dedicated security contact or policy is added later, use that path.

## Documentation Contributions

Documentation should be plain-language and task-oriented.

Good docs help users answer:

- What is this?
- When should I use it?
- What should I do next?
- What is safe?
- What happens if it fails?

Do not link to planned docs until the file exists.

## Release Expectations

Maintainers publish releases. Contributors should not expect every merged change to be released immediately.

Release packaging currently targets GitHub-hosted Linux artifacts:

- executable `.run` installer
- Debian/Ubuntu `.deb`
- portable `.tar.gz`
- checksums and artifact metadata

Release process changes should be proposed in an issue before implementation.

## Community Expectations

Be direct, respectful, and practical. Technical disagreement is fine. Keep discussion focused on user outcomes, safety, maintainability, and the product direction.

Project OS is trying to make self-hosting less fragile for normal people. Contributions that protect that goal are the ones most likely to land.
