# Portable and offline installation

Use this guide when the target server cannot download packages during installation. Build or download the release files on another machine first, then copy them to the server with a USB drive or a trusted local transfer.

## What to copy

Copy these files from one Autark-OS release to the same folder:

- `Autark-OS-Installer-<version>-<arch>.run`, or `autark-os-<version>-<arch>.tar.gz`
- `SHA256SUMS`

Use the architecture that matches the server: `amd64` for most Intel/AMD systems and `arm64` for supported Raspberry Pi-style systems.

## Verify before installing

From the folder containing the files, run:

```bash
sha256sum -c SHA256SUMS --ignore-missing
```

Do not install if this command reports a failed check.

## Run the portable installer

```bash
chmod +x Autark-OS-Installer-<version>-amd64.run
./Autark-OS-Installer-<version>-amd64.run
```

The server still needs its required host dependencies, including Docker and Docker Compose, before it can install apps from **Discover**. If it cannot reach a package source, prepare those dependencies through your operating system’s approved offline method first.

## Tarball alternative

```bash
tar -xzf autark-os-<version>-<arch>.tar.gz
cd autark-os-<version>-<arch>
./scripts/autark-os install
```

After installation, run `autark-os doctor` and open the address printed by `autark-os url`.
