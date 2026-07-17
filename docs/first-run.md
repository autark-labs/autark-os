# First run: set up your server and first app

After installation, open the address printed by the installer. On the server itself, this is usually `http://localhost:8082`.

## Claim the appliance

Before the setup wizard opens, Autark-OS asks for a local setup code and a new administrator password. On the server, run:

```bash
sudo autark-os admin setup-code
```

Enter that code in the browser and choose a password with at least 12 characters. The browser cannot retrieve the code on its own, and the code disappears after a successful claim. See [Administrator access and recovery](./security-and-admin-access.md) if you lose the password later.

## Complete setup

The setup screen asks for a few choices:

1. **Device name** — choose a name you will recognize later.
2. **Readiness** — read any warning before continuing. Docker is required to install apps from **Discover**.
3. **Private access** — choose private access now if you use Tailscale, or choose local-only if you only need your home network.
4. **Backups** — keep automatic backups on unless you have a reason to postpone them. Same-device backups help with app recovery; select a mounted external drive if you also need protection from a runtime-drive failure. See [Backups and recovery](./backups-and-recovery.md) before selecting or removing a drive.
5. **Starter apps** — these are optional suggestions, not installed apps.

Choose **Finish setup** when the review screen says the server is ready.

## Install your first app

1. Open **Discover**.
2. Select an app and read its description.
3. Choose **Install**.
4. Review the install plan, then confirm the install.
5. When the job finishes, open **My Apps** and choose **Open**.

## Understand what you see

- **Managed app**: this Autark-OS server owns and maintains it.
- **Found on this server**: Autark-OS detected it but does not own it. Review it before making changes.
- **Linked service**: a visible shortcut to something managed elsewhere.
- **Protected by a restore point**: a completed, verified backup is available.

If anything is unclear, open **Diagnostics** and generate a support report before making a destructive change.
