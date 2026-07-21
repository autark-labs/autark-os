# Public Extension Contracts

These schemas are the narrow compatibility and security boundary used by
Community Edition. They describe lifecycle documents, the bounded host-data
broker, and generic extension loading. They do not describe Pro features or
private surface payloads.

## Signed lifecycle documents

Durable grants, service leases, release manifests, and device proofs use RFC
7515 flattened JWS with Ed25519. Entitlement and release keys are separate.
CE verifies signatures, device binding, trusted time, release eligibility,
repository scope, digest, architecture, and image signature independently.

Capability identifiers in signed documents are opaque strings. CE checks
membership and equality but has no compiled product catalog.

## Local extension boundary

`normalized-host-snapshot-v1` is the versioned, bounded and redacted input that
CE may send to an installed extension. It contains current CE observations and
no private feature history, predictions, rules, credentials, log contents, or
backup contents.

`extension-ui-manifest-v1` binds a private browser entrypoint and its SHA-256
hash to a component version and a bounded set of host surfaces.

`extension-surface-request-v1` carries a host snapshot, surface identifier, and
optional opaque continuation state. `extension-surface-response-v1` returns a
replacement opaque state and a JSON payload whose schema and interpretation
belong exclusively to the private browser module.

CE authenticates all agent requests, bounds request and response sizes, binds
opaque state to the active image digest, and verifies the browser entrypoint
hash. The browser never receives the agent credential.
