# Autark Pro — Current Known Limitations

**Scope reviewed: September 7, 2026.** These are current source and customer
availability limits. Historical staging results apply only to their recorded
artifacts and do not qualify the current release.

## Release availability and platforms

- Pro remains a development prototype. New activation, private-extension
  installation/update, and managed-app updates are deferred during the Core
  beta. Existing `/pro` status, license checks, compatible module rendering,
  removal, and deactivation remain available for existing installations.
- [Beta qualification](../beta-scope.md) remains pending. Debian 12 AMD64 with
  systemd, Docker/Compose v2, and local Linux filesystem storage is the initial
  target; FreshRSS, Homepage, and Syncthing are app candidates, not certified
  recovery claims. ARM64/Pi and other hosts require separate qualification.
- Existing signed release, health-check, and rollback mechanisms are not a
  substitute for testing the current customer flow on supported hardware.
- Operator release controls exist in source. Current deployment and release
  acceptance must be verified separately; no customer fleet dashboard or
  percentage rollout is provided.

## Local guidance and history

- Compatible newer agents provide scheduled analysis and encrypted durable
  private history. Older installed prototype versions may still use earlier
  history behavior. Losing or resetting private state must be visible.
- The current private UI principally exposes summaries and links. Complete
  evidence/history review, snooze, acknowledgement, dismissal, and note controls
  are unfinished even though private lifecycle storage exists.
- Guidance needs field calibration. Change correlation is not proof of cause;
  capacity estimates depend on sufficient, stable observations.
- Backup guidance evaluates available evidence. It does not perform isolated
  restore tests, certify an unqualified app, or protect against same-disk loss.
- Guardian cannot independently execute app, backup, restore, cleanup, or host
  operations. Broader ChangeSafe, Move, Rebuild, and Blueprint workflows remain
  outside the beta deliverable.
- Private export/deletion primitives and bounded retention do not yet provide
  complete owner-facing export, deletion, and configurable retention controls.
  Ordinary module removal preserves recoverable private state.

## Connected services, licensing, and support

- Local and hosted phone pairing, remote health monitoring, push, and relay
  are unavailable. Retired prototype endpoints are not a fallback. An active
  license does not imply those services exist.
- Signed advisory delivery, remote approvals, recovery escrow, and coordinated
  support sessions are not complete customer features.
- The proposed $149 early-access/$199 full-release offer and $49/year Online
  renewal are not a currently available purchase flow. Checkout, term renewals,
  device transfer, self-service recovery, and remote unlink are unfinished.
- Current prototype update eligibility starts at activation. The proposed
  full-release restart and separate purchased Online term need implementation.
  A short access-verification expiry is not a purchased service end date.
- Eligible installed local use survives ordinary term/online expiry. This does
  not guarantee perpetual downloads, hosted services, or compatibility with
  future clients. Existing signed rights and any purchase terms are unchanged.
- Contact [licensing@autarklabs.com](mailto:licensing@autarklabs.com) about
  availability or an existing license. Managed support is a separate proposal,
  not a delivered beta service. See the [current guide](user-guide.md).

## Security and acceptance boundaries

- There is no independent security-assessment or production privacy-lifecycle
  acceptance claim. Customer export, hosted deletion, and complete retention
  procedures still need qualification.
- Trust-key rotation and recovery, production signing-key custody, broad
  resource-exhaustion testing, and long-duration platform behavior remain work.
- The private runtime relies on host Docker/kernel isolation and has no broad
  backward-compatibility commitment. Host-root compromise is outside that
  container boundary.
- Component tests, generated contract parity, synthetic demonstrations, and
  local ephemeral signing tests establish only their tested boundaries.
  Hosted acceptance requires current signed artifacts and a customer-realistic
  browser/mobile staging flow without manual payload construction.
