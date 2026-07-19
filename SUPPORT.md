# Autark-OS Support Policy

## Where To Ask For Help

For installation problems and product defects, open a GitHub issue with a
clear description of what happened:

<https://github.com/autark-labs/autark-os/issues>

Before sharing logs, create a redacted support archive when possible:

```bash
autark-os support-bundle --output ./autark-os-support.tar.gz
```

Do not post passwords, setup codes, access tokens, private URLs, or the
unredacted contents of your server configuration.

## What Autark Labs Can Help With

- Installing, updating, uninstalling, and recovering Autark-OS.
- Defects in Autark-OS itself, including its documented installer, service,
  supported catalog definitions, and user interface.
- Understanding the documented backup, restore, managed-app update and
  rollback, and private-access flows.

## What Is Outside Product Support

- Support for the internal administration, data, or licensing of a third-party
  app such as Vaultwarden. Use that app's upstream project for app-specific
  questions.
- Custom Docker Compose files, manually edited Autark-OS program files,
  unsupported Linux distributions, or host changes outside the documented
  installation process.
- Recovery of lost third-party application credentials or data when no verified
  restore point exists.

Commercial licensing questions belong at <licensing@autarklabs.com>.
