# Autark Pro Prototype Guide

Autark Pro `0.2.0-staging.1` is a private, non-production prototype layered on
top of Autark OS Community Edition (CE). It adds local read-only Guardian
analysis. It does not replace CE, remove CE features, or authorize automatic
repairs.

## Before activation

You need:

- a running, claimed Autark OS prototype appliance;
- an administrator session;
- a one-time staging activation code;
- outbound HTTPS access to the staging control plane and private registry;
- a supported `linux/amd64` or `linux/arm64` host.

Do not enter a staging code on a production or untrusted appliance. The code is
single-use and should not be pasted into chat, tickets, URLs, or logs.

## Activate Pro

1. Open **Pro** in the existing Autark OS navigation.
2. Choose **Activate Pro**.
3. Enter the one-time activation code and submit it.
4. Wait for device registration and entitlement verification.
5. Choose **Check for update**, then review and install the offered staging
   agent.

The browser never receives the control-plane activation ticket, signed grant,
signed lease, registry credential, or device private key. If the appliance
restarts after code exchange but before activation completes, request a new
one-time code.

Activation does not reinstall Autark OS. The appliance keeps the same CE
backend, frontend, settings, apps, backups, and administrator account.

## Use Guardian

Open **Pro** to see the Guardian workspace. Guardian analyzes a bounded,
normalized snapshot locally. The installed private module chooses the visible
sections, labels, groupings, and findings and carries the browser module that
renders them. Community Edition verifies and loads that browser module only
from the active signed image. The browser receives neither the agent credential
nor operation authority.

Each finding explains its evidence and links to an existing CE page. Guardian
does not start, stop, repair, update, back up, verify, restore, or delete
anything. A recommendation is not proof that a proposed action is safe.

`Unknown` means a required observation or private result was unavailable. It
is not evidence of corruption, safety, or successful recovery.

You can refresh analysis and follow findings to the relevant CE page. Private
history stays in extension-owned encrypted continuation state rather than the
CE database.

## Updates and retained use

The prototype grant carries an `updatesThrough` date three years after
activation. Before that date, an active hosted-service lease permits eligible
staging update checks and downloads.

After the update term:

- the last eligible installed local Pro agent and local Guardian analysis keep
  working;
- releases published after `updatesThrough` are refused;
- loss of the renewable online lease may end update checks and other hosted
  services, but it does not uninstall local Pro;
- CE keeps working regardless of Pro entitlement or connectivity.

“Perpetual local use” applies to the eligible local Pro version already
installed. It does not promise perpetual hosted registry, relay, push,
download, support, or future protocol compatibility. The prototype currently
implements activation, entitlement renewal, and release delivery; companion
relay and push are later work.

## Data handling

Guardian analysis happens inside the network-isolated local agent. The
normalized snapshot can contain categorical state, bounded counters, aggregate
current storage facts, sanitized catalog labels, pseudonymous resource
references, current allowlisted configuration values, and recent write-method
API envelopes without bodies.

The snapshot excludes app configuration, credentials, environment values,
private URLs, domains, IP addresses, hostnames, paths, filenames, logs, backup
contents, encryption keys, destination credentials, and checksums. It is not
uploaded to the control plane.

The staging control plane receives the minimum data needed for activation,
device public-key binding, entitlement, release assignment, and scoped
registry authorization. It must not receive the appliance device private key,
local API token, raw Guardian snapshot, app names, backup contents, or
user-authored Guardian notes.

This prototype does not yet provide the production privacy export, deletion,
retention controls, or independent privacy review planned for Phase 5.

## Remove or deactivate Pro

These are different actions:

- **Remove Pro module** removes only Autark-owned Pro runtime resources and its
  local runtime credential. CE and user-managed app data remain intact.
- **Deactivate locally** clears the appliance's cached entitlement authority
  and stops silent renewal. It keeps local module data and does not claim to
  unlink or delete the remote device record.

The deactivation screen requires the exact confirmation phrase
`DEACTIVATE-AUTARK-PRO` and an acknowledgement of what is retained.

After either action, confirm Home, My Apps, Backups, Access, Storage, Settings,
Diagnostics, Activity Log, and ordinary CE jobs still work. Pro removal is not
an app uninstall and must not be used to remove user containers or volumes.

## Troubleshooting

| Message or state | Meaning | What to do |
| --- | --- | --- |
| Activation code invalid or unavailable | The code is mistyped, expired, already consumed, or was never issued | Request a new staging code; do not reuse or share the old one |
| Activation must restart | The in-memory activation ticket was lost during a core restart | Request a new one-time code |
| Online grace | The renewable service lease could not refresh, but bounded grace and local rights remain | Check outbound HTTPS and staging status; do not reinstall CE |
| Retained use | The update term ended; the eligible local agent remains authorized | Continue local Guardian use or renew when offered |
| No release available | No exact staging release is assigned, it is incompatible, or it is newer than the term permits | Ask the prototype operator to inspect assignment and compatibility |
| Registry unavailable | DNS, TLS, token policy, or the exact repository is unavailable | Keep the current agent; do not disable signature verification |
| Signature rejected | The release document or image identity did not match pinned trust | Stop and report the release version and safe Activity Log reason; never force-install |
| Candidate unhealthy / rolled back | The new agent failed bounded health checks and the previous generation was preserved | Continue using the known-good version and report the safe lifecycle event |
| Guardian unavailable | Pro is absent, unhealthy, incompatible, or returned invalid data | CE remains available; inspect **Activity Log → Pro lifecycle** |
| A section reports unknown | The private module lacked enough current or retained private context | Review the linked CE page; do not infer safety or corruption |

When reporting a problem, share only version, architecture, time, stable reason
code, and the redacted Pro lifecycle event. Never share codes, tokens, signed
documents, authorization headers, private keys, raw logs, hostnames, IP
addresses, app configuration, or backup data.

## Prototype limitations

This build is for controlled demonstration. It has not completed key rotation,
release cohorts and emergency withdrawal, production privacy lifecycle,
native ARM64 performance testing, broad chaos testing, or an independent
security review. See `docs/pro/known-limitations.md` for the release-blocking
list.
