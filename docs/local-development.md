# Local Development

Production remains the default backend mode. Local development is opt-in through the Spring `dev` profile.

## Backend

Use the helper script from the repository root:

```bash
./scripts/dev-backend.sh
```

The script runs the backend with:

```bash
SPRING_PROFILES_ACTIVE=dev SERVER_PORT=8082 ./backend/gradlew -p backend bootRun
```

Production mode is usually installed as `autark-os.service`. If that service is active, it normally owns `8082`.

To check the current state:

```bash
./scripts/dev-backend.sh --status
```

To temporarily stop production and run local dev on the normal backend port:

```bash
./scripts/dev-backend.sh --stop-service
```

To keep production running and start the dev backend on the next available port:

```bash
./scripts/dev-backend.sh --auto-port
```

To use a specific local backend port:

```bash
./scripts/dev-backend.sh --port 8092
```

The installed service remains production-oriented and may be enabled on reboot. If you stopped it for a dev session, restart it when you want to return to production:

```bash
sudo systemctl start autark-os.service
```

## Frontend

Run from the frontend folder:

```bash
cd frontend
yarn dev
```

If the dev backend is not on `8082`, point Vite at it:

```bash
cd frontend
AUTARK_OS_BACKEND_URL=http://localhost:8092 yarn dev
```

## What Dev Mode Changes

- Uses a mock Tailscale service.
- Does not run real `tailscale serve` commands.
- Treats private links as verifiable for smoke testing.
- Marks service-user and systemd checks as development notes instead of production warnings.
- Keeps the background guardian loop enabled so local installs can smoke-test self-healing behavior.

Production mode is still the default when `SPRING_PROFILES_ACTIVE` is not set.
