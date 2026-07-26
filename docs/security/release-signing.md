# Signed Release Artifacts

Autark-OS release CI signs the completed release checksum manifest and publishes
the Sigstore bundle at `SHA256SUMS.sigstore.json`. This signature provides
independent supply-chain verification of published artifacts. It is not an
appliance update mechanism. Neither the private signing key nor a privileged
core-update helper is placed in a source repository, release bundle, or
customer appliance.

## GitHub environments

Create these protected GitHub environments before running the public release
workflow:

| Environment | Release channel | Key-id rule | Release-origin rule |
| --- | --- | --- | --- |
| `core-release-staging` | `beta` | `staging-*` | HTTPS URL containing `staging` |
| `core-release-production` | `stable` | `production-*` | HTTPS URL without `staging` |

Allow only `main` and `v*` deployment rules. Require a reviewer for
`core-release-production`. The build job uses these environments before it
creates either architecture's signed artifacts. The existing
`installer-beta` and `installer-stable` environments remain responsible for
draft GitHub Release publication.

Each core-release environment needs these variables:

```text
AUTARK_OS_RELEASE_SIGNING_KEY_ID
AUTARK_OS_RELEASE_ORIGIN
AUTARK_OS_RELEASE_TRUST_ROOT_SHA256
```

It needs these secrets:

```text
AUTARK_OS_RELEASE_SIGNING_PRIVATE_KEY_B64
AUTARK_OS_RELEASE_SIGNING_PUBLIC_KEY_B64
AUTARK_OS_RELEASE_SIGNING_PASSWORD
```

Generate each key outside the repository. Use independent staging and
production keys and passwords:

```bash
umask 077
export COSIGN_PASSWORD='store-this-unique-password-in-your-password-manager'
cosign generate-key-pair --output-key-prefix autark-os-core-release-production
sha256sum autark-os-core-release-production.pub
base64 -w0 autark-os-core-release-production.key; printf '\n'
base64 -w0 autark-os-core-release-production.pub; printf '\n'
```

Set the public-key SHA-256 output as
`AUTARK_OS_RELEASE_TRUST_ROOT_SHA256`. Set the two printed base64 values as
the matching environment secrets and the password as
`AUTARK_OS_RELEASE_SIGNING_PASSWORD`. Retain the original private key only in
an offline recovery location, then remove it from the workstation. Repeat with
a distinct staging key.

The release builder fails closed if a signing key is absent, a public-key hash
does not match its protected environment variable, a beta/stable channel is
wrong for the environment, or a production release carries a staging key id or
origin. A locally built unsigned bundle is suitable only for development.

## Rotation and withdrawal

Before rotating a key, make a signed rehearsal with the replacement trust root
and verify every published artifact independently. Never overwrite a release
asset. If a key is compromised, stop draft publication, disable the affected
GitHub environment, remove the key secret, and issue new signed artifacts with
a new key id.
