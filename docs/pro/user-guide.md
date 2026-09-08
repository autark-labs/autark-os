# Autark Pro — Current Availability and Existing Installations

**Scope reviewed: September 7, 2026.** Pro is a development prototype layered
on Community Edition (CE). New Pro activation, private-extension installation,
and private-extension updates are deferred during the current Core beta.
Existing license checks, compatible installed-module rendering, confirmed
removal, and deactivation remain available at `/pro` for existing owners.
The Pro navigation item and new-activation controls are hidden in this beta.

The [current beta scope](../beta-scope.md) is the release authority. Its initial
qualification target is Debian 12 AMD64, systemd, Docker Engine with Compose v2,
and local Linux filesystem storage. FreshRSS, Homepage, and Syncthing are the
new-install candidates; qualification remains pending. Existing apps remain
manageable. Raspberry Pi/ARM64 and other hosts require separate qualification.

## What is available and what is planned

| Capability | Current owner experience |
| --- | --- |
| CE app management, local backup/restore, access, and diagnostics | Independent of Pro, within the current release scope; backup/restore qualification remains pending |
| Existing Pro license and module management | Review local status, check the license, remove the installed extension, or deactivate locally |
| Local Guardian, change context, capacity, and backup guidance | Available from a compatible, healthy, already installed private prototype; capability depends on its version |
| Scheduled analysis and durable private history | Implemented in newer private builds; older installed prototypes may lack them |
| Complete finding review, notes, snooze, and history controls | Planned; the current browser module principally shows summaries and navigation |
| Phone pairing, hosted monitoring, push, and relay | Unavailable; earlier prototype pairing does not enable the replacement services |
| Automated recovery tests, ChangeSafe, Move, Rebuild, and Blueprints | Outside the current beta deliverable; ordinary CE backup and recovery remain separate |
| New purchase, activation, customer renewal, and device transfer | Unavailable through the current customer flow |

July staging demonstrations apply to their recorded releases. They do not
qualify a different build or make a deferred capability available today.

## Existing local Pro use

Open `/pro` on your appliance using its administrator session. A compatible,
healthy private extension can display local findings and links to the relevant
CE pages. Its available sections depend on the installed version.

When the appliance recommends reviewing findings, **Review guidance** moves
directly to the installed extension's guidance on this page. License checks,
removal and deactivation remain available separately. If expected guidance is
unavailable, the page offers **Try again** while the CE shell stays available.

Current private builds analyze a bounded local snapshot on a schedule, after
meaningful changes, and on explicit refresh. Their encrypted private history
survives ordinary restarts and compatible agent changes. CE does not interpret
that history. Earlier encrypted continuation state is migration input, not the
current history store. A reset or incompatible history must be reported rather
than presented as an uninterrupted record.

Guardian guidance does not itself repair, restart, update, back up, verify,
restore, or delete anything. Use the existing CE page to review an action.
Current managed-app updates are also deferred by beta scope. A finding is
advisory evidence, not a guarantee or proof that a change caused a problem.

`Unknown` means evidence is missing or insufficient. A backup's integrity
verification differs from observing a successful restore, and neither implies
an automatic isolated restore test. A local restore point does not protect
against losing the disk that holds it. Check supported-data exclusions before
depending on recovery.

## Prices, terms, and support

The proposed commercial offer is $149 early access and $199 at full release
for one appliance, with retained eligible local use, three years of Pro updates,
and one year of Autark Online. Proposed Online renewal is $49/year or
$5.99/month. These are proposed prices and benefits, not a currently available
purchase or connected-service flow.

The proposal restarts early-access update and Online terms at full release.
Current prototype grants instead record update eligibility three years from
activation. The full-release restart, separate commercial service term, and
customer renewals still need implementation. Existing signed entitlements and
any purchase terms remain unchanged by this documentation.

For an existing installation:

- **Software updates** shows the update-eligibility date recorded locally.
  Current beta policy still defers new extension installation and updates.
- **Online access check** reflects a short-lived verification of hosted access.
  It is not the end date of a purchased Online term and does not mean phone
  pairing, monitoring, relay, or push is implemented.
- Ordinary online expiry or the end of the update term does not uninstall an
  eligible local Pro version. Retained use applies to the installed eligible
  version; it is not a promise of indefinite downloads or future compatibility.
- CE continues to work independently of Pro entitlement and connectivity.

Contact [licensing@autarklabs.com](mailto:licensing@autarklabs.com) about Pro
availability, existing purchase terms, or a lost code or replacement appliance.
Self-service transfer and recovery are not available yet. The proposed separate
managed-support service is not included as a delivered beta capability.
Use the public project's issue channel for redacted CE bug reports.

## Removal, deactivation, and data

- **Remove private extension** stops and removes the owned Pro runtime. Current
  durable private state and its installation-local credential are retained for
  recovery. This is not private-data deletion or a remote account unlink.
- **Deactivate Pro** clears local entitlement authority and stops silent
  renewal. The confirmation explains that local module data, device identity,
  and the remote association are retained.
- Neither action uninstalls managed apps or deletes CE data. Private-history
  export/deletion primitives do not yet constitute a customer privacy workflow.

The normalized snapshot is processed locally and is not uploaded to the control
plane. It excludes app configuration, credentials, addresses, private URLs,
paths, filenames, logs, and backup contents. The control plane receives bounded
device identity and entitlement/release requests. Hosted monitoring needs a
separate, explicit customer flow before any new reporting is enabled.

## Troubleshooting

| Message or state | Next step |
| --- | --- |
| Pro activation or installation deferred | Continue using CE; contact licensing about availability. An old activation code cannot bypass beta scope. |
| Online grace or access check unavailable | Keep the eligible local version and check connectivity. This does not require reinstalling CE. |
| Retained use | Continue eligible local guidance; customer renewal is not available yet. |
| Guardian unavailable | Review the installed version and **Activity Log → Pro lifecycle**. CE remains available. |
| Private history reset or incompatible | Review the notice; do not assume previous findings or evidence were retained. |
| Candidate unhealthy or rolled back | Keep the known-good version and report the safe lifecycle event. |
| Signature rejected | Report the version and safe reason. Never force installation or disable verification. |
| Phone pairing or mobile status unavailable | Use the appliance's browser interface; earlier prototype codes and registrations cannot enable the replacement service. |
| Backup or capacity evidence unknown | Review the linked CE page and evidence dates; do not infer safety, corruption, or a precise exhaustion date. |

Share only the version, architecture, time, stable reason, and redacted lifecycle
event with support. Do not send activation codes, tokens, signed documents,
private keys, authorization headers, raw logs, configuration, or backup data.

See [known limitations](known-limitations.md) for qualification and delivery
boundaries. This guide does not authorize enabling deferred features.
