# Install Autark-OS

This guide is for installing Autark-OS on a home server, mini PC, or Raspberry Pi-style Linux device without learning the internal architecture. Follow the recommended path first. Use the advanced links at the end only when a support person asks for them.

## Choose Your Install Option

**Portable installer — Recommended path**

Download the `.run` file from the Autark-OS GitHub Release page. Choose `amd64` for most Intel/AMD computers and `arm64` for a 64-bit Raspberry Pi or ARM server. It checks the download, asks for administrator approval once, installs Docker when a clean supported host needs it, starts Autark-OS, and prints the address to open:

```bash
chmod +x Autark-OS-Installer-<version>-amd64.run
./Autark-OS-Installer-<version>-amd64.run
```

**Advanced package alternative**

The `.deb` installs the Autark-OS base service, but it does not replace or repair Docker. Use it when Docker Engine and Docker Compose v2 are already working or when a technical administrator manages system dependencies separately:

```bash
sudo apt install ./autark-os_<version>_amd64.deb
```

**Advanced CLI**

Use this only for scripted beta or support-assisted installs. It may ask you to read terminal output and fix host dependencies. Advanced setup details live in the docs linked at the end of this guide.

## Prepare The Device

Use a device that can stay powered on, connected to your home network, and attached to any storage you want Autark-OS to use.

Before you start:

- Install one of the supported 64-bit releases: Debian 12/13, Ubuntu 24.04/26.04 LTS, or Raspberry Pi OS 12/13. Raspberry Pi OS 13 is recommended for Pi 5. Pi OS 11 is supported only on compatible older Pi hardware.
- Connect the device to the internet.
- Sign in with an account that can approve administrator prompts.
- Attach an SSD if you want app data and backups stored away from the system drive.
- Decide whether you want private access from your phone or laptop. Autark-OS uses Tailscale for that path.

For best results, avoid removable storage paths that appear only after someone signs into the desktop, such as `/media/<name>/<drive>`. A stable drive mount is better for apps and backups.

## Run The Installer

The portable installer checks its files and your device before it requests administrator access. After you confirm installation, your operating system may ask for your password once. Autark-OS keeps that approved administrator session for dependency, service, and system-folder changes instead of interrupting the install with several separate prompts.

The installer preserves an existing Docker Engine and Compose v2 installation when it works. On a clean supported device, it uses Docker's official package repository. It will stop and explain the conflict instead of silently removing an existing container runtime.

During beta, a support person may instead give you a local release bundle. From inside that bundle, run:

```bash
./scripts/autark-os install --guided
```

If the installer asks whether to install missing supported dependencies, choose **yes** when you are on Debian, Ubuntu, or Raspberry Pi OS and you trust the Autark-OS release source.

## Choose Storage

Autark-OS stores apps, app data, backups, restore points, and its local database in one runtime storage location.

Choose the recommended drive when the installer marks it as a good choice. Prefer an attached SSD for long-running app data. The system drive is acceptable for a small trial, but it is easier to run out of space.

Avoid temporary desktop mount paths when possible. If the installer warns that a drive may disappear after reboot, choose another location or ask for help setting a stable mount.

## Choose Private Access

Finish the base installation first. Then open **Access** and choose the private-access setup if you want to open apps from trusted phones, laptops, or remote locations. This path uses Tailscale and may ask you to sign in.

Choose **Use local-only for now** if you only want to use Autark-OS on the device or home network. You can turn on private access later from **Access**.

Do not enable public internet access unless you understand the risks. Autark-OS is designed around private access first.

## Open Autark-OS

After installation, the installer should show a browser link. On the device itself, the usual address is:

```text
http://localhost:8082
```

From another device on the same home network, use the address shown by the installer. It will usually look like:

```text
http://<device-address>:8082
```

When Autark-OS opens, it first asks you to protect the appliance. On the server, run:

```bash
sudo autark-os admin setup-code
```

Enter that local code in the browser and create an administrator password with at least 12 characters. The browser does not show the code because only someone with administrator access to the server should be able to claim it. Then confirm the device name, storage location, backup choice, and private access state.

For a step-by-step walkthrough, see [First run](./first-run.md). For login and lost-password help, see [Administrator access and recovery](./security-and-admin-access.md).

## Install Your First App

Open **Discover** and choose a simple first app. The app card shows what the app is for, how difficult it is to run, and whether the device is ready.

Choose **Install**, review the plan, and continue. After the app is ready, open **My Apps** to see its status, access link, storage use, and next steps.

If the app needs attention, Autark-OS should show a plain-language message and a safe next action. Advanced details remain available for support.

## If Setup Needs Attention

If the installer says the device needs attention, start with the message on screen. Most issues are one of these:

- Docker is missing, so apps cannot run yet.
- Tailscale is missing or not signed in, so private links are not ready.
- The selected storage path is unstable or low on space.
- The Autark-OS service did not start.

The portable installer names the failed stage and prints the installer log and state-file paths. It is safe to fix the named issue and rerun the same installer; completed stages are designed to repeat safely. Do not assume installation succeeded unless the final message says the portable installer completed successfully.

To save a support report, open **Diagnostics** and choose **Generate support report**. If you are in a terminal, run:

```bash
autark-os support-bundle --output ./autark-os-support.tar.gz
```

Then choose **Download report** to save the redacted `.txt` report. **Copy report** is optional, and **View technical logs** opens the recent redacted logs.

If Autark-OS is installed but the page will not open, these commands are useful for support:

```bash
autark-os doctor
autark-os status
autark-os logs
```

Do not paste long terminal logs into chat unless support asks. The support report is designed to include useful details with secrets masked.

## Advanced Install Docs

Use these only when you need the technical details:

- [Technical installation](./technical-installation.md): supported hosts, release artifacts, preflight checks, storage locations, and installed paths.
- [Portable and offline installation](./offline-install.md): install copied release files without downloading during setup.
- [Service and storage reference](./service-user-installation.md): system user, systemd service, Docker access, and Tailscale operator setup.
