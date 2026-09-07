# Autark Pro Repository Boundary

Autark-OS Community Edition contains only the infrastructure needed to
activate, verify, install, isolate, update, roll back, and host a signed private
extension.

## Public Community Edition

- device-bound entitlement and release verification;
- scoped control-plane and registry clients;
- an unprivileged, network-isolated container lifecycle;
- a bounded and redacted host snapshot broker;
- an authenticated extension transport;
- generic browser slots and a same-origin asset proxy;
- a generic refresh scheduler and isolated private-state volume lifecycle;
- opaque continuation input retained only for migration; and
- lifecycle jobs and redacted audit events.

Community Edition does not contain a Pro feature catalog, analysis rules,
thresholds, derived feature models, finding persistence, presentation schemas,
or the private browser module.

## Private extension bundle

The separately distributed signed image owns all product-specific backend
behavior, private state, feature presentation, and its browser entrypoint. The
browser entrypoint is downloaded only after the extension is installed. It is
inspectable in a customer browser, but its backend implementation and source
remain in private repositories.

The private service has no Docker socket, host network, CE database, or direct
host filesystem access. Active instances have a dedicated private state volume
for encrypted history; candidates do not mount it. CE owns the volume lifecycle
without reading the private records. The service receives public bounded
snapshots and returns opaque presentation and bounded integration responses.

## Private control plane

The control plane owns device authorization and the tenant boundary, signed lifecycle
documents, release assignments, and short-lived registry credentials. It does
not receive raw appliance snapshots or local administrator credentials.
Customer account, purchase, pairing, and monitoring workflows remain unfinished.

## Current availability

The [Core beta scope](../beta-scope.md) defers new activation and extension
installation/update. Implemented infrastructure and historical staging evidence
do not imply customer availability. See the [Pro guide](user-guide.md) for
existing-installation behavior and proposed commercial terms.
