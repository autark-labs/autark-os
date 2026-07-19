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

## You cannot claim or log in

For a new installation, retrieve the setup code on the Autark-OS server:

```bash
sudo autark-os admin setup-code
```

The browser intentionally cannot display or retrieve this code. If the appliance is already claimed and the password is lost, reset it locally:

```bash
sudo autark-os admin reset-password
```

The reset revokes existing sessions but preserves apps, settings, backups, Docker resources, and Tailscale. If a session merely expired, log in again; do not reset the password.

## An app needs attention

Open **My Apps**, select the app, and read the recommended action. Use **Repair** only after reviewing the message. If the app is protected, create or confirm a restore point before making a risky change.

## A managed app update is blocked or rolled back

Open **My Apps**, select the app, open **Manage app**, and review the **App
release** message in the **Overview** tab. An update is intentionally blocked
when backups are not ready, the app is unhealthy, immutable image identities
cannot be resolved, or the new catalog release changes more than container
images.

If Autark-OS reports that it rolled the release back, the target release did
not pass verification and the saved previous release was restored. Do not
repeatedly retry it. Confirm that the app is healthy, keep the retained release
snapshot, and generate a support report from **Diagnostics**.

## Private links do not work

Open **Access** and check the app's private-link state. **Verified** means Autark-OS found a live Tailscale Serve HTTPS endpoint that points to the app's expected local port. **Needs repair** means the private-link preference is saved, but Autark-OS will keep using the working local link until the live route is fixed.

Choose **Repair private link** first. Autark-OS will grant its service user the limited Tailscale permission when possible, recreate the route, and verify it before offering the private URL again. Removing a link that is already absent is safe and is reported as complete.

Test a private link from another device that is signed into the same tailnet. If support asks for technical details, run:

```bash
sudo tailscale status
sudo tailscale serve status --json
sudo -u autarkos tailscale serve status --json
```

Both Serve status commands should show the same mapping. If the service user receives a permission error, run this recovery command once and then choose **Repair private link** again:

```bash
sudo tailscale set --operator=autarkos
```

Local access can continue to work while Tailscale is signed out, disconnected, or waiting for repair.

## You need help

Open **Diagnostics** and choose **Generate support report**. Download the redacted report and share it only with a trusted support person.
