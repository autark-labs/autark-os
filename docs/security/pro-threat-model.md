# Autark Pro Extension Threat Model

This review covers the PRO-208 prototype boundary.

## Security objectives

1. Extension failure, absence, removal, or compromise must not disable CE or
   delete user-managed data.
2. A private extension must not receive Docker, host, database, or generic
   command authority.
3. Only a device-bound entitlement and assigned signed image may run.
4. Host data sent to the extension must be bounded, typed, and minimized.
5. Credentials must not enter browser state, URLs, logs, support data, or
   distributable fixtures.
6. The private browser entrypoint must come from the active signed image and
   match its declared digest.

## Boundaries

| Boundary | Data | Enforcement |
| --- | --- | --- |
| Browser → CE | Activation and lifecycle actions; extension surface reads | Administrator session, same origin, CE authorization |
| CE → control plane | Device proofs and lifecycle requests | TLS, one-time challenges, signed responses |
| CE → registry | Exact assigned artifact | Short-lived repository-scoped pull token, digest and signature verification |
| CE → extension | Bounded snapshot and opaque continuation state | Internal-only network, per-install credential, strict size/time/schema bounds |
| CE → browser module | Manifest, verified entrypoint, opaque surface payload | Same-origin proxy, active-version binding, SHA-256 verification |
| Extension → host | No direct path | Non-root container, no host mounts/socket/devices/public ports/egress |

The browser module is inspectable after installation. It receives no private
service credential and is not a confidentiality boundary. Same-origin
execution is acceptable only for the official signed extension; CE validates
the entrypoint on every proxy path. It is part of the administrator-origin
trusted computing base: Shadow DOM provides style and lifecycle isolation, not
a security sandbox.

## Principal threats and mitigations

| Threat | Mitigation |
| --- | --- |
| Forged or replayed entitlement | Ed25519 JWS, key/type/device binding, one-time challenges, monotonic trusted time |
| Manifest downgrade or artifact substitution | Sequence high-water mark, assignment/term/architecture checks, digest-only pull, image signature policy |
| Registry credential theft | Purpose-bound proof, exact repository scope, short lifetime, owner-only transient Docker config |
| Extension host escape | Scratch/non-root image, read-only filesystem, no capabilities, no-new-privileges, internal network, resource limits |
| Browser entrypoint substitution | Strict asset name, active component-version binding, manifest SHA-256, immutable same-origin proxy |
| Compromised official browser module | Official-extension allowlist, assigned signed image, entrypoint hash, no remote script origins, and independent server-side authorization/safety checks on every CE mutation |
| Direct browser access to agent | No published port, internal network, credential retained by CE only |
| Malicious surface data | Payload is consumed only by the signed private browser module; CE exposes no operation authority through the surface endpoint |
| Snapshot secret disclosure | Closed typed allowlist, pseudonymous resource refs, aggregate/categorical values, byte/count/time bounds |
| Opaque-state tampering | Private authenticated encryption; CE binds state to extension ID, active digest, and surface |
| Extension failure affects CE | Optional dependencies, isolated loader/route error boundaries, bounded resources, rollback and removal |
| Removal affects user data | Exact owned-resource labels/names and no user volume mount |

## Prohibited properties

Release review fails if an extension receives a Docker socket, host root,
arbitrary host path, privileged mode, host namespace, device, public port,
generic command API, CE database, administrator credential, registry token, or
control-plane signer. Browser code may not receive the agent token or call its
internal address.

Any future host mutation requires an explicit CE operation broker with a fixed
operation type, independent entitlement check, administrator approval, and CE
safety validation. Surface payloads alone can never request host mutation.
Third-party extension code is prohibited on this same-origin loader. Supporting
it would require a separately reviewed opaque-origin iframe/message bridge and
a capability-scoped host protocol.

## Residual risk

The Docker daemon, kernel, CE administrator, root-equivalent CE backend, and
official same-origin Pro browser module are trusted computing base. A malicious
reviewed source change can still produce a valid signed image, and a compromised
official browser module could act with the logged-in administrator's CE session.
Browser code is visible to customers. Container escape, unknown vulnerabilities,
signer compromise, traffic analysis, and product quality require ongoing
independent review and production hardening.
