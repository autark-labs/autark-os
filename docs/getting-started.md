# Autark-OS: Getting Started And Recovery

This guide is included with every release so you can use and recover
Autark-OS without returning to the source repository.

## Open Autark-OS

Open the address printed by the installer. On the host, the usual address is
`http://localhost:8082`. Print the current address later with:

```bash
autark-os url
```

For first-time setup, retrieve the local setup code on the host:

```bash
sudo autark-os admin setup-code
```

Keep this code private.

## Check, Update, And Recover

```bash
autark-os status
autark-os logs
autark-os version
autark-os support-bundle --output ./autark-os-support.tar.gz
autark-os update
autark-os uninstall --plan
sudo autark-os admin reset-password
```

`autark-os update` shows a plan, asks for confirmation, and restores the
previous program files and local database if the new release is unhealthy.
Use `autark-os update check`, `plan`, `status`, or `rollback` for a scoped
update action. The normal uninstall preserves managed app data, backups, and
the local database; permanent data deletion needs the explicit command shown
by the uninstall plan. Password recovery signs out existing sessions but does
not remove apps, backups, or data.

## Private Access And Backups

Tailscale is optional for local use. Configure it later in **Access** after the
base installation works. Create a backup before risky changes whenever one is
available. Only restore points marked verified should be treated as ready for
recovery. Autark-OS does not claim that backups are encrypted, and a backup on
the same device does not protect against loss of that device.

## More Help

This directory contains the license, third-party component inventory, support
policy, security reporting guidance, and release notes. For installation help
or product defects, use <https://github.com/autark-labs/autark-os/issues>.
For commercial licensing questions, contact <licensing@autarklabs.com>.

## License At A Glance

Autark-OS is distributed under the Autark Community License. It permits
personal and non-commercial use, study, modification, and self-hosting. Paid
hosting, resale, commercial support, and commercial redistribution require a
separate agreement with Autark Labs. Read `LICENSE.md` and
`COMMERCIAL-LICENSE.md` in this directory for the complete terms.
