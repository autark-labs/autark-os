#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
server_pid=""
trap '[[ -z "${server_pid}" ]] || kill "${server_pid}" 2>/dev/null || true; rm -rf "${tmp_dir}"' EXIT

port_file="${tmp_dir}/port"
request_log="${tmp_dir}/requests.log"
scenario_file="${tmp_dir}/scenario"
printf ready >"${scenario_file}"
runtime_dir="${tmp_dir}/runtime"
mkdir -p "${runtime_dir}/backups"

python3 - "${port_file}" "${request_log}" "${runtime_dir}" "${scenario_file}" <<'PY' &
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

port_file, request_log, runtime_dir, scenario_file = sys.argv[1:]
completed = set()

def scenario():
    return open(scenario_file).read().strip()

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
            return self.send_json({"status": "complete" if scenario() in completed or scenario() == "already-complete" else "in_progress",
                "deviceName": "Autark-OS", "runtimePath": runtime_dir, "backupDestination": runtime_dir + "/external",
                "backupPosture": "external", "tailscaleConnected": False, "privateAccessChoice": "setup-now",
                "automaticBackupsEnabled": False, "recommendedApps": ["freshrss", "homepage", "syncthing"] if scenario().startswith("selected-") else [],
                "starterApps": [{"id": app, "label": label, "detail": detail, "starter": True} for app, label, detail in
                    [("freshrss", "FreshRSS", "Read your feeds."), ("homepage", "Homepage", "Your start page."), ("syncthing", "Syncthing", "Sync your files.")]],
                "doctor": {"status": "ready"}})
        if self.path == "/api/system/doctor":
            return self.send_json({"status": "ready", "lanUrl": "http://localhost", "summary": "Review current optional work.",
                "readiness": {"canCompleteOnboarding": scenario() != "hard-blocker",
                    "finishAnywayRequiresAdvanced": scenario() == "optional"}})
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
            with open(request_log, "a") as output:
                output.write("FINISH " + body + "\n")
            if scenario() == "optional" and not json.loads(body).get("acknowledgeOptionalWork"):
                return self.send_json({"message": "Explicit acknowledgement required"}, 409)
            if scenario() in {"lost-uncommitted", "readiness-race"}:
                return self.send_json({"message": "Current readiness blocks completion"}, 409)
            completed.add(scenario())
            if scenario() == "lost-committed":
                self.close_connection = True
                return
            return self.send_json({"status": "complete"})
        return self.send_json({"message": "Admin login required"}, 401)

    def do_PUT(self):
        self.record()
        body = self.body()
        with open(request_log, "a") as output:
            output.write("SETUP " + body + "\n")
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

python3 - "${request_log}" <<'PYTEST'
import json, sys
requests = [json.loads(line[6:]) for line in open(sys.argv[1]) if line.startswith("SETUP ")]
assert requests[-1]["recommendedApps"] == [], requests[-1]["recommendedApps"]
PYTEST

run_setup() {
  AUTARK_OS_BASE_URL="http://127.0.0.1:${port}" \
  AUTARK_OS_ADMIN_PASSWORD='correct horse battery staple' \
  AUTARK_OS_ADMIN_TOKEN_FILE="${token_file}" \
  "${repo_root}/scripts/autark-os" setup "$@"
}

for scenario in hard-blocker optional readiness-race lost-uncommitted; do
  printf '%s' "${scenario}" >"${scenario_file}"
  if run_setup --non-interactive >"${tmp_dir}/output" 2>&1; then
    printf 'Setup unexpectedly completed for %s\n' "${scenario}" >&2
    exit 1
  fi
  ! grep -q '^\[autark-os\] Setup complete\.$' "${tmp_dir}/output"
done

printf optional >"${scenario_file}"
run_setup --non-interactive --acknowledge-optional-work >"${tmp_dir}/output"
grep -q 'Setup complete.' "${tmp_dir}/output"
grep -q 'FINISH {"acknowledgeOptionalWork":true}' "${request_log}"

