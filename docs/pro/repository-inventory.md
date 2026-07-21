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
- opaque per-extension continuation state; and
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
host filesystem access. It can only receive the public, bounded snapshot
contract and return an opaque surface payload through CE.

## Private control plane

The control plane owns account and device authorization, signed lifecycle
documents, release assignments, and short-lived registry credentials. It does
not receive raw appliance snapshots or local administrator credentials.
