# Autark Pro Prototype Known Limitations

These limitations apply to `0.2.0-staging.1`. They are explicit release
boundaries, not production guarantees.

## Release and operations

- The build is a private staging prototype, not generally available or
  production-ready.
- The public staging registry must have real DNS, TLS, a Distribution v3 token
  policy, and a read-only registry public JWKS before a staging release can be
  installed.
- A protected GitHub OIDC tag run must publish and verify the real
  multi-architecture index, SBOMs, provenance, signatures, scans, and
  control-plane manifest. A local keyed-signature harness is not remote release
  evidence.
- The prototype has exact per-device assignments, but no percentage rollout,
  cohort engine, pause/resume dashboard, signed withdrawal document, or fleet
  observability. Those controls belong to PRO-502.
- Release-document, entitlement, and registry-token keys do not yet have the
  signed rotation/recovery/revocation protocol planned for PRO-501.
- Online signing material is held in Supabase managed secrets for the
  prototype; production KMS/HSM custody is deferred.

## Entitlement and accounts

- Activation is by one-time code only. Account-session activation, device
  transfer, self-service recovery, and remote unlink are not implemented.
- Local deactivation cannot claim to delete the control-plane device
  association.
- The durable update term is fixed at activation. Operators must not edit a
  signed grant to simulate retained use.
- Retained use preserves an eligible installed local version. It does not
  promise indefinite hosted registry, relay, push, support, download, or
  compatibility with future clients.
- Billing, checkout, subscription lifecycle, and customer account management
  are intentionally absent.

## Guardian and data

- Guardian is read-only. It cannot execute repair, restart, update, backup,
  verification, restore, cleanup, or any other operation.
- Private feature policy is prototype quality and needs field calibration for
  usefulness and false-positive rates. A finding remains advisory evidence,
  not a guarantee or a causal claim.
- Feature history and derived state live only in the private agent's encrypted
  continuation token. Losing the per-install token or module state resets that
  context rather than exposing it to Community Edition.
- Private feature history is local to the extension. Production export,
  deletion, and configurable retention are deferred to PRO-503.

## Runtime and platform

- AMD64 lifecycle execution is native in the local gate. ARM64 startup and API
  behavior are proven under pinned QEMU user-mode, not as native performance or
  long-duration stability evidence.
- The agent depends on the host Docker daemon, kernel, default seccomp, and
  AppArmor configuration. A root or Docker-daemon compromise is outside its
  container boundary.
- The agent has bounded CPU/memory/pids and no default external egress, but
  broad resource-exhaustion and kernel/container-escape chaos testing remains
  PRO-504.
- Only the current API/schema v1 prototype combination is supported. There is
  no backward-compatibility commitment yet.
- Private surface analysis currently runs on demand when a hosted surface is
  opened or refreshed.

## Security and privacy

- No independent security assessment or penetration test has been completed.
- No formal production privacy review, data-processing inventory, customer
  export, hosted deletion, or full retention job is implemented.
- The current trust stores embed staging public keys. Planned overlapping
  rotation and offline-root recovery are absent.
- The release scan blocks known unexcepted HIGH/CRITICAL findings, but scanning
  cannot detect unknown vulnerabilities or malicious reviewed source.
- Local lifecycle tests use ephemeral test authorities. They do not prove
  external DNS, TLS-provider, registry-host, GitHub Environment, or managed
  secret configuration.

## Demonstration boundary

The reproducible demo fixture proves deterministic analysis against public
contracts. It is synthetic and contains no customer data. The lifecycle harness
proves real local boundaries with ephemeral authority. A complete staging demo
additionally requires a real one-time activation, protected agent publication,
control-plane manifest, registry pull, clean-appliance cutover, rollback
exercise, retained-use evidence, removal, and CE smoke checks.
