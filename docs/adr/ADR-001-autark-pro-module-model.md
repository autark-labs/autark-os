# ADR-001: Autark Pro Is a Downloaded Extension in One Installed Product

- Status: Accepted (amended by ADR-003)
- Date: 2026-07-21
- Prototype gate: PRO-208

## Decision

Autark-OS Community Edition remains the installed appliance, application shell,
and sole owner of privileged host integrations. Autark Pro is an optional,
separately downloaded signed extension:

1. CE owns device identity, entitlement and release verification, artifact
   integrity, container isolation, lifecycle, rollback, and a bounded host-data
   broker.
2. The private image owns all Pro-specific backend behavior, state, policy, and
   presentation composition.
3. The private image also carries the Pro browser module. CE proxies and loads
   it only after the image is installed, healthy, version-bound, and hash
   verified.
4. Browser-delivered code is inspectable and is not treated as confidential.
   The private backend source, methods, and operational state remain outside CE.
5. The browser never receives agent or registry credentials and never contacts
   the private service directly.
6. Absence, failure, removal, or invalid entitlement cannot prevent CE startup,
   login, navigation, or ordinary CE actions.

There is one application shell and one appliance. The extension contributes to
generic slots across CE pages instead of installing a second frontend or
replacing the public backend.

## Consequences

- CE builds contain a small lifecycle page and extension loader, but no Pro
  feature UI bundle.
- Public contracts describe generic lifecycle, host snapshot, UI manifest, and
  opaque surface envelopes only.
- All future privileged mutations remain CE-owned and require a separately
  reviewed, narrow, administrator-authorized broker.
- Local retained-use rights and hosted-service eligibility remain separate.
