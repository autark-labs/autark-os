# Autark Pro Entitlement Verification

The public core verifies durable grants and online-service leases independently
of HTTP status and control-plane availability.

`backend/src/main/resources/pro/trust-store-v1.json` contains public Ed25519
verification keys only. `ProTrustStore` resolves documents by `kid` and supports
multiple keys so verification does not require a network call and later
rotations can overlap. Unknown keys, algorithms, document types, schema
versions, fields, features, services, devices, installations, fingerprints,
grant IDs, or invalid time orderings fail closed.

The current embedded staging key is:

```text
key ID: staging-entitlement-2026-01
public JWK x: JZvy1UHZoVBTZ4J9gUJMc_LTCHOLNL0XpZb0A2yz66Y
```

No private entitlement key is present in the appliance, frontend, repository,
or trust document.

After signature and binding verification, `ProContractPolicy` applies trusted
time monotonically:

- an active unexpired lease enables local, update, and hosted-service use;
- ordinary lease expiry enters the configured online grace period while local
  durable features remain usable;
- a signed suspended or revoked lease stops hosted-service use without a grace
  extension;
- maintenance end enters `RETAINED_USE`, preserves local execution of eligible
  cached releases, and denies releases published after `updatesThrough`;
- a local clock rollback cannot move behind the last signed server-time
  checkpoint.

## Local cache and renewal

The appliance persists only signed grant/lease envelopes after independently
verifying their Ed25519 signatures, document types, key IDs, device bindings,
and time order. It also stores document fingerprints, issuer key IDs, a
monotonic signed server-time checkpoint, and redacted refresh metadata. The
SQLite database is restricted to owner read/write permissions on POSIX
appliances.

Activation codes and activation tickets are never persisted. The authenticated
local API returns an opaque activation-attempt UUID while the short-lived
control-plane ticket remains in process memory. Status responses omit signed
envelopes and expose only their operational fingerprints.

Renewal is single-flight across scheduler and UI calls. Success is scheduled
from the signed `renewAfter` value with bounded jitter; failures use bounded
exponential backoff. A response cannot replace a verified cached grant or lease
when its signature is invalid, its server-time checkpoint moves backward, or
its signed issuance time is older or conflicts at the same issuance time.

Local deactivation requires the exact `DEACTIVATE-AUTARK-PRO` phrase plus
acknowledgement that module data and the control-plane account association are
retained. It clears cached entitlement documents, blocks silent renewal, and
disables local Pro authorization and hosted access. It does not rotate the
device identity, delete module data, or claim to unlink the remote device.
