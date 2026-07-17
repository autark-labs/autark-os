#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
server_pid=""
trap '[[ -z "${server_pid}" ]] || kill "${server_pid}" 2>/dev/null || true; rm -rf "${tmp_dir}"' EXIT

port_file="${tmp_dir}/port"
request_log="${tmp_dir}/requests.log"
runtime_dir="${tmp_dir}/runtime"
mkdir -p "${runtime_dir}/backups"

python3 - "${port_file}" "${request_log}" "${runtime_dir}" <<'PY' &
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

port_file, request_log, runtime_dir = sys.argv[1:]

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def body(self):
        length = int(self.headers.get("Content-Length", "0"))
        return self.rfile.read(length).decode() if length else ""

    def send_json(self, value, status=200):
        data = json.dumps(value, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def record(self):
        with open(request_log, "a") as output:
            output.write(f"{self.command} {self.path} auth={self.headers.get('Authorization', '')} client={self.headers.get('X-Autark-OS-Client', '')}\n")

    def do_GET(self):
        self.record()
        if self.path == "/api/admin/security/status":
            return self.send_json({"devMode": False, "claimed": True, "authRequired": True, "message": "Login required", "setupCodeCommand": "sudo autark-os admin setup-code", "passwordResetCommand": "sudo autark-os admin reset-password"})
        if self.path == "/api/admin/security/session":
            return self.send_json({"authorized": self.headers.get("Authorization") == "Bearer cli-session-token", "token": "", "message": "checked"})
        if self.path == "/api/system/onboarding":
            return self.send_json({"status": "not_started", "deviceName": "Autark-OS", "runtimePath": runtime_dir, "backupDestination": runtime_dir + "/backups", "tailscaleConnected": False, "automaticBackupsEnabled": True, "recommendedApps": ["vaultwarden"]})
        if self.path == "/api/system/doctor":
            return self.send_json({"status": "ready", "lanUrl": "http://localhost"})
        return self.send_json({"message": "not found"}, 404)

    def do_POST(self):
        self.record()
        body = self.body()
        if self.path == "/api/admin/security/login":
            if json.loads(body).get("password") == "correct horse battery staple":
                if self.headers.get("X-Autark-OS-Client") != "cli":
                    return self.send_json({"authorized": False, "token": "", "message": "CLI marker required"}, 401)
                return self.send_json({"authorized": True, "token": "cli-session-token", "message": "Logged in", "expiresAt": "2026-07-16T13:00:00Z", "retryAfterSeconds": 0})
            return self.send_json({"authorized": False, "token": "", "message": "Password rejected"}, 401)
        if self.path == "/api/system/onboarding/complete" and self.headers.get("Authorization") == "Bearer cli-session-token":
            return self.send_json({"status": "complete"})
        return self.send_json({"message": "Admin login required"}, 401)

    def do_PUT(self):
        self.record()
        self.body()
        if self.path == "/api/system/onboarding" and self.headers.get("Authorization") == "Bearer cli-session-token":
            return self.send_json({"status": "in_progress"})
        return self.send_json({"message": "Admin login required"}, 401)

server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
with open(port_file, "w") as output:
    output.write(str(server.server_port))
server.serve_forever()
PY
server_pid="$!"

for _ in $(seq 1 50); do
  [[ -s "${port_file}" ]] && break
  sleep 0.05
done
[[ -s "${port_file}" ]]
port="$(cat "${port_file}")"
token_file="${tmp_dir}/admin-token"

output="$(
  AUTARK_OS_BASE_URL="http://127.0.0.1:${port}" \
  AUTARK_OS_ADMIN_PASSWORD='correct horse battery staple' \
  AUTARK_OS_ADMIN_TOKEN_FILE="${token_file}" \
  "${repo_root}/scripts/autark-os" setup --non-interactive
)"

grep -q 'Setup complete.' <<<"${output}"
[[ "$(cat "${token_file}")" == "cli-session-token" ]]
[[ "$(stat -c '%a' "${token_file}")" == "600" ]]
grep -q 'POST /api/admin/security/login auth= client=cli' "${request_log}"
grep -q 'PUT /api/system/onboarding auth=Bearer cli-session-token' "${request_log}"
grep -q 'POST /api/system/onboarding/complete auth=Bearer cli-session-token' "${request_log}"
