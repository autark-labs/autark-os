# Administrator Access And Recovery

Autark-OS uses one local administrator account for the appliance. It does not currently provide cloud accounts, separate household users, roles, invitations, or email password recovery.

## Claim A New Installation

The first browser that opens an unclaimed installation must provide a setup code and create an administrator password. The web page intentionally does not display that code.

On the Autark-OS server, run:

```bash
sudo autark-os admin setup-code
```

Enter the printed code in the browser and choose a password with at least 12 characters. The setup code is removed after a successful claim and cannot be reused.

Only a person who can approve `sudo` on the server can retrieve the code. Do not copy the code into a support request or leave it in a shared terminal history.

## Browser Sessions

Autark-OS keeps the browser session in an HttpOnly cookie. The application does not store the administrator credential in browser local storage. A session ends when you choose **Log out**, after extended inactivity, when its maximum lifetime is reached, when the administrator password is reset, or when the backend restarts.

If a session expires, Autark-OS returns to one login screen. Work already completed by the server is not undone. Log in again to continue.

## Reset A Lost Password

Password recovery requires local root approval. On the Autark-OS server, run:

```bash
sudo autark-os admin reset-password
```

Enter and confirm the new password when prompted. The command does not print the password, revokes all existing browser and CLI sessions, and preserves installed apps, settings, backups, Docker resources, and the Tailscale identity.

## CLI Login

Commands that read private appliance data or change state ask for the same administrator password. The CLI keeps a short-lived, owner-readable session token on the local host so related commands do not repeatedly prompt. Browser cookies and CLI tokens are separate, and both are invalidated by a password reset or backend restart.

## LAN HTTP And Safe Remote Access

The default LAN address uses plain HTTP, for example `http://192.168.1.20:8082`. HTTP traffic is not encrypted between the browser and server. Use it only on a home network you trust.

For access away from the server or across an untrusted network, configure Tailscale from **Access** and use the private HTTPS link from a trusted device on the same tailnet. Do not forward the Autark-OS port directly to the public internet.

## What Unauthenticated Clients Can See

Before login, the API exposes only minimal liveness and administrator-login bootstrap information. It does not return setup proof, apps, jobs, activity, settings, storage, support data, host paths, private URLs, Tailscale details, or other appliance state.

Support reports redact known credentials, session and setup values, private URLs and addresses, email addresses, user home paths, and local host identifiers. Review a report before sharing it and send it only to a trusted support person.
