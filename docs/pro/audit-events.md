# Autark Pro lifecycle audit events

Autark Pro security-sensitive lifecycle checkpoints use the existing appliance
Activity Log with category `pro`. They are administrator-visible through the
authenticated Activity Log API and the dedicated **Pro lifecycle** view.

## Persistence and failure policy

`ProAuditService` is the only supported writer for Pro lifecycle audit rows. It
validates a closed context schema, redacts fingerprints and image digests, and
performs an atomic `insert or ignore` against a unique event key. Retrying the
same checkpoint therefore produces one row.

Pro audit rows are append-only in SQLite: database triggers reject update and
delete, and normal operational retention excludes category `pro`. There is no
public mutation endpoint.

A required event is written before a transition can authorize a remote request,
persist new entitlement authority, download or start an image, change routing,
roll back, or remove the module. Persistence failure raises a generic
`ProAuditException`; the sensitive operation does not continue. Recovery
checkpoints are also idempotent, so restart can safely retry after a partially
completed runtime action.

## Event catalog

| Area | Events |
| --- | --- |
| Activation | `activation_started`, `device_registration` |
| Entitlement | `entitlement_refresh`, `entitlement_state_transition`, `retained_use` |
| Release | `signature_verified`, `signature_rejected`, `manifest_accepted`, `manifest_rejected` |
| Registry | `registry_token_requested`, `registry_token_issued`, `registry_token_failed` |
| Agent lifecycle | `pull_started`, `pull_completed`, `pull_failed`, `candidate_start`, `health_result`, `cutover`, `rollback`, `removal`, `module_state_transition` |

An event may record separate started and terminal checkpoints when a runtime
action crosses a crash boundary. Each checkpoint has its own deterministic
idempotency key.

## Safe context schema

Persisted `details` is a flat JSON object containing only validated strings:

- `schemaVersion`
- `eventType`
- `correlationId`
- `component`
- `componentVersion`
- `digestPrefix`
- `fromState` and `toState`
- `outcome`
- `reasonCode`
- `keyId`
- `fingerprintPrefix`

Fields that do not apply are omitted. Digests and fingerprints are accepted
only as canonical SHA-256 values and persisted as `sha256:` plus twelve
hexadecimal characters. Correlation IDs, key IDs, versions, states, outcomes,
and reason codes use bounded allowlists or strict character patterns. A safe
event-derived correlation ID and machine reason are supplied when a caller has
no external correlation.

The schema has no field for private keys, activation codes, tickets, nonces,
authorization headers, registry usernames or passwords, bearer tokens,
signatures, JWS protected headers, payloads, signed envelopes, exception
messages, arbitrary maps, or arbitrary agent output. These values cannot reach
the persistence call through the typed event model.

For a failed signature check, the row contains only the inspected key ID when
safe, a prefix of a SHA-256 fingerprint of the envelope, and a stable reason
such as `invalid_signature`. It never contains the signature or payload.

## Operator view

Open **Activity Log → Pro lifecycle**, or follow a Pro page activity link. The
view requests category `pro`, preserves all ordinary CE Activity Log views, and
shows a fixed plain-language title/message. Safe technical context remains
available for Pro rows even when advanced metrics are hidden.
