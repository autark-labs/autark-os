# Troubleshooting

## The installer stopped

Read the final **Failed stage** and **Reason** lines. The portable installer also prints the paths to `installer-state.json` and `installer.log`. Fix the named problem, then rerun the same `.run` file; completed stages are safe to repeat.

If the failed stage is **service-health**, the installer now prints the service state and recent startup messages before it exits. Those details are also saved in the installer log. You do not need to find a separate log before retrying.

If Docker is mentioned, check both the service and Compose v2:

```bash
sudo systemctl status docker
sudo docker info
docker compose version
```

Autark-OS preserves a working existing Docker installation. It will not silently remove conflicting Docker, Podman, `containerd`, or `runc` packages. Use the portable installer on a clean supported host when you want automatic setup from Docker's official package repository.

Installation is complete only when the last line says **Autark-OS Portable Installer completed successfully**. The installer then prints the local and LAN addresses to open.

## The page will not open

Run:

```bash
autark-os doctor
autark-os status
autark-os url
```

If the service is not healthy, inspect recent logs:

```bash
autark-os logs
```

This command asks for administrator approval when system service logs are protected by Linux, shows the latest 200 messages, and then exits. To keep watching for new messages, run `autark-os logs --follow` and press `Ctrl+C` when you are done.

## An app needs attention

Open **My Apps**, select the app, and read the recommended action. Use **Repair** only after reviewing the message. If the app is protected, create or confirm a restore point before making a risky change.

## Private links do not work

Open **Access**. Check that Tailscale is signed in, then use the app's details to review the local and private links. Local access can continue to work even when private access is unavailable.

## You need help

Open **Diagnostics** and choose **Generate support report**. Download the redacted report and share it only with a trusted support person.
