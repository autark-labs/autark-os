# Install Autark-OS

This guide is for installing Autark-OS on a home server, mini PC, or Raspberry Pi-style Linux device without learning the internal architecture. Follow the recommended path first. Use the advanced links at the end only when a support person asks for them.

## Choose Your Install Option

**Recommended path: the Debian package**

Use the `.deb` file from the Autark-OS GitHub Release page on Debian, Ubuntu, or Raspberry Pi OS. It installs the service and prints the address to open in your browser:

```bash
sudo apt install ./autark-os_<version>_amd64.deb
```

**Portable installer**

Use the `.run` file when a package is not suitable or when a support person asks you to use it:

```bash
chmod +x Autark-OS-Installer-<version>-amd64.run
./Autark-OS-Installer-<version>-amd64.run
```

**Advanced CLI**

Use this only for beta testing, development, or scripted installs. It may ask you to read terminal output and fix host dependencies. Advanced setup details live in the docs linked at the end of this guide.

## Prepare The Device

Use a device that can stay powered on, connected to your home network, and attached to any storage you want Autark-OS to use.

Before you start:

- Install one of the supported releases: Debian 12, Ubuntu 22.04 or 24.04, or Raspberry Pi OS 12, on x86-64 or ARM64 hardware with at least 2 GB memory and 10 GB free disk space.
- Connect the device to the internet.
- Sign in with an account that can approve administrator prompts.
- Attach an SSD if you want app data and backups stored away from the system drive.
- Decide whether you want private access from your phone or laptop. Autark-OS uses Tailscale for that path.

For best results, avoid removable storage paths that appear only after someone signs into the desktop, such as `/media/<name>/<drive>`. A stable drive mount is better for apps and backups.

## Run The Installer

The package or portable installer checks the device before it changes the host. It then prints the local address to open in a browser. During beta, a support person may instead give you a local release bundle. From inside that bundle, run:

```bash
./scripts/autark-os install --guided
```

If the installer asks whether to install missing supported dependencies, choose **yes** when you are on Debian, Ubuntu, or Raspberry Pi OS and you trust the Autark-OS release source.

## Choose Storage

Autark-OS stores apps, app data, backups, restore points, and its local database in one runtime storage location.

Choose the recommended drive when the installer marks it as a good choice. Prefer an attached SSD for long-running app data. The system drive is acceptable for a small trial, but it is easier to run out of space.

Avoid temporary desktop mount paths when possible. If the installer warns that a drive may disappear after reboot, choose another location or ask for help setting a stable mount.

## Choose Private Access

Choose **Set up private access now** if you want to open apps from trusted phones, laptops, or remote locations. This path uses Tailscale and may ask you to sign in.

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

When Autark-OS opens, finish the first setup screen. Confirm the device name, storage location, backup choice, and private access state.

For a step-by-step walkthrough, see [First run](./first-run.md).

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

- [Beta testing repository](https://github.com/autark-labs/autark-os/): source install, release bundle, update, uninstall, and support-archive commands.
- [Portable and offline installation](./offline-install.md): install copied release files without downloading during setup.
- [Service user installation](./service-user-installation.md): system user, systemd service, Docker access, and Tailscale operator setup.
- [Local development](./local-development.md): source checkout and developer workflow.