printf lost-committed >"${scenario_file}"
run_setup --non-interactive >"${tmp_dir}/output" 2>&1
grep -q 'Setup complete.' "${tmp_dir}/output"
grep -q '/access?tab=advanced' "${tmp_dir}/output"

printf already-complete >"${scenario_file}"
before="$(grep -c '^SETUP ' "${request_log}")"
run_setup --non-interactive >"${tmp_dir}/output"
[[ "$(grep -c '^SETUP ' "${request_log}")" == "${before}" ]]
grep -q 'already complete' "${tmp_dir}/output"

printf interactive >"${scenario_file}"
printf '\n\n\nn\nn\nn\nn\n' | run_setup >"${tmp_dir}/output"
grep -q 'FreshRSS: Read your feeds.' "${tmp_dir}/output"
grep -q 'Homepage: Your start page.' "${tmp_dir}/output"
grep -q 'Syncthing: Sync your files.' "${tmp_dir}/output"
python3 - "${request_log}" "${runtime_dir}" <<'PYASSERT'
import json, sys
requests = [json.loads(line[6:]) for line in open(sys.argv[1]) if line.startswith("SETUP ")]
assert all(body["recommendedApps"] == [] for body in requests), requests
assert all(body["backupPosture"] == "external" for body in requests), requests
assert all(body["automaticBackupsEnabled"] is False for body in requests), requests
assert all(body["backupDestination"] == sys.argv[2] + "/external" for body in requests), requests
PYASSERT

printf hard-blocker >"${scenario_file}"
if run_setup --non-interactive --acknowledge-optional-work >"${tmp_dir}/output" 2>&1; then
  printf 'Optional acknowledgement bypassed a hard blocker.\n' >&2
  exit 1
fi

printf this-device >"${scenario_file}"
printf '\nthis-device\n\n\n\n\n' | run_setup >"${tmp_dir}/output"
python3 - "${request_log}" "${runtime_dir}" <<'PYASSERT'
import json, sys
body = [json.loads(line[6:]) for line in open(sys.argv[1]) if line.startswith("SETUP ")][-1]
assert body["backupPosture"] == "routine", body
assert body["backupDestination"] == sys.argv[2] + "/backups", body
assert body["automaticBackupsEnabled"] is False, body
assert body["recommendedApps"] == [], body
PYASSERT

printf later >"${scenario_file}"
printf '\nlater\n\n\n\n' | run_setup >"${tmp_dir}/output"
python3 - "${request_log}" <<'PYASSERT'
import json, sys
body = [json.loads(line[6:]) for line in open(sys.argv[1]) if line.startswith("SETUP ")][-1]
assert body["backupPosture"] == "later", body
assert "backupDestination" not in body, body
assert body["automaticBackupsEnabled"] is False, body
assert body["recommendedApps"] == [], body
PYASSERT

# Compact HTTP JSON has no trailing newline. Every selected ID must survive parsing,
# and accepting defaults must preserve the same roster as --non-interactive.
for scenario in selected-non-interactive selected-default-input selected-none; do
  printf '%s' "${scenario}" >"${scenario_file}"
  case "${scenario}" in
    selected-non-interactive) run_setup --non-interactive >"${tmp_dir}/output" ;;
    selected-default-input) run_setup </dev/null >"${tmp_dir}/output" ;;
    selected-none) printf '\n\n\n\nn\nn\nn\n' | run_setup >"${tmp_dir}/output" ;;
  esac
  python3 - "${request_log}" "${scenario}" <<'PYROSTER'
import json, sys
body = [json.loads(line[6:]) for line in open(sys.argv[1]) if line.startswith("SETUP ")][-1]
expected = [] if sys.argv[2] == "selected-none" else ["freshrss", "homepage", "syncthing"]
assert body["recommendedApps"] == expected, (sys.argv[2], body)
PYROSTER
done

printf 'CLI setup parity scenarios passed.\n'
