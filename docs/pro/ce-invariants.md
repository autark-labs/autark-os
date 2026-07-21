# Community Edition Invariants for Autark Pro

These rules apply to every Pro story and are release blocking.

## Product Invariants

1. CE remains the installed product. Pro activation never replaces the
   appliance, frontend shell, backend service, or operating-system image.
2. Existing CE functionality is never removed, delayed, rate-limited, or newly
   gated by a Pro entitlement.
3. Pro is disabled by default and production code fails closed when entitlement,
   signature, compatibility, or agent health cannot be established.
4. Pro absence, removal, corruption, outage, invalid data, or failed update
   cannot prevent CE process startup, administrator login, navigation, or
   ordinary CE actions.
5. The backend is authoritative for entitlement and feature availability. A
   frontend flag never authorizes an operation.
6. Maintenance expiry means retained local use. It does not mean revocation,
   uninstall, or deletion of local Pro data.
7. The private agent never owns privilege and never becomes a source of truth
   for CE application ownership, readiness, backup, access, or job state.

## CE Regression Checklist

Run with Pro disabled, not installed, control plane offline, agent unavailable,
agent malformed, module degraded, and retained use where applicable.

| Surface | Route or subsystem | Required invariant |
| --- | --- | --- |
| Home | `/home` | Loads canonical summary and one CE recommended action |
| My Apps | `/apps` | Managed/found/recoverable ownership remains accurate; lifecycle actions work |
| App management | `/apps/:id` flows | Start, pause, restart, repair, update, rollback, and uninstall remain CE-authorized |
| Found Apps | ownership resolution flows | Foreign resources are not adopted or labeled installed |
| Discover | `/discover` | Catalog browsing and CE installation remain available |
| Installation | install plan and job | Plan, progress, restart recovery, and errors do not depend on Pro |
| Access | `/access` | LAN/Tailscale status and CE access actions remain available |
| Backups | `/backups` | Backup, integrity, restore, retention, and conflict rules remain authoritative |
| Settings | `/settings` | CE settings save independently from Pro state |
| Storage | `/storage` | Usage, cleanup planning, and safe ownership rules remain available |
| Diagnostics | `/diagnostics` | Health, technical logs, and redacted support reports remain available |
| Activity Log | `/activity` | CE events remain visible and filterable alongside any Pro events |
| Onboarding | setup flow | A new CE appliance can be claimed and configured without Pro |
| Authentication | administrator session | Login, logout, local recovery, and authorization do not call Pro services |
| Global jobs | `/api/jobs` and shared UI | CE jobs keep their existing serialization, progress, cancellation, and history |
| Themes/layout | global shell | Navigation, mobile layout, light/dark behavior, and error boundaries remain usable |

## Review Rule

Each Pro story records the applicable checklist results in the private Pro
development tracker. This public repository records only the integration
boundary. If a story cannot satisfy an invariant, stop the story and change the
design; do not weaken this document or hide the failure.
