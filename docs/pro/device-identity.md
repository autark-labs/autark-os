# Autark Pro Device Identity

Autark-OS creates a dedicated Pro device identity on first Pro identity use. It
uses an Ed25519 key generated from the operating system's secure random source,
plus independent random UUIDv4 device and installation identifiers. Hostnames,
MAC addresses, serial numbers, the existing CE instance ID, and runtime paths
are not inputs.

The fallback store is:

```text
<AUTARK_OS_RUNTIME_ROOT>/config/pro/device-identity.json
```

It contains the PKCS#8 private key because no hardware-backed or operating
system secret-store adapter exists in the current supported host baseline. The
file is owned by the backend service account and must have mode `0600`; its
directory is created with mode `0700`. Every later startup fails if the file is corrupt, is
a symbolic link, uses broader permissions, or contains a mismatched key pair.
Autark-OS never silently replaces it.

The Java `DeviceKeyStore` exposes only a signing handle. Normal consumers can
read the public device ID, installation ID, Ed25519 JWK, key ID, and SHA-256
public-key fingerprint; they cannot obtain a `PrivateKey` or its encoded bytes.
No HTTP route returns private identity material, and support bundles do not read
the protected file.

## Local recovery commands

Print public metadata locally:

```bash
sudo autark-os pro identity
```

Rotate only the installation identity:

```bash
sudo autark-os pro rotate-installation-id \
  --confirm ROTATE-INSTALLATION-IDENTITY
```

Rotation requires the backend to be running. The CLI reads the existing
root-only local recovery credential and calls a loopback-only endpoint. It
preserves the device ID and signing key. Because the installation ID is part of
device binding, use this only during an explicit recovery or re-enrollment
procedure.

There is intentionally no command that silently rotates or regenerates the
device signing key. If the protected file is lost or corrupt, restore it from a
trusted local backup. A future key-recovery story must define control-plane
authorization and audit semantics before key replacement is allowed.
