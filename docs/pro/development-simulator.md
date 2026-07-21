# Extension Lifecycle Development Simulator

`tools/pro-simulator/` is a loopback-only lifecycle simulator for CE
development. It generates an ephemeral Ed25519 key at startup and returns
signed, synthetic grants, leases, and release manifests plus invalid registry
credentials.

It intentionally does not implement or simulate the private agent, browser
module, surface payloads, product rules, or feature presentation. Integration
with those behaviors requires a private development image.

Start and test it with:

```bash
node tools/pro-simulator/server.mjs
node --test tools/pro-simulator/server.test.mjs
```

The control-plane fixture is available under
`http://127.0.0.1:4177/control-plane`. Development configuration is accepted
only when the `dev` or `test` Spring profile and the explicit simulator flag are
both present. Production code has no skip-verification setting.

The synthetic scenarios cover active, grace, retained use, revocation,
signature failure, compatibility/health failure, manifest expiry, digest
mismatch, and malformed lifecycle responses.
