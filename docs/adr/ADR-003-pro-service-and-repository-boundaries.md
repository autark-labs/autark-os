# ADR-003: Downloaded Private Extension Boundary

- Status: Accepted
- Date: 2026-07-21

## Context

Autark-OS Community Edition is public and inspectable. Autark Pro is a
separately licensed product whose local backend implementation must remain
proprietary. Pro user-interface behavior may be inspected in a customer's
browser, but it should not increase the CE download or initial JavaScript
payload when Pro is absent.

## Decision

Community Edition is a generic signed-extension host. It owns device identity,
entitlement and release verification, scoped artifact download, image-signature
verification, unprivileged container lifecycle, health-checked cutover,
rollback, removal, a bounded host-data broker, opaque extension state, and
generic browser slots.

The separately downloaded signed image owns all Pro-specific analysis,
history, policy, labels, presentation composition, and the browser module. CE
loads that module from a same-origin authenticated proxy only after the image
is installed and healthy. CE checks the entrypoint hash against the manifest
served by the active signed image.

The browser never receives the private agent credential and never contacts the
agent directly. The CE backend sends the agent a bounded current-state snapshot
and stores replacement continuation tokens without interpreting them. Surface
payloads are opaque to CE.

The loader is restricted to the official `autark-pro` extension. Its same-origin
browser code joins the CE administrator-origin trusted computing base; Shadow
DOM is not a sandbox. Third-party extensions require a future opaque-origin
iframe/message protocol and cannot use this loader.

The initial generic surface identifiers are `pro.dashboard`,
`storage.insights`, and `discover.insights`. An unavailable extension leaves no
placeholder on cross-page CE surfaces.

## Trust boundaries

| Boundary | Enforcement |
| --- | --- |
| Browser to CE | Existing local administrator session and same-origin policy |
| CE to private extension | Per-install bearer credential on an internal-only container network |
| Extension artifact | Signed assignment, digest pin, image signature, health-checked cutover |
| Browser entrypoint | Active-image manifest, strict filename, SHA-256 verification, same-origin proxy |
| Extension to host data | Versioned, bounded, redacted snapshot only |
| Extension state | Opaque token bound to extension ID, active image digest, and surface |

## Consequences

- CE ships only a small lifecycle page and generic extension loader; the Pro
  browser module is absent from CE builds.
- Product-specific backend code and persistence stay in private repositories.
- Browser-delivered Pro code is inspectable after installation and is not a
  secrecy boundary.
- The private service remains unprivileged. Any future host mutation must use a
  separately reviewed CE broker with explicit administrator approval.
- During the pre-public prototype, contracts may be replaced outright. Stable
  API versioning begins only after the initial Pro client is accepted.
