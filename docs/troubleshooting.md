# Troubleshooting

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

## An app needs attention

Open **My Apps**, select the app, and read the recommended action. Use **Repair** only after reviewing the message. If the app is protected, create or confirm a restore point before making a risky change.

## Private links do not work

Open **Access**. Check that Tailscale is signed in, then use the app's details to review the local and private links. Local access can continue to work even when private access is unavailable.

## You need help

Open **Diagnostics** and choose **Generate support report**. Download the redacted report and share it only with a trusted support person.
