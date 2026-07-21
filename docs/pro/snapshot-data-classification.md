# Normalized Host Snapshot Data Classification

The public core assembles a read-only, redacted snapshot for the authenticated
host-local Pro agent. It is never sent to the Pro control plane.

## Public boundary

- Assembly reads typed Community Edition service models.
- The agent endpoint is reachable only on the private container network and
  requires a per-install bearer credential.
- The agent receives no Docker socket, host filesystem, backup archive,
  configuration directory, secret store, or command capability.
- Assembly does not mutate CE state or create feature history.

## Data sent

| Field group | Data class | Projection |
| --- | --- | --- |
| Protocol | Version, deterministic snapshot ID, generated time | Fixed and bounded |
| System | Core version, architecture, readiness categories | Allowlisted values |
| Apps | Pseudonymous resource references, safe catalog labels, lifecycle/readiness, bounded counts | No raw installation IDs or user-selected names |
| Found services | Aggregate state counts and conflict categories | No service or network identity |
| Access | Intent, reachability, mapping category | No URL, IP, hostname, domain, or identity |
| Backups | Destination availability and per-app current categorical facts/timestamps/counts | No path, archive name, contents, checksum, key, or credential |
| Storage | Current byte aggregates and pseudonymous app references | No path, filename, historical series, delta, or prediction |
| Metrics | Rounded CPU, memory, and disk percentages | Current aggregate only |
| Configuration | Closed allowlist of current semantic settings | No raw documents, secrets, environment, or arbitrary values |
| Recent mutations | Method, API path, time, optional correlation ID | At most 32 write envelopes; no request or response body |
| Recent events | Category, outcome, time, optional pseudonymous reference | No message, detail, log line, or exception |
| Completeness | `partial` | True for missing, failed, stale, or truncated input |

Approved image and destination identities are one-way normalized. Prohibited
values are not hashed because even a hash could leak equality.

## Bounds and missing data

- Serialized snapshots are limited to 512 KiB.
- Per-app projections are limited to 128 items.
- Recent events are limited to 100 items and a 30-day window.
- Recent mutations are limited to 32 items and a 30-day window.
- Source jobs and activity rows are limited to 200 each.
- Lists use canonical ordering and the snapshot UUID derives from canonical
  serialized content.
- Missing sources produce `unknown`, `unavailable`, or `null` and set
  `partial=true`; they do not abort assembly.

Historical samples, baselines, feature state, and derived analysis belong to
the private agent. They may be carried only inside its encrypted opaque
continuation token.
