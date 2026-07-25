# Protected Core Update Helper

The browser never receives host root access. It talks only to the ordinary,
authenticated local Autark-OS API. That API may invoke the root-owned
`autark-os-update-helper` through one sudoers rule for the `autarkos` service
user. The helper is not a shell and has no command, URL, path, environment, or
private-agent control channel.

## Allowed protocol

The helper accepts only these named operations:

1. `status` and `health` return redacted durable state.
2. `stage` accepts only a generated bundle id and reads the corresponding gzip
   archive from the fixed runtime inbox.
3. `inspect` and `verify` read only the protected staged copy.
4. `approve` records a short-lived, one-time approval bound to the exact
   SHA-256 identity of the signed `SHA256SUMS` manifest and the durable job id.
5. `apply` starts a fixed transient systemd worker; `run` is internal to that
   worker. The worker invokes only the installed root-owned
   `autark-os update apply --release-bundle … --yes` command.
6. `rollback` and its internal worker restore only the update CLI's recorded
   pre-update snapshot. They never accept a browser-supplied snapshot path.

Release archives are unpacked with absolute paths, `..`, links, devices,
duplicate files, member counts, compressed size, and expanded size rejected.
Every payload regular file must be covered exactly once by `SHA256SUMS` before
the helper reads its release manifest. The checksum manifest and Sigstore
`SHA256SUMS.sigstore.json` bundle are intentionally excluded from that set,
avoiding a circular signature dependency; the helper verifies the signed bundle
over the exact checksum manifest separately. Browser installation then also requires a trusted
signature, a matching host architecture, and a non-expired one-time approval.
A second use, changed digest, missing approval, wrong architecture, unsigned
bundle, malformed archive, or helper restart fails closed.

The updater runs in a transient systemd unit rather than the backend service
control group. It therefore survives the intentional stop of `autark-os.service`
and writes its terminal result to a root-owned durable state file. The next
backend start reconciles that state back to the existing update job. The normal
update script still snapshots program/config/database state and performs its
own health-gated rollback.

## Trust and release operations

The helper requires the root-owned trusted public key configured by
`AUTARK_OS_CORE_UPDATE_SIGNING_KEY` and the root-owned pinned verifier configured
by `AUTARK_OS_CORE_UPDATE_VERIFIER`. It rejects the development
`signatureStatus: unsigned-reserved` format deliberately. Signed release CI
ships `keys/core-update-release.pub` and signs the completed `SHA256SUMS` as
`SHA256SUMS.sigstore.json`; the installer copies that public key to the root-owned
configuration directory. Private signing material never enters the bundle.

Release policy distinguishes local, staging, and production trust contexts.
Staging is restricted to signed beta releases with a `staging-*` key id.
Production is restricted to signed stable releases with a `production-*` key
id and a configured public-key SHA-256 trust-root pin. A staging identity,
origin, or trust root is rejected before a production bundle is built. The
offline release documentation also includes `RELEASE_SIGNING.md` with the
protected GitHub environment configuration and rotation procedure.

The service installer installs the helper root-owned, records its checksum in
the root-owned environment file, and writes a separate narrow sudoers command
rule alongside the existing bounded file-operations helper. If ownership,
checksum, policy, verifier, or signing key is missing, the API returns a guided
repair state. **Settings → Advanced → System updates** is the normal update
flow. Recovery media and `autark-os update` remain emergency operator tools.
