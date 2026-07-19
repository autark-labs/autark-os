# Autark-OS Documentation

Autark-OS guides for people who use or administer a home server. Start with the guide that matches what you are trying to do; each guide uses the same names that appear in the app.

The repository README is the public overview. These guides focus on installing, using, maintaining, and recovering an Autark-OS server.

## Start Here

- [Install Autark-OS](./non-technical-install-guide.md): plain-language install guide for first-time users and support-assisted installs.
- [First run](./first-run.md): finish setup, install a first app, and understand app ownership labels.
- [Getting started and recovery](./getting-started.md): keep the essential appliance and managed-app update, recovery, and support actions close at hand.
- [Administrator access and recovery](./security-and-admin-access.md): claim the appliance, understand sessions, reset a lost password, and use safe remote access.

## Use And Recover

- [Backups and recovery](./backups-and-recovery.md): create, verify, and restore restore points.
- [Maintenance](./maintenance.md): repair apps, update Autark-OS, review managed-app releases and rollbacks, and uninstall safely.
- [Troubleshooting](./troubleshooting.md): solve common problems and collect a support report.

## Technical Administration

- [Technical installation](./technical-installation.md): release artifacts, supported hosts, preflight checks, runtime storage, and installed paths.
- [Portable and offline installation](./offline-install.md): verify and install copied release artifacts without downloading during setup.
- [Service and storage reference](./service-user-installation.md): the installed service, durable data paths, systemd, Docker access, and Tailscale operator setup.
- [Autark Pro CE invariants](./pro/ce-invariants.md): release-blocking rules that keep Community Edition complete when Pro is absent or unhealthy.
- [Autark Pro repository inventory](./pro/repository-inventory.md): public/private ownership, current integration seams, and prototype boundaries.
- [Architecture decisions](./adr/ADR-001-autark-pro-module-model.md): the optional module model, privilege boundary, and service separation.
- [Support policy](../SUPPORT.md): what Autark Labs can help with and when to contact an upstream app project.
- [Security reporting](../SECURITY.md): how to report a security issue without exposing credentials publicly.
- [Third-party notices](./third-party-notices.md): where to find the included runtime and dependency inventories.

## Before You Change The Host

Create a backup before risky app or host changes. Use the plan shown by Autark-OS before applying a restore, cleanup, or uninstall. When something is unclear, generate a support report before deleting data or changing Docker resources manually.
