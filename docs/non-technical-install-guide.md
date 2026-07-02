# Install Project OS

This guide is for installing Project OS on a home server, mini PC, or Raspberry Pi-style Linux device without learning the internal architecture. Follow the recommended path first. Use the advanced links at the end only when a support person asks for them.

## Choose Your Install Option

**Recommended path: GUI installer**

Use this when you are sitting near the device or can open its desktop. The GUI installer checks the device, asks where Project OS should store apps and backups, lets you choose private access, installs Project OS, and opens it in the browser. This is the intended normal-user experience and will be the primary path when the packaged installer is published.

**Second choice: One-command installer**

Use this when you are following guided instructions in a terminal or a support person is helping remotely. The public command is planned to be:

```bash
curl -fsSL https://install.project-os.dev | bash
```

The beta repository can preview this path from a local release bundle, but public download and signing are not finished yet.

**Advanced CLI**

Use this only for beta testing, development, or scripted installs. It may ask you to read terminal output and fix host dependencies. Advanced setup details live in the docs linked at the end of this guide.

## Prepare The Device

Use a device that can stay powered on, connected to your home network, and attached to any storage you want Project OS to use.

Before you start:

- Install a supported Linux system such as Debian, Ubuntu, or Raspberry Pi OS.
- Connect the device to the internet.
- Sign in with an account that can approve administrator prompts.
- Attach an SSD if you want app data and backups stored away from the system drive.
- Decide whether you want private access from your phone or laptop. Project OS uses Tailscale for that path.

For best results, avoid removable storage paths that appear only after someone signs into the desktop, such as `/media/<name>/<drive>`. A stable drive mount is better for apps and backups.

## Run The Installer

When the GUI installer is available, download it from the Project OS release page, open it, and choose **Install Project OS**. The installer should show:

1. Device check
2. Storage choice
3. Private access choice
4. Install progress
5. Open Project OS

For the one-command installer path, paste the install command from the release page into the terminal. The command should check the device before making changes and ask before installing supported dependencies.

During the current beta, a support person may give you a local release bundle instead. From inside that bundle, the closest command is:

```bash
./scripts/project-os install --guided
```

If the installer asks whether to install missing supported dependencies, choose **yes** when you are on Debian, Ubuntu, or Raspberry Pi OS and you trust the Project OS release source.

## Choose Storage

Project OS stores apps, app data, backups, restore points, and its local database in one runtime storage location.

Choose the recommended drive when the installer marks it as a good choice. Prefer an attached SSD for long-running app data. The system drive is acceptable for a small trial, but it is easier to run out of space.

Avoid temporary desktop mount paths when possible. If the installer warns that a drive may disappear after reboot, choose another location or ask for help setting a stable mount.

## Choose Private Access

Choose **Reach apps from my devices** if you want to open Project OS apps from trusted phones, laptops, or remote locations. This path uses Tailscale and may ask you to sign in to Tailscale.

Choose **Keep access local for now** if you only want to use Project OS on the device or home network. You can turn on private access later from the Network page.

Do not enable public internet access unless you understand the risks. Project OS is designed around private access first.

## Open Project OS

After installation, the installer should show a browser link. On the device itself, the usual address is:

```text
http://localhost:8082
```

From another device on the same home network, use the address shown by the installer. It will usually look like:

```text
http://<device-address>:8082
```

When Project OS opens, finish the first setup screen. Confirm the device name, storage location, backup choice, and private access state.

## Install Your First App

Open **Marketplace** and choose a simple first app. The app card should show what the app is for, how difficult it is to run, and whether the device is ready.

Choose **Install**, review the short plan, and continue. After the app is installed, open **Applications** to see its status, access link, storage use, and any next steps.

If the app needs attention, Project OS should show a plain-language message and a safe next action. Advanced details remain available for support.

## If Setup Needs Attention

If the installer says the device needs attention, start with the message on screen. Most issues are one of these:

- Docker is missing, so apps cannot run yet.
- Tailscale is missing or not signed in, so private links are not ready.
- The selected storage path is unstable or low on space.
- The Project OS service did not start.

To save a support report, use the installer’s **Save support report** action. If you are in a terminal, run:

```bash
project-os support-bundle --output ./project-os-support.tar.gz
```

If Project OS is installed but the page will not open, these commands are useful for support:

```bash
project-os doctor
project-os status
project-os logs
```

Do not paste long terminal logs into chat unless support asks. The support bundle is designed to include the useful details with secrets masked.

## Advanced Install Docs

Use these only when you need the technical details:

- [Beta installation guide](./beta-installation.md): source install, release bundle, update, uninstall, and support bundle commands.
- [Service user installation](./service-user-installation.md): system user, systemd service, Docker access, and Tailscale operator setup.
- [Local development](./local-development.md): source checkout and developer workflow.

Screenshots should be added here when the GUI installer is rendered rather than only described by its current contract.
